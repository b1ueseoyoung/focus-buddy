import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createEmptyState } from '../../shared/focus/state';
import type { PersistedState } from '../../shared/focus/types';
import { JsonStore, isPersistedState } from './store';

const MAIN = 'focus-buddy.json';
const BAK = 'focus-buddy.json.bak';
const TMP = 'focus-buddy.json.tmp';
const NOW = Date.UTC(2026, 9, 1, 2, 3, 4, 5);
const STAMP = '20261001T020304005';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-store-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true });
});

function stateAt(savedAt: number): PersistedState {
  return createEmptyState(savedAt);
}

function populated(): PersistedState {
  return {
    ...createEmptyState(10),
    sessions: [
      {
        id: 's1',
        phase: 'focus',
        taskName: '글쓰기',
        plannedSeconds: 1500,
        elapsedMs: 1000,
        status: 'paused',
        startedAt: 1,
        endedAt: null,
        completedAt: null,
        tz: 'Asia/Seoul',
      },
    ],
    segments: [{ id: 'g1', sessionId: 's1', startAt: 1, endAt: 2, elapsedMs: 1000, tz: 'Asia/Seoul' }],
    active: { sessionId: 's1', status: 'paused', openSegmentId: null, pausedBy: 'user' },
    awaiting: { suggested: 'short_break' },
    completions: [{ sessionId: 's0', completedAt: 5, effectsHandled: true }],
    recovery: { kind: 'backup', at: 9, corruptPath: '/x' },
    celebration: { sessionId: 's0', phase: 'focus' },
  };
}

const read = (name: string) => fs.readFile(path.join(dir, name), 'utf8');
const put = (name: string, text: string) => fs.writeFile(path.join(dir, name), text);
const list = async () => (await fs.readdir(dir)).sort();

function eacces(): Error {
  return Object.assign(new Error('EACCES: permission denied, rename'), { code: 'EACCES' });
}

describe('JsonStore.save', () => {
  test('첫 저장 뒤에는 main만 있다 (bak·tmp 없음)', async () => {
    const store = new JsonStore(dir);
    await store.save(stateAt(1));
    expect(await list()).toEqual([MAIN]);
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(1));
  });

  test('두 번째 저장 뒤 bak은 첫 내용, main은 두 번째 내용', async () => {
    const store = new JsonStore(dir);
    await store.save(stateAt(1));
    await store.save(stateAt(2));
    expect(await list()).toEqual([MAIN, BAK]);
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(2));
    expect(JSON.parse(await read(BAK))).toEqual(stateAt(1));
  });

  test('없는 폴더도 만들어서 저장한다', async () => {
    const nested = path.join(dir, 'a', 'b');
    await new JsonStore(nested).save(stateAt(1));
    expect(await fs.readdir(nested)).toEqual([MAIN]);
  });

  test('rename이 EACCES면 reject, main 불변, tmp 없음', async () => {
    await new JsonStore(dir).save(stateAt(1));
    const before = await read(MAIN);
    const failing = new JsonStore(dir, {
      fs: {
        ...fs,
        rename: async () => {
          throw eacces();
        },
      },
    });
    await expect(failing.save(stateAt(2))).rejects.toMatchObject({ code: 'EACCES' });
    expect(await read(MAIN)).toBe(before);
    expect(await list()).not.toContain(TMP);
  });

  test('기다리지 않은 save 3회 뒤 main은 마지막 값이고 파싱 가능', async () => {
    const store = new JsonStore(dir);
    const pending = [store.save(stateAt(1)), store.save(stateAt(2)), store.save(stateAt(3))];
    await Promise.all(pending);
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(3));
    expect(JSON.parse(await read(BAK))).toEqual(stateAt(2));
    expect(await list()).toEqual([MAIN, BAK]);
  });

  test('앞 저장이 실패해도 뒤 저장은 성공한다', async () => {
    let calls = 0;
    const store = new JsonStore(dir, {
      fs: {
        ...fs,
        rename: async (from, to) => {
          calls += 1;
          if (calls === 1) throw eacces();
          return fs.rename(from, to);
        },
      },
    });
    const first = store.save(stateAt(1));
    const second = store.save(stateAt(2));
    await expect(first).rejects.toMatchObject({ code: 'EACCES' });
    await second;
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(2));
    expect(await list()).toEqual([MAIN]);
  });

  test('load 없이 저장해도 손상된 main이 정상 bak을 덮어쓰지 않는다', async () => {
    const first = new JsonStore(dir);
    await first.save(stateAt(1));
    await first.save(stateAt(2));
    await put(MAIN, '{broken');

    await new JsonStore(dir, { now: () => NOW }).save(stateAt(3));

    const corruptName = `focus-buddy.corrupt-${STAMP}.json`;
    expect(JSON.parse(await read(BAK))).toEqual(stateAt(1));
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(3));
    expect(await read(corruptName)).toBe('{broken');
    expect(await list()).toEqual([corruptName, MAIN, BAK]);
  });

  test('schemaVersion 2인 main도 저장 때 보존되고 bak은 그대로', async () => {
    const future = JSON.stringify({ ...createEmptyState(9), schemaVersion: 2 });
    await put(BAK, JSON.stringify(stateAt(1)));
    await put(MAIN, future);

    await new JsonStore(dir, { now: () => NOW }).save(stateAt(3));

    const corruptName = `focus-buddy.corrupt-${STAMP}.json`;
    expect(await read(corruptName)).toBe(future);
    expect(JSON.parse(await read(BAK))).toEqual(stateAt(1));
    expect(JSON.parse(await read(MAIN))).toEqual(stateAt(3));
  });

  test('NaN이 든 상태는 reject, main·bak 바이트 불변, tmp 없음', async () => {
    const store = new JsonStore(dir);
    await store.save(stateAt(1));
    await store.save(stateAt(2));
    const before = { main: await read(MAIN), bak: await read(BAK) };

    await expect(store.save({ ...stateAt(3), savedAt: Number.NaN })).rejects.toThrow(TypeError);
    await expect(
      store.save({ ...stateAt(3), cycle: { completedFocusCount: Number.POSITIVE_INFINITY } }),
    ).rejects.toThrow(TypeError);

    expect({ main: await read(MAIN), bak: await read(BAK) }).toEqual(before);
    expect(await list()).toEqual([MAIN, BAK]);
  });

  test('직렬화하면 형태가 달라지는 상태는 아무 파일도 만들지 않고 reject', async () => {
    const nested = path.join(dir, 'never-created');
    const lossy = Object.assign(stateAt(1), { toJSON: () => ({}) });

    await expect(new JsonStore(nested).save(lossy)).rejects.toThrow(TypeError);

    expect(await list()).toEqual([]);
  });

  test('저장 중 main 읽기가 EACCES면 reject, main·bak 불변, tmp 없음', async () => {
    const store = new JsonStore(dir);
    await store.save(stateAt(1));
    await store.save(stateAt(2));
    const before = { main: await read(MAIN), bak: await read(BAK) };
    const failing = new JsonStore(dir, {
      fs: {
        ...fs,
        readFile: (async () => {
          throw eacces();
        }) as typeof fs.readFile,
      },
    });

    await expect(failing.save(stateAt(3))).rejects.toMatchObject({ code: 'EACCES' });

    expect({ main: await read(MAIN), bak: await read(BAK) }).toEqual(before);
    expect(await list()).toEqual([MAIN, BAK]);
  });
});

describe('JsonStore.load', () => {
  test('파일이 없으면 fresh', async () => {
    expect(await new JsonStore(dir).load()).toEqual({ state: null, source: 'fresh' });
    expect(await list()).toEqual([]);
  });

  test('저장한 내용을 main에서 그대로 읽는다', async () => {
    const store = new JsonStore(dir);
    await store.save(populated());
    expect(await store.load()).toEqual({ state: populated(), source: 'main' });
  });

  test('main이 없고 bak만 있으면 backup', async () => {
    await put(BAK, JSON.stringify(stateAt(7)));
    expect(await new JsonStore(dir).load()).toEqual({ state: stateAt(7), source: 'backup' });
    expect(await list()).toEqual([BAK]);
  });

  test('main이 손상되면 bak 내용 + corruptPath, 손상본 바이트 보존', async () => {
    const store = new JsonStore(dir, { now: () => NOW });
    await store.save(stateAt(1));
    await store.save(stateAt(2));
    await put(MAIN, '{broken');

    const result = await store.load();
    const corruptName = `focus-buddy.corrupt-${STAMP}.json`;
    expect(result.source).toBe('backup');
    expect(result.state).toEqual(stateAt(1));
    expect(result.corruptPath).toBe(path.join(dir, corruptName));
    expect(typeof result.error).toBe('string');
    expect(await read(corruptName)).toBe('{broken');
    expect(await list()).toEqual([corruptName, BAK]);
  });

  test('main·bak 모두 손상이면 fresh + 두 손상본 보존', async () => {
    await put(MAIN, '{broken');
    await put(BAK, 'also broken');
    const result = await new JsonStore(dir, { now: () => NOW }).load();
    const mainCorrupt = `focus-buddy.corrupt-${STAMP}.json`;
    const bakCorrupt = `focus-buddy.bak.corrupt-${STAMP}.json`;
    expect(result.state).toBeNull();
    expect(result.source).toBe('fresh');
    expect(result.corruptPath).toBe(path.join(dir, mainCorrupt));
    expect(await list()).toEqual([bakCorrupt, mainCorrupt]);
    expect(await read(mainCorrupt)).toBe('{broken');
    expect(await read(bakCorrupt)).toBe('also broken');
  });

  const { settings: _omitted, ...missingField } = createEmptyState(1);
  const invalid: Array<[string, string]> = [
    ['schemaVersion 2', JSON.stringify({ ...createEmptyState(1), schemaVersion: 2 })],
    ['필드가 빠진 객체', JSON.stringify(missingField)],
    ['배열', '[]'],
    ['null', 'null'],
    ['문자열', '"hello"'],
    ['빈 파일', ''],
  ];
  test.each(invalid)('%s 파일은 보존되고 fresh', async (_name, text) => {
    await put(MAIN, text);
    const store = new JsonStore(dir, { now: () => NOW });
    const result = await store.load();
    const corruptName = `focus-buddy.corrupt-${STAMP}.json`;
    expect(result.state).toBeNull();
    expect(result.source).toBe('fresh');
    expect(result.corruptPath).toBe(path.join(dir, corruptName));
    expect(await read(corruptName)).toBe(text);

    await store.save(stateAt(5));
    expect(await read(corruptName)).toBe(text);
    expect(await list()).toEqual([corruptName, MAIN]);
  });

  test('같은 밀리초에 손상본이 두 번 생겨도 서로 덮어쓰지 않는다', async () => {
    const store = new JsonStore(dir, { now: () => NOW });
    await put(MAIN, 'first corrupt');
    const a = await store.load();
    await put(MAIN, 'second corrupt');
    const b = await store.load();

    expect(a.corruptPath).toBeDefined();
    expect(b.corruptPath).toBeDefined();
    expect(b.corruptPath).not.toBe(a.corruptPath);
    expect(await fs.readFile(a.corruptPath ?? '', 'utf8')).toBe('first corrupt');
    expect(await fs.readFile(b.corruptPath ?? '', 'utf8')).toBe('second corrupt');
    expect(await list()).toHaveLength(2);
  });

  test('ENOENT가 아닌 읽기 오류는 삼키지 않고 reject', async () => {
    await put(MAIN, JSON.stringify(stateAt(1)));
    const store = new JsonStore(dir, {
      fs: {
        ...fs,
        readFile: (async () => {
          throw eacces();
        }) as typeof fs.readFile,
      },
    });
    await expect(store.load()).rejects.toMatchObject({ code: 'EACCES' });
    expect(await list()).toEqual([MAIN]);
  });
});

describe('isPersistedState', () => {
  test('빈 상태와 채워진 상태를 받아들인다', () => {
    expect(isPersistedState(createEmptyState(1))).toBe(true);
    expect(isPersistedState(populated())).toBe(true);
  });

  test('형태가 틀린 값을 거부한다', () => {
    const base = populated();
    const bad: unknown[] = [
      null,
      [],
      'x',
      1,
      { ...base, schemaVersion: 2 },
      { ...base, sessions: {} },
      { ...base, sessions: [{ ...base.sessions[0], phase: 'nap' }] },
      { ...base, sessions: [{ ...base.sessions[0], endedAt: 'later' }] },
      { ...base, segments: [{ id: 'g1' }] },
      { ...base, settings: { ...base.settings, durations: { focusMin: '25' } } },
      { ...base, active: { ...base.active, status: 'idle' } },
      { ...base, awaiting: { suggested: 'nap' } },
      { ...base, cycle: {} },
      { ...base, completions: [null] },
      { ...base, recovery: { kind: 'unknown', at: 1 } },
      { ...base, celebration: { sessionId: 1, phase: 'focus' } },
      { ...base, savedAt: '1' },
    ];
    for (const value of bad) {
      expect(isPersistedState(value)).toBe(false);
    }
  });
});
