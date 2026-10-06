import { describe, expect, test } from 'bun:test';
import { FakeClock } from '../../shared/focus/clock';
import { PRESETS } from '../../shared/focus/constants';
import { createEmptyState } from '../../shared/focus/state';
import type { DispatchResult, PersistedState, Snapshot } from '../../shared/focus/types';
import type { LoadResult } from './store';
import { TimerService } from './timer-service';

const START = Date.UTC(2026, 8, 30, 0, 0, 0); // 서울 09-30 09:00
const FOCUS_MS = 1500000;

const clone = (s: PersistedState): PersistedState => JSON.parse(JSON.stringify(s));

// advance(ms): 만기 순서대로 시계를 그 시각으로 옮긴 뒤 콜백을 실행하고, 콜백이 돌려준 Promise를 모아 돌려준다.
class FakeScheduler {
  private readonly timers = new Map<number, { at: number; every: number | null; fn: () => unknown }>();
  private seq = 0;

  constructor(private readonly clock: FakeClock) {}

  get size(): number {
    return this.timers.size;
  }

  setTimeout(fn: () => unknown, ms: number): unknown {
    return this.add(fn, ms, null);
  }

  setInterval(fn: () => unknown, ms: number): unknown {
    return this.add(fn, ms, ms);
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.timers.delete(handle);
  }

  clearInterval(handle: unknown): void {
    this.clearTimeout(handle);
  }

  advance(ms: number): Promise<unknown[]> {
    const end = this.clock.mono() + ms;
    const pending: unknown[] = [];
    for (;;) {
      let due: number | null = null;
      for (const [id, t] of this.timers) {
        if (t.at > end) continue;
        const best = due === null ? undefined : this.timers.get(due);
        if (!best || t.at < best.at) due = id;
      }
      const timer = due === null ? undefined : this.timers.get(due);
      if (due === null || !timer) break;
      this.clock.advance(Math.max(0, timer.at - this.clock.mono()));
      if (timer.every === null) this.timers.delete(due);
      else timer.at += timer.every;
      pending.push(timer.fn());
    }
    this.clock.advance(end - this.clock.mono());
    return Promise.all(pending);
  }

  private add(fn: () => unknown, ms: number, every: number | null): number {
    this.seq += 1;
    this.timers.set(this.seq, { at: this.clock.mono() + ms, every, fn });
    return this.seq;
  }
}

class MemoryStore {
  saved: PersistedState[] = [];
  loadResult: LoadResult | null = null;
  loadError: Error | null = null;
  saveError: Error | null = null;
  slowTurns: number[] = []; // 저장 호출마다 마이크로태스크를 이만큼 양보한 뒤 기록한다
  hang = false;

  get last(): PersistedState {
    const last = this.saved.at(-1);
    if (!last) throw new Error('nothing saved yet');
    return last;
  }

  async load(): Promise<LoadResult> {
    if (this.loadError) throw this.loadError;
    if (this.loadResult) return this.loadResult;
    const last = this.saved.at(-1);
    return last ? { state: clone(last), source: 'main' } : { state: null, source: 'fresh' };
  }

  async save(state: PersistedState): Promise<void> {
    if (this.hang) return new Promise<void>(() => undefined);
    const turns = this.slowTurns.shift() ?? 0;
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
    if (this.saveError) throw this.saveError;
    this.saved.push(clone(state));
  }
}

function make(opts: { store?: MemoryStore; clock?: FakeClock } = {}) {
  const clock = opts.clock ?? new FakeClock({ wall: START, tz: 'Asia/Seoul' });
  const sched = new FakeScheduler(clock);
  const store = opts.store ?? new MemoryStore();
  const calls = { beep: 0, notify: 0 };
  const broadcasts: Snapshot[] = [];
  const logs: string[] = [];
  const service = new TimerService({
    clock,
    scheduler: sched,
    store,
    notifier: {
      beep: () => void (calls.beep += 1),
      notify: () => void (calls.notify += 1),
    },
    broadcast: (s) => void broadcasts.push(s),
    log: (message) => void logs.push(message),
  });
  return { clock, sched, store, calls, broadcasts, logs, service };
}

// init까지 끝낸 뒤 init이 만든 저장·broadcast 기록을 비운 상태로 시작한다.
async function ready(opts: { store?: MemoryStore; clock?: FakeClock } = {}) {
  const env = make(opts);
  await env.service.init();
  env.store.saved.length = 0;
  env.broadcasts.length = 0;
  return env;
}

const codeOf = (r: DispatchResult): string => (r.ok ? 'OK' : r.code);
const eacces = (): Error => Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });

describe('TimerService', () => {
  test('S1 startFocus는 저장 1회·broadcast 1회, 그리고 tick이 돌기 시작한다', async () => {
    const { service, store, broadcasts, sched } = await ready();

    const r = await service.dispatch({ type: 'startFocus', taskName: '기획서 작성' });

    expect(codeOf(r)).toBe('OK');
    expect(r.snapshot).toMatchObject({ status: 'running', phase: 'focus', taskName: '기획서 작성' });
    expect(store.saved).toHaveLength(1);
    expect(store.last.active).toMatchObject({ status: 'running' });
    expect(broadcasts).toHaveLength(1);

    await sched.advance(1000);
    expect(broadcasts).toHaveLength(2);
    expect(broadcasts[1].remainingMs).toBe(FOCUS_MS - 1000);
  });

  test('S2 완료 효과는 완료마다 한 번만, 재시작해도 다시 울리지 않는다', async () => {
    const off = await ready();
    await off.service.dispatch({ type: 'startFocus', taskName: '' });
    await off.sched.advance(FOCUS_MS);
    expect(off.service.getSnapshot()).toMatchObject({ status: 'awaiting_next', suggestedNext: 'short_break' });
    expect(off.calls).toEqual({ beep: 0, notify: 0 });

    const on = await ready();
    await on.service.dispatch({ type: 'updateSettings', patch: { soundEnabled: true, osNotificationEnabled: true } });
    await on.service.dispatch({ type: 'startFocus', taskName: '' });
    await on.sched.advance(FOCUS_MS);
    expect(on.service.getSnapshot().status).toBe('awaiting_next');
    expect(on.calls).toEqual({ beep: 1, notify: 1 });

    await on.service.tick();
    await on.service.tick();
    await on.sched.advance(10000);
    expect(on.calls).toEqual({ beep: 1, notify: 1 });
    expect(on.store.last.completions.map((c) => c.effectsHandled)).toEqual([true]);

    await on.service.dispatch({ type: 'startNext', taskName: '' });
    await on.sched.advance(300000);
    expect(on.service.getSnapshot()).toMatchObject({ status: 'awaiting_next', suggestedNext: 'focus' });
    expect(on.calls).toEqual({ beep: 2, notify: 2 });
    expect(on.store.last.completions.map((c) => c.effectsHandled)).toEqual([true, true]);

    const again = make({ store: on.store, clock: on.clock });
    const snapshot = await again.service.init();
    expect(snapshot.status).toBe('awaiting_next');
    expect(snapshot.today.completedFocusCount).toBe(1);
    expect(again.calls).toEqual({ beep: 0, notify: 0 });
  });

  test('S3 실행 중 5초마다 스냅샷을 저장하고 저장본의 경과가 늘어난다', async () => {
    const { service, store, sched } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });

    await sched.advance(12000);

    expect(store.saved.map((s) => s.sessions[0].elapsedMs)).toEqual([0, 5000, 10000]);
    expect(service.getSnapshot().persistence).toEqual({ ok: true, lastSavedAt: START + 10000, error: null });
  });

  test('S4 저장 실패는 SAVE_FAILED와 persistence.ok false로 드러나고 다음 성공 때 풀린다', async () => {
    const { service, store } = await ready();
    store.saveError = eacces();

    const r = await service.dispatch({ type: 'startFocus', taskName: '' });

    expect(codeOf(r)).toBe('SAVE_FAILED');
    expect(r.snapshot.status).toBe('running');
    expect(r.snapshot.persistence.ok).toBe(false);
    expect(r.snapshot.persistence.error).not.toBeNull();
    expect(service.getSnapshot().persistence.ok).toBe(false);
    expect(store.saved).toHaveLength(0);

    store.saveError = new TypeError('save rejected: state is not a schemaVersion 1 PersistedState');
    await service.saveNow();
    expect(service.getSnapshot().persistence.ok).toBe(false);

    store.saveError = null;
    await service.saveNow();
    expect(service.getSnapshot().persistence).toMatchObject({ ok: true, error: null });
    expect(store.last.active).toMatchObject({ status: 'running' });
  });

  test('S5 절전이면 일시정지해 저장하고, 복귀해도 자동 재개하지 않는다', async () => {
    const { service, store, sched, broadcasts } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(300000);

    await service.onSuspend();

    expect(service.getSnapshot()).toMatchObject({ status: 'paused', remainingMs: 1200000, recovery: { kind: 'sleep' } });
    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'sleep' });
    expect(store.last.sessions[0].elapsedMs).toBe(300000);
    expect(sched.size).toBe(0);

    const before = broadcasts.length;
    service.onResumeFromSleep();
    expect(broadcasts).toHaveLength(before + 1);
    await sched.advance(600000);
    expect(service.getSnapshot()).toMatchObject({ status: 'paused', remainingMs: 1200000 });
  });

  test('S6 실행 중 flushOnQuit은 paused(quit)로 저장한다', async () => {
    const { service, store, sched } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(60000);

    await service.flushOnQuit();

    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'quit' });
    expect(store.last.sessions[0].elapsedMs).toBe(60000);
    expect(sched.size).toBe(0);
  });

  test('S7 running 저장본으로 init하면 paused + crash 복구 + lastSavedAt', async () => {
    const crashed = await ready();
    await crashed.service.dispatch({ type: 'startFocus', taskName: '보고서' });
    await crashed.sched.advance(10000);
    expect(crashed.store.last.active).toMatchObject({ status: 'running' });
    crashed.clock.advance(4000); // 저장되지 않은 채 죽은 구간

    const next = make({ store: crashed.store, clock: crashed.clock });
    const snapshot = await next.service.init();

    expect(snapshot).toMatchObject({ status: 'paused', taskName: '보고서', remainingMs: FOCUS_MS - 10000 });
    expect(snapshot.recovery).toEqual({ kind: 'crash', at: START + 14000, lastSavedAt: START + 10000 });
    expect(snapshot.today.completedFocusCount).toBe(0);
    expect(next.sched.size).toBe(0);
  });

  test('S8 모르는 명령은 INVALID, 저장·broadcast 없음', async () => {
    const { service, store, broadcasts } = await ready();

    const r = await service.dispatch({ type: 'nope' });

    expect(codeOf(r)).toBe('INVALID');
    expect(store.saved).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });

  test('S9 idle에서 pause는 IGNORED, 저장 없음', async () => {
    const { service, store } = await ready();

    const r = await service.dispatch({ type: 'pause' });

    expect(codeOf(r)).toBe('IGNORED');
    expect(r.snapshot.status).toBe('idle');
    expect(store.saved).toHaveLength(0);
  });

  test('S10 tick이 40초 동안 오지 않으면 다음 tick에서 stall 일시정지', async () => {
    const { service, store, sched, clock } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(10000);

    clock.advance(40000);
    await service.tick();

    expect(service.getSnapshot()).toMatchObject({ status: 'paused', remainingMs: FOCUS_MS - 10000, recovery: { kind: 'stall' } });
    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'stall' });
    expect(store.last.sessions[0].elapsedMs).toBe(10000);
    expect(sched.size).toBe(0);
  });

  test('S11 backup·손상 뒤 fresh로 읽으면 각 복구 안내를 남기고 바로 저장한다', async () => {
    const backup = make();
    backup.store.loadResult = { state: createEmptyState(START - 5000), source: 'backup', corruptPath: '/data/c.json', error: 'x' };
    expect((await backup.service.init()).recovery).toEqual({ kind: 'backup', at: START, corruptPath: '/data/c.json' });
    expect(backup.store.last.recovery).toMatchObject({ kind: 'backup' });

    const fresh = make();
    fresh.store.loadResult = { state: null, source: 'fresh', corruptPath: '/data/c.json', error: 'x' };
    expect((await fresh.service.init()).recovery).toEqual({ kind: 'fresh-after-corrupt', at: START, corruptPath: '/data/c.json' });
    expect(fresh.store.last.recovery).toMatchObject({ kind: 'fresh-after-corrupt' });

    const plain = make();
    expect((await plain.service.init()).recovery).toBeNull();
    expect(plain.store.saved).toHaveLength(1);
  });
});

describe('TimerService 계약', () => {
  test('명령보다 tick이 먼저: 계획 길이에 닿은 뒤의 finishCurrent는 완료를 중단으로 바꾸지 못한다', async () => {
    const { service, store, sched, clock } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(FOCUS_MS - 1000);
    clock.advance(1000); // 스케줄러 tick이 아직 오지 않은 채 계획 길이에 도달

    const r = await service.dispatch({ type: 'finishCurrent' });

    expect(codeOf(r)).toBe('IGNORED');
    expect(r.snapshot).toMatchObject({ status: 'awaiting_next', suggestedNext: 'short_break' });
    expect(store.last.sessions[0]).toMatchObject({ status: 'completed', elapsedMs: FOCUS_MS });
    expect(store.last.completions).toHaveLength(1);
  });

  test('load가 reject하면 메모리에서만 동작하고 저장을 시도하지 않는다', async () => {
    const { service, store, sched, logs } = make();
    store.loadError = eacces();

    const snapshot = await service.init();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.persistence.ok).toBe(false);
    expect(snapshot.persistence.error).not.toBeNull();

    const r = await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(12000);
    await service.saveNow();
    await service.flushOnQuit();

    expect(codeOf(r)).toBe('SAVE_FAILED');
    expect(r.snapshot.status).toBe('running');
    expect(service.getSnapshot().persistence.ok).toBe(false);
    expect(store.saved).toHaveLength(0);
    expect(logs).toHaveLength(1);
  });

  test('잘못된 tz 구간이 있어도 Snapshot은 만들어지고 오류가 드러난다', async () => {
    const bad = createEmptyState(START);
    bad.sessions.push({
      id: 's1',
      phase: 'focus',
      taskName: '',
      plannedSeconds: 1500,
      elapsedMs: 60000,
      status: 'interrupted',
      startedAt: START,
      endedAt: START + 60000,
      completedAt: null,
      tz: 'Not/AZone',
    });
    bad.segments.push({ id: 'g1', sessionId: 's1', startAt: START, endAt: START + 60000, elapsedMs: 60000, tz: 'Not/AZone' });
    const { service, store, logs } = make();
    store.loadResult = { state: bad, source: 'main' };

    const snapshot = await service.init();
    service.getSnapshot();

    expect(snapshot.status).toBe('idle');
    expect(snapshot.today).toMatchObject({ focusSeconds: 0, completedFocusCount: 0, byTask: [], sessions: [] });
    expect(snapshot.persistence.ok).toBe(true);
    expect(snapshot.persistence.error).not.toBeNull();
    expect(logs).toHaveLength(1);
    expect(codeOf(await service.dispatch({ type: 'startFocus', taskName: '' }))).toBe('OK');
    expect(store.last.segments).toHaveLength(2);
  });

  test('updateSettings는 보낸 키만 현재 설정에 병합한다', async () => {
    const { service, store } = await ready();

    await service.dispatch({ type: 'updateSettings', patch: { soundEnabled: true } });
    const r = await service.dispatch({ type: 'updateSettings', patch: { preset: 'long' } });

    expect(codeOf(r)).toBe('OK');
    expect(r.snapshot.settings).toEqual({
      preset: 'long',
      durations: { ...PRESETS.long },
      soundEnabled: true,
      osNotificationEnabled: false,
      alwaysOnTop: true,
      trayHintSeen: false,
    });
    expect(store.last.settings).toEqual(r.snapshot.settings);
    expect(r.snapshot.remainingMs).toBe(3000000);
  });

  test('idle에서 endWork는 IGNORED가 아니고 저장도 하지 않는다', async () => {
    const { service, store } = await ready();

    const r = await service.dispatch({ type: 'endWork' });

    expect(codeOf(r)).toBe('OK');
    expect(r.snapshot.status).toBe('idle');
    expect(store.saved).toHaveLength(0);
  });

  test('저장본에 효과 미처리 완료가 남아 있어도 init은 울리지 않고 처리됨으로 저장한다', async () => {
    const done = await ready();
    await done.service.dispatch({ type: 'updateSettings', patch: { soundEnabled: true, osNotificationEnabled: true } });
    await done.service.dispatch({ type: 'startFocus', taskName: '' });
    await done.sched.advance(FOCUS_MS);
    const stale = clone(done.store.last);
    stale.completions[0].effectsHandled = false;

    const next = make({ clock: done.clock });
    next.store.loadResult = { state: stale, source: 'main' };
    await next.service.init();
    await next.service.tick();

    expect(next.calls).toEqual({ beep: 0, notify: 0 });
    expect(next.store.last.completions.map((c) => c.effectsHandled)).toEqual([true]);
  });

  test('await하지 않은 dispatch 5개도 순서대로 처리되고 마지막 상태가 마지막에 저장된다', async () => {
    const { service, store } = await ready();
    store.slowTurns = [20]; // 첫 저장만 느리다: 저장을 직렬화하지 않으면 옛 상태가 마지막에 기록된다

    const results = await Promise.all([
      service.dispatch({ type: 'startFocus', taskName: '' }),
      service.dispatch({ type: 'pause' }),
      service.dispatch({ type: 'resume' }),
      service.dispatch({ type: 'pause' }),
      service.dispatch({ type: 'finishCurrent' }),
    ]);

    expect(results.map(codeOf)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK']);
    expect(results.map((r) => r.snapshot.status)).toEqual(['running', 'paused', 'running', 'paused', 'awaiting_next']);
    expect(store.saved.map((s) => s.active?.status ?? null)).toEqual(['running', 'paused', 'running', 'paused', null]);
    expect(store.last.sessions[0].status).toBe('interrupted');
    expect(store.last.awaiting).toEqual({ suggested: 'focus' });
  });

  test('flushOnQuit 도중·이후의 dispatch는 무시되고 두 번 불러도 안전하다', async () => {
    const { service, store, sched } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    await sched.advance(5000);

    const quitting = service.flushOnQuit();
    const during = await service.dispatch({ type: 'resume' });
    await quitting;
    const saves = store.saved.length;
    await service.flushOnQuit();
    await service.tick();
    await service.onSuspend();

    expect(codeOf(during)).toBe('IGNORED');
    expect(store.saved).toHaveLength(saves);
    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'quit' });
    expect(sched.size).toBe(0);
  });

  test('flushOnQuit은 저장이 끝나지 않아도 3초 뒤 기다림을 멈춘다', async () => {
    const { service, store, sched } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    store.hang = true;

    const quitting = service.flushOnQuit();
    await sched.advance(3000);
    await quitting;

    expect(service.getSnapshot().status).toBe('paused');
    expect(sched.size).toBe(0);
  });

  test('awaiting_next·paused·idle 저장본으로 init하면 저장 전과 같은 Snapshot이다', async () => {
    const reach: Array<[string, Array<Record<string, unknown>>]> = [
      ['awaiting_next', [{ type: 'startFocus', taskName: 'a' }, { type: 'finishCurrent' }]],
      ['paused', [{ type: 'startFocus', taskName: 'b' }, { type: 'pause' }]],
      ['idle', [{ type: 'startFocus', taskName: 'c' }, { type: 'endWork' }]],
    ];
    for (const [status, commands] of reach) {
      const first = await ready();
      for (const command of commands) {
        await first.service.dispatch(command);
        await first.sched.advance(7000);
      }
      const before = first.service.getSnapshot();
      first.service.dispose();

      const second = make({ store: first.store, clock: first.clock });
      const after = await second.service.init();

      expect(before.status).toBe(status as Snapshot['status']);
      expect(after).toEqual({ ...before, persistence: after.persistence });
      expect(after.persistence).toMatchObject({ ok: true, error: null });
    }
  });

  async function stalledAt10s() {
    const env = await ready();
    await env.service.dispatch({ type: 'startFocus', taskName: '' });
    await env.sched.advance(10000);
    env.clock.advance(600000);
    return env;
  }

  test('정체 뒤 onSuspend는 sleep 사유를 지킨다', async () => {
    const { service, store } = await stalledAt10s();

    await service.onSuspend();

    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'sleep' });
    expect(store.last.recovery?.kind).toBe('sleep');
    expect(store.last.sessions[0].elapsedMs).toBe(10000);
  });

  test('정체 뒤 flushOnQuit은 quit 사유를 지키고 재시작 때 quit 안내', async () => {
    const { service, store, clock } = await stalledAt10s();

    await service.flushOnQuit();

    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'quit' });
    const next = make({ store, clock });
    const snapshot = await next.service.init();
    expect(snapshot.recovery?.kind).toBe('quit');
    expect(snapshot.remainingMs).toBe(1490000);
  });

  test('정체 뒤 사용자 pause는 user 사유로 남는다', async () => {
    const { service, store } = await stalledAt10s();

    const r = await service.dispatch({ type: 'pause' });

    expect(codeOf(r)).toBe('OK');
    expect(store.last.active).toMatchObject({ status: 'paused', pausedBy: 'user' });
    expect(store.last.sessions[0].elapsedMs).toBe(10000);
  });

  test('dispose하면 남은 타이머가 없다', async () => {
    const { service, sched } = await ready();
    await service.dispatch({ type: 'startFocus', taskName: '' });
    expect(sched.size).toBe(3);

    service.dispose();

    expect(sched.size).toBe(0);
  });

  const invalid: Array<[string, unknown]> = [
    ['null', null],
    ['배열', []],
    ['모르는 type', { type: 'nope' }],
    ['범위 밖 설정', { type: 'updateSettings', patch: { durations: { focusMin: 181, shortBreakMin: 5, longBreakMin: 15 } } }],
  ];
  test.each(invalid)('잘못된 입력(%s)은 INVALID, 저장·broadcast 없음', async (_name, input) => {
    const { service, store, broadcasts } = await ready();

    const r = await service.dispatch(input);

    expect(codeOf(r)).toBe('INVALID');
    expect(r.snapshot.settings.durations.focusMin).toBe(25);
    expect(store.saved).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });
});
