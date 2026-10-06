// Original standalone bridge declarations, written on 2026-10-06.
import type { FocusBuddyApi, FocusBuddyTestApi } from '../shared/focus/types';

export type FocusEventListener = (_event: undefined, ...args: any[]) => void;
export interface FocusIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<any>;
  on(channel: string, callback: FocusEventListener): () => void;
  removeListener(channel: string, callback: FocusEventListener): void;
  send(channel: string, ...args: unknown[]): void;
}
export interface FocusElectronBridge {
  ipcRenderer: FocusIpcRenderer;
  process: { platform: string };
}

declare global {
  interface Window {
    electron?: FocusElectronBridge;
    focusBuddy?: FocusBuddyApi;
    focusBuddyTest?: FocusBuddyTestApi;
  }
}
