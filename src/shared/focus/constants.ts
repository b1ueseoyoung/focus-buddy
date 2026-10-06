export const SCHEMA_VERSION = 1;

export const TICK_MS = 1000;
export const SNAPSHOT_MS = 5000;
export const STALL_MS = 30000;

export const LONG_BREAK_EVERY = 4;
export const TASK_NAME_MAX = 100;

export const RANGES = {
  focusMin: [1, 180],
  shortBreakMin: [1, 60],
  longBreakMin: [1, 120],
} as const;

export const PRESETS = {
  classic: {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
  },
  long: {
    focusMin: 50,
    shortBreakMin: 10,
    longBreakMin: 20,
  },
} as const;

export const AI_FEATURES_ENABLED = false;

export const CHANNELS = {
  getState: 'focus:getState',
  dispatch: 'focus:dispatch',
  state: 'focus:state',
  windows: 'focus:windows',
  test: 'focus:test',
} as const;
