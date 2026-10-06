import { expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '../../../shared/focus/state';
import type { FocusBuddyApi, Snapshot } from '../../../shared/focus/types';
import { initFocusBridge, useFocusStore } from './store';

function snap(partial: Partial<Snapshot>): Snapshot {
  return {
    schemaVersion: 1,
    status: 'idle',
    phase: null,
    sessionId: null,
    taskName: '',
    plannedSeconds: 1500,
    remainingMs: 1500000,
    suggestedNext: null,
    cycleCount: 0,
    settings: DEFAULT_SETTINGS,
    today: { dateKey: '2026-10-01', focusSeconds: 0, completedFocusCount: 0, byTask: [], sessions: [] },
    persistence: { ok: true, lastSavedAt: 0, error: null },
    recovery: null,
    celebration: null,
    ...partial,
  };
}

function fakeApi(getState: () => Promise<Snapshot>): { api: FocusBuddyApi; emit: (s: Snapshot) => void } {
  const listeners = new Set<(s: Snapshot) => void>();
  const api: FocusBuddyApi = {
    getState,
    dispatch: async () => ({ ok: true, snapshot: await getState() }),
    onState: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    windows: { showMain: async () => {}, showMini: async () => {} },
  };
  return { api, emit: (s) => listeners.forEach((cb) => cb(s)) };
}

const reset = (): void => useFocusStore.setState({ snapshot: null, celebrateToken: 0, endedWork: false, bridgeError: null });

test('celebrateToken 은 초기 로드에서는 오르지 않고 라이브 전이에서 새 sessionId 일 때만 오른다', async () => {
  reset();
  const initial = snap({ status: 'awaiting_next', celebration: { sessionId: 'a', phase: 'focus' } });
  const { api, emit } = fakeApi(async () => initial);
  const { ready, unsubscribe } = initFocusBridge(api);
  await ready;
  expect(useFocusStore.getState().snapshot?.celebration?.sessionId).toBe('a');
  expect(useFocusStore.getState().celebrateToken).toBe(0);

  emit(snap({ status: 'awaiting_next', celebration: { sessionId: 'a', phase: 'focus' } }));
  expect(useFocusStore.getState().celebrateToken).toBe(0);

  emit(snap({ status: 'awaiting_next', celebration: { sessionId: 'b', phase: 'focus' } }));
  expect(useFocusStore.getState().celebrateToken).toBe(1);

  emit(snap({ status: 'idle', celebration: null }));
  expect(useFocusStore.getState().celebrateToken).toBe(1);
  unsubscribe();
});

test('새 세션이 시작되면 endedWork 가 풀리고, 구독 뒤 먼저 온 브로드캐스트를 getState 가 덮지 않는다', async () => {
  reset();
  let resolveInitial: (s: Snapshot) => void = () => {};
  const initial = new Promise<Snapshot>((resolve) => {
    resolveInitial = resolve;
  });
  const { api, emit } = fakeApi(() => initial);
  const { ready } = initFocusBridge(api);

  useFocusStore.setState({ endedWork: true });
  emit(snap({ status: 'running', phase: 'focus', sessionId: 's1' }));
  expect(useFocusStore.getState().endedWork).toBe(false);

  resolveInitial(snap({ status: 'idle' }));
  await ready;
  expect(useFocusStore.getState().snapshot?.sessionId).toBe('s1');
});
