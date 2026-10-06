import { expect, test } from 'bun:test';
import { FakeClock } from '../../../shared/focus/clock';
import type { PersistedState, SettingsPatch } from '../../../shared/focus/types';
import { TimerService } from '../../../main/focus/timer-service';
import { readSnoreSetting, saveSettingsDraft, SettingsSaveError } from './settings-save';

const draft = { patch: { soundEnabled: true }, snoreSound: true, taskName: 'next focus' };

test('save waits for primary persistence and snore acknowledgement before writing the task', async () => {
  const calls: string[] = [];
  let acceptPrimary!: () => void;
  let acceptSnore!: () => void;
  const saving = saveSettingsDraft(draft, {
    savePrimary: async () => { calls.push('primary'); await new Promise<void>(resolve => { acceptPrimary = resolve; }); return { ok: true }; },
    saveSnore: async () => { calls.push('snore'); await new Promise<void>(resolve => { acceptSnore = resolve; }); return true; },
    saveTask: value => { calls.push(`task:${value}`); },
  });
  expect(calls).toEqual(['primary']);
  acceptPrimary();
  await Promise.resolve();
  await Promise.resolve();
  expect(calls).toEqual(['primary', 'snore']);
  acceptSnore();
  await saving;
  expect(calls).toEqual(['primary', 'snore', 'task:next focus']);
});

test('primary failure skips both secondary stores; retry with an empty patch still retries persistence', async () => {
  let writes = 0;
  let fail = true;
  const calls: string[] = [];
  const dependencies = {
    savePrimary: async () => { writes++; return fail ? { ok: false as const, message: 'SAVE_FAILED' } : { ok: true as const }; },
    saveSnore: async () => { calls.push('snore'); return true; },
    saveTask: () => { calls.push('task'); },
  };
  await expect(saveSettingsDraft(draft, dependencies)).rejects.toMatchObject({ stage: 'primary' });
  expect(calls).toEqual([]);
  await expect(saveSettingsDraft({ ...draft, patch: {} }, dependencies)).rejects.toMatchObject({ stage: 'primary' });
  expect(writes).toBe(2);
  expect(calls).toEqual([]);
  fail = false;
  await saveSettingsDraft({ ...draft, patch: {} }, dependencies);
  expect(writes).toBe(3);
  expect(calls).toEqual(['snore', 'task']);
});

test('an idle TimerService applied-in-memory failure is not acknowledged until an empty-patch retry persists', async () => {
  let fail = false;
  let attempts = 0;
  let stored: PersistedState | null = null;
  const service = new TimerService({
    clock: new FakeClock({ wall: Date.UTC(2026, 9, 6), tz: 'UTC' }),
    scheduler: { setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} },
    store: { load: async () => ({ state: null, source: 'fresh' }), save: async state => { attempts++; if (fail) throw new Error('write failed'); stored = structuredClone(state); } },
    notifier: { notify: () => {}, beep: () => {} },
    broadcast: () => {}, log: () => {},
  });
  const secondary: string[] = [];
  const dependencies = {
    savePrimary: (patch: SettingsPatch) => service.dispatch({ type: 'updateSettings', patch }),
    saveSnore: async () => { secondary.push('snore'); return true; },
    saveTask: () => { secondary.push('task'); },
  };
  try {
    await service.init();
    fail = true;
    await expect(saveSettingsDraft(draft, dependencies)).rejects.toMatchObject({ stage: 'primary' });
    expect(service.getSnapshot().settings.soundEnabled).toBe(true);
    expect(service.getSnapshot().persistence.ok).toBe(false);
    expect((stored as PersistedState | null)?.settings.soundEnabled).toBe(false);
    await expect(saveSettingsDraft({ ...draft, patch: {} }, dependencies)).rejects.toMatchObject({ stage: 'primary' });
    expect(attempts).toBe(3);
    expect(secondary).toEqual([]);
    fail = false;
    await saveSettingsDraft({ ...draft, patch: {} }, dependencies);
    expect(attempts).toBe(4);
    expect((stored as PersistedState | null)?.settings.soundEnabled).toBe(true);
    expect(service.getSnapshot().persistence.ok).toBe(true);
    expect(secondary).toEqual(['snore', 'task']);
  } finally { service.dispose(); }
});

test('snore rejection preserves the task and reports the confirmed primary save without total success', async () => {
  let task = 'previous task';
  const failure = await saveSettingsDraft(draft, {
    savePrimary: async () => ({ ok: true }),
    saveSnore: async () => { throw new Error('EISDIR'); },
    saveTask: value => { task = value; },
  }).catch(error => error);
  expect(failure).toBeInstanceOf(SettingsSaveError);
  expect(failure.stage).toBe('snore');
  expect(failure.message).toContain('타이머 설정은 저장했지만');
  expect(task).toBe('previous task');
});

test('missing or incorrect snore acknowledgements cannot resolve the save or change the task', async () => {
  for (const accepted of [undefined, null, 'true', false]) {
    let task = 'previous task';
    await expect(saveSettingsDraft(draft, {
      savePrimary: async () => ({ ok: true }),
      saveSnore: async () => accepted,
      saveTask: value => { task = value; },
    })).rejects.toMatchObject({ stage: 'snore' });
    expect(task).toBe('previous task');
  }
});

test('task storage failure reports that primary and snore preferences already saved', async () => {
  const failure = await saveSettingsDraft(draft, {
    savePrimary: async () => ({ ok: true }),
    saveSnore: async () => true,
    saveTask: () => { throw new Error('QuotaExceededError'); },
  }).catch(error => error);
  expect(failure.stage).toBe('task');
  expect(failure.message).toContain('타이머·코골이 설정은 저장했지만');
});

test('initial snore read awaits and preserves a valid enabled preference', async () => {
  let reply!: (value: unknown) => void;
  let loaded = false;
  const reading = readSnoreSetting(() => new Promise(resolve => { reply = resolve; })).then(value => { loaded = true; return value; });
  await Promise.resolve();
  expect(loaded).toBe(false);
  reply(true);
  expect(await reading).toBe(true);
  expect(await readSnoreSetting(async () => false)).toBe(false);
});

test('initial read rejects non-boolean responses and bridge failure instead of treating them as disabled', async () => {
  for (const value of [undefined, null, 1, 'true']) await expect(readSnoreSetting(async () => value)).rejects.toThrow('코골이 설정을 읽지 못했어요');
  await expect(readSnoreSetting(async () => { throw new Error('bridge unavailable'); })).rejects.toThrow('bridge unavailable');
});
