import electron from 'electron';
import type { IpcRendererEvent } from 'electron';
import { CHANNELS } from '../shared/focus/constants';
import type { FocusBuddyApi, FocusBuddyTestApi, Snapshot } from '../shared/focus/types';

const { ipcRenderer } = electron;

export const focusApi: FocusBuddyApi = {
  getState: () => ipcRenderer.invoke(CHANNELS.getState),
  dispatch: (cmd) => ipcRenderer.invoke(CHANNELS.dispatch, cmd),
  onState: (cb) => {
    const handler = (_event: IpcRendererEvent, snapshot: Snapshot): void => cb(snapshot);
    ipcRenderer.on(CHANNELS.state, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.state, handler);
    };
  },
  windows: {
    showMain: () => ipcRenderer.invoke(CHANNELS.windows, 'showMain'),
    showMini: () => ipcRenderer.invoke(CHANNELS.windows, 'showMini'),
  },
};

const test = <T>(action: string, arg?: unknown): Promise<T> => ipcRenderer.invoke(CHANNELS.test, action, arg);

export const focusTestApi: FocusBuddyTestApi | null = process.env.FOCUS_BUDDY_E2E === '1'
  ? {
    advance: (ms) => test('advance', ms),
    jumpWall: (ms) => test('jumpWall', ms),
    suspend: () => test('suspend'),
    resumeFromSleep: () => test('resumeFromSleep'),
    saveNow: () => test('saveNow'),
    quit: () => test('quit'),
    trayMenu: () => test('trayMenu'),
    trayTitle: () => test('trayTitle'),
    trayClick: (label) => test('trayClick', label),
    windowsInfo: () => test('windowsInfo'),
  }
  : null;
