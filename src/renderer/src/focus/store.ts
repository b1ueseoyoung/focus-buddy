import { create } from 'zustand';
import type { Command, DispatchResult, FocusBuddyApi, Snapshot } from '../../../shared/focus/types';

export interface FocusState {
  snapshot: Snapshot | null;
  /** 이 renderer 가 라이브 전이로 본 완료 축하 횟수. 초기 로드·새로고침에는 오르지 않는다(E2E 의 data-celebrations). */
  celebrateToken: number;
  endedWork: boolean;
  bridgeError: string | null;
}

export const useFocusStore = create<FocusState>(() => ({
  snapshot: null,
  celebrateToken: 0,
  endedWork: false,
  bridgeError: null,
}));

let api: FocusBuddyApi | null = null;

export function initFocusBridge(next: FocusBuddyApi): { ready: Promise<void>; unsubscribe: () => void } {
  api = next;
  const unsubscribe = next.onState((snapshot) => {
    useFocusStore.setState((prev) => {
      const before = prev.snapshot;
      const celebrated =
        before !== null && snapshot.celebration !== null && snapshot.celebration.sessionId !== before.celebration?.sessionId;
      const startedNewSession = snapshot.sessionId !== null && snapshot.sessionId !== before?.sessionId;
      return {
        snapshot,
        celebrateToken: prev.celebrateToken + (celebrated ? 1 : 0),
        endedWork: startedNewSession ? false : prev.endedWork,
      };
    });
  });
  const ready = next.getState().then(
    (snapshot) => {
      // 구독 뒤에 브로드캐스트가 먼저 왔으면 그쪽이 더 새롭다.
      useFocusStore.setState((prev) => (prev.snapshot === null ? { snapshot } : {}));
    },
    (error: unknown) => {
      useFocusStore.setState({ bridgeError: `상태를 불러오지 못했어요: ${String(error)}` });
    },
  );
  return { ready, unsubscribe };
}

let connected = false;

/** The desktop app always uses its isolated preload bridge. */
export async function connectFocusBridge(): Promise<void> {
  if (connected) return;
  connected = true;
  const resolved: FocusBuddyApi | null = window.focusBuddy ?? null;
  if (resolved === null) {
    useFocusStore.setState({ bridgeError: 'Focus Buddy 앱 연결을 찾지 못했어요.' });
    return;
  }
  initFocusBridge(resolved);
}

const notConnected = (): Promise<never> => Promise.reject(new Error('focus bridge is not connected'));

const focusActions = {
  dispatch: (cmd: Command): Promise<DispatchResult> => (api ? api.dispatch(cmd) : notConnected()),
  windows: {
    showMain: (): Promise<void> => (api ? api.windows.showMain() : notConnected()),
    showMini: (): Promise<void> => (api ? api.windows.showMini() : notConnected()),
  },
  setEndedWork: (endedWork: boolean): void => useFocusStore.setState({ endedWork }),
};

export type FocusHandle = FocusState & typeof focusActions;

export function useFocus(): FocusHandle {
  const state = useFocusStore();
  return { ...state, ...focusActions };
}
