import { PRESETS } from './constants';
import type { Settings, PersistedState } from './types';

export const DEFAULT_SETTINGS: Settings = {
  preset: 'classic',
  durations: {
    focusMin: PRESETS.classic.focusMin,
    shortBreakMin: PRESETS.classic.shortBreakMin,
    longBreakMin: PRESETS.classic.longBreakMin,
  },
  soundEnabled: false,
  osNotificationEnabled: false,
  alwaysOnTop: true,
  trayHintSeen: false,
};

export function createEmptyState(now: number): PersistedState {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS, durations: { ...DEFAULT_SETTINGS.durations } },
    sessions: [],
    segments: [],
    active: null,
    awaiting: null,
    cycle: { completedFocusCount: 0 },
    completions: [],
    recovery: null,
    celebration: null,
    savedAt: now,
  };
}
