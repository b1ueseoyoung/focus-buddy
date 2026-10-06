export type Phase = 'focus' | 'short_break' | 'long_break';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'awaiting_next';
export type SessionStatus = 'running' | 'paused' | 'completed' | 'interrupted' | 'skipped';
export type PauseReason = 'user' | 'sleep' | 'stall' | 'quit' | 'crash';

export interface Durations {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
}

export type PresetId = 'classic' | 'long' | 'custom';

export interface Settings {
  preset: PresetId;
  durations: Durations;
  soundEnabled: boolean;
  osNotificationEnabled: boolean;
  alwaysOnTop: boolean;
  trayHintSeen: boolean;
}

export interface Session {
  id: string;
  phase: Phase;
  taskName: string;
  plannedSeconds: number;
  elapsedMs: number;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  completedAt: number | null;
  tz: string;
}

export interface FocusSegment {
  id: string;
  sessionId: string;
  startAt: number;
  endAt: number;
  elapsedMs: number;
  tz: string;
}

export interface ActiveTimer {
  sessionId: string;
  status: 'running' | 'paused';
  openSegmentId: string | null;
  pausedBy: PauseReason | null;
}

export interface Completion {
  sessionId: string;
  completedAt: number;
  effectsHandled: boolean;
}

export type RecoveryKind = 'crash' | 'quit' | 'sleep' | 'stall' | 'backup' | 'fresh-after-corrupt';

export interface Recovery {
  kind: RecoveryKind;
  at: number;
  lastSavedAt?: number;
  corruptPath?: string;
}

export interface PersistedState {
  schemaVersion: 1;
  settings: Settings;
  sessions: Session[];
  segments: FocusSegment[];
  active: ActiveTimer | null;
  awaiting: { suggested: Phase } | null;
  cycle: { completedFocusCount: number };
  completions: Completion[];
  recovery: Recovery | null;
  celebration: { sessionId: string; phase: Phase } | null;
  savedAt: number;
}

export interface TodaySession {
  id: string;
  phase: Phase;
  taskName: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  focusSeconds: number;
}

export interface TodaySummary {
  dateKey: string;
  focusSeconds: number;
  completedFocusCount: number;
  byTask: Array<{
    taskName: string;
    focusSeconds: number;
    completedCount: number;
  }>;
  sessions: TodaySession[];
}

export interface Snapshot {
  schemaVersion: 1;
  status: TimerStatus;
  phase: Phase | null;
  sessionId: string | null;
  taskName: string;
  plannedSeconds: number;
  remainingMs: number;
  suggestedNext: Phase | null;
  cycleCount: number;
  settings: Settings;
  today: TodaySummary;
  persistence: {
    ok: boolean;
    lastSavedAt: number | null;
    error: string | null;
  };
  recovery: Recovery | null;
  celebration: { sessionId: string; phase: Phase } | null;
}

export type SettingsPatch = Partial<Pick<Settings, 'preset' | 'soundEnabled' | 'osNotificationEnabled' | 'alwaysOnTop' | 'trayHintSeen'>> & {
  durations?: Durations;
};

export type Command =
  | { type: 'startFocus'; taskName: string }
  | { type: 'startNext'; taskName: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'finishCurrent' }
  | { type: 'resetCurrent' }
  | { type: 'skipBreak' }
  | { type: 'endWork' }
  | { type: 'updateSettings'; patch: SettingsPatch }
  | { type: 'ackCelebration'; sessionId: string }
  | { type: 'dismissRecovery' };

export type DispatchResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; code: 'INVALID' | 'IGNORED' | 'SAVE_FAILED'; message: string; snapshot: Snapshot };

export type WindowAction = 'showMain' | 'showMini';

export interface FocusBuddyApi {
  getState(): Promise<Snapshot>;
  dispatch(cmd: Command): Promise<DispatchResult>;
  onState(cb: (s: Snapshot) => void): () => void;
  windows: {
    showMain(): Promise<void>;
    showMini(): Promise<void>;
  };
}

export interface FocusBuddyTestApi {
  advance(ms: number): Promise<void>;
  jumpWall(ms: number): Promise<void>;
  suspend(): Promise<void>;
  resumeFromSleep(): Promise<void>;
  saveNow(): Promise<void>;
  quit(): Promise<void>;
  trayMenu(): Promise<Array<{ label: string; enabled: boolean }>>;
  trayTitle(): Promise<string>;
  trayClick(label: string): Promise<void>;
  windowsInfo(): Promise<Array<{ name: 'main' | 'mini'; visible: boolean; alwaysOnTop: boolean }>>;
}
