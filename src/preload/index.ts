// Original narrow IPC bridge for the standalone candidate, written on 2026-10-06.
// Only the existing local Focus API and the channels below cross the boundary.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { focusApi, focusTestApi } from './focus-api';

type Listener = (_event: undefined, ...args: any[]) => void;
type WrappedListener = (event: IpcRendererEvent, ...args: any[]) => void;
const testing = process.env.FOCUS_BUDDY_E2E === '1';
const invokes = new Set([
  'focus:widget-scale',
  'focus:snore-settings',
  'focus:audio-info',
  'focus:runtime-info',
]);
const events = new Set([
  'focus:open-panel',
  'focus:widget-scale-changed',
  'focus:snore-cue',
]);
const sends = new Set([
  'focus:pointer-transparent',
  'focus:audio-status',
  'focus:quit',
]);
if (testing) invokes.add('focus:native-menu-test');

const subscriptions = new Map<string, Map<Listener, WrappedListener>>();
function allowed(channel: string, channels: Set<string>): void {
  if (!channels.has(channel)) throw new Error(`Unsupported Focus IPC channel: ${channel}`);
}

function removeListener(channel: string, callback: Listener): void {
  allowed(channel, events);
  const listeners = subscriptions.get(channel);
  const wrapped = listeners?.get(callback);
  if (!wrapped) return;
  ipcRenderer.removeListener(channel, wrapped);
  listeners?.delete(callback);
  if (listeners?.size === 0) subscriptions.delete(channel);
}

const electronBridge = {
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<any> {
      allowed(channel, invokes);
      return ipcRenderer.invoke(channel, ...args);
    },
    on(channel: string, callback: Listener): () => void {
      allowed(channel, events);
      if (typeof callback !== 'function') throw new TypeError('Focus IPC listener must be a function');
      let listeners = subscriptions.get(channel);
      if (!listeners) {
        listeners = new Map();
        subscriptions.set(channel, listeners);
      }
      if (!listeners.has(callback)) {
        // Preserve the renderer callback shape without exposing the Electron event.
        const wrapped: WrappedListener = (_event, ...args) => callback(undefined, ...args);
        listeners.set(callback, wrapped);
        ipcRenderer.on(channel, wrapped);
      }
      return () => removeListener(channel, callback);
    },
    removeListener,
    send(channel: string, ...args: unknown[]): void {
      allowed(channel, sends);
      ipcRenderer.send(channel, ...args);
    },
  },
  process: { platform: process.platform },
};

contextBridge.exposeInMainWorld('electron', electronBridge);
contextBridge.exposeInMainWorld('focusBuddy', focusApi);
if (testing && focusTestApi) contextBridge.exposeInMainWorld('focusBuddyTest', focusTestApi);
