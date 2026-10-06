import { RANGES, PRESETS, TASK_NAME_MAX } from './constants';
import type { Command, Durations, PresetId, Settings, SettingsPatch } from './types';

export type ValidationCode =
  | 'UNKNOWN_COMMAND'
  | 'TASK_NOT_STRING'
  | 'TASK_TOO_LONG'
  | 'FOCUS_RANGE'
  | 'SHORT_RANGE'
  | 'LONG_RANGE'
  | 'UNKNOWN_KEY'
  | 'NOT_BOOLEAN'
  | 'UNKNOWN_PRESET'
  | 'CUSTOM_INCOMPLETE';

export const VALIDATION_MESSAGES: Record<ValidationCode, string> = {
  UNKNOWN_COMMAND: '알 수 없는 명령이에요.',
  TASK_NOT_STRING: '작업명은 글자로 입력해 주세요.',
  TASK_TOO_LONG: '작업명은 100자까지 입력할 수 있어요.',
  FOCUS_RANGE: '집중 시간은 1~180분 사이의 정수로 입력해 주세요.',
  SHORT_RANGE: '짧은 휴식은 1~60분 사이의 정수로 입력해 주세요.',
  LONG_RANGE: '긴 휴식은 1~120분 사이의 정수로 입력해 주세요.',
  UNKNOWN_KEY: '알 수 없는 설정이에요: {key}',
  NOT_BOOLEAN: '{key} 값은 켜기/끄기(true/false)여야 해요.',
  UNKNOWN_PRESET: '알 수 없는 프리셋이에요.',
  CUSTOM_INCOMPLETE: '직접 설정에는 집중·짧은 휴식·긴 휴식 시간이 모두 필요해요.',
};

type Failure = { ok: false; code: ValidationCode; message: string };

const BOOLEAN_KEYS = ['soundEnabled', 'osNotificationEnabled', 'alwaysOnTop', 'trayHintSeen'] as const;
const ALLOWED_KEYS: readonly string[] = ['preset', 'durations', ...BOOLEAN_KEYS];

function fail(code: ValidationCode, key = ''): Failure {
  return { ok: false, code, message: VALIDATION_MESSAGES[code].replace('{key}', () => key) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function inRange(value: unknown, [min, max]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseDurations(raw: unknown): { ok: true; durations: Durations } | Failure {
  if (!isRecord(raw)) return fail('CUSTOM_INCOMPLETE');
  const { focusMin, shortBreakMin, longBreakMin } = raw;
  if (focusMin === undefined || shortBreakMin === undefined || longBreakMin === undefined) {
    return fail('CUSTOM_INCOMPLETE');
  }
  if (!inRange(focusMin, RANGES.focusMin)) return fail('FOCUS_RANGE');
  if (!inRange(shortBreakMin, RANGES.shortBreakMin)) return fail('SHORT_RANGE');
  if (!inRange(longBreakMin, RANGES.longBreakMin)) return fail('LONG_RANGE');
  return { ok: true, durations: { focusMin, shortBreakMin, longBreakMin } };
}

export function normalizeTaskName(raw: unknown): { ok: true; value: string } | Failure {
  if (typeof raw !== 'string') return fail('TASK_NOT_STRING');
  const value = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (Array.from(value).length > TASK_NAME_MAX) return fail('TASK_TOO_LONG');
  return { ok: true, value };
}

export function applySettingsPatch(
  current: Settings,
  patch: unknown
): { ok: true; settings: Settings } | Failure {
  if (!isRecord(patch)) return fail('UNKNOWN_KEY', 'patch');
  if (Object.getPrototypeOf(patch) !== Object.prototype) return fail('UNKNOWN_KEY', '__proto__');
  const unknownKey = Object.keys(patch).find((key) => !ALLOWED_KEYS.includes(key));
  if (unknownKey !== undefined) return fail('UNKNOWN_KEY', unknownKey);

  let preset: PresetId = current.preset;
  let durations: Durations = { ...current.durations };
  const hasPreset = has(patch, 'preset');
  if (hasPreset || has(patch, 'durations')) {
    const next = hasPreset ? patch.preset : 'custom';
    if (next === 'classic' || next === 'long') {
      preset = next;
      durations = { ...PRESETS[next] };
    } else if (next === 'custom') {
      const parsed = parseDurations(patch.durations);
      if (!parsed.ok) return parsed;
      preset = next;
      durations = parsed.durations;
    } else {
      return fail('UNKNOWN_PRESET');
    }
  }

  const flags = {
    soundEnabled: current.soundEnabled,
    osNotificationEnabled: current.osNotificationEnabled,
    alwaysOnTop: current.alwaysOnTop,
    trayHintSeen: current.trayHintSeen,
  };
  for (const key of BOOLEAN_KEYS) {
    if (!has(patch, key)) continue;
    const value = patch[key];
    if (typeof value !== 'boolean') return fail('NOT_BOOLEAN', key);
    flags[key] = value;
  }

  return { ok: true, settings: { preset, durations, ...flags } };
}

// Only the keys the caller sent, with values taken from the validated result.
function sentKeys(raw: unknown, settings: Settings): SettingsPatch {
  const patch: SettingsPatch = {};
  if (!isRecord(raw)) return patch;
  if (has(raw, 'preset')) patch.preset = settings.preset;
  if (has(raw, 'durations') && settings.preset === 'custom') patch.durations = settings.durations;
  for (const key of BOOLEAN_KEYS) {
    if (has(raw, key)) patch[key] = settings[key];
  }
  return patch;
}

export function parseCommand(
  input: unknown,
  current: Settings
): { ok: true; command: Command } | Failure {
  if (!isRecord(input)) return fail('UNKNOWN_COMMAND');
  const type = input.type;

  switch (type) {
    case 'startFocus':
    case 'startNext': {
      const name = normalizeTaskName(input.taskName);
      if (!name.ok) return name;
      return { ok: true, command: { type, taskName: name.value } };
    }
    case 'pause':
    case 'resume':
    case 'finishCurrent':
    case 'resetCurrent':
    case 'skipBreak':
    case 'endWork':
    case 'dismissRecovery':
      return { ok: true, command: { type } };
    case 'updateSettings': {
      const applied = applySettingsPatch(current, input.patch);
      if (!applied.ok) return applied;
      return { ok: true, command: { type, patch: sentKeys(input.patch, applied.settings) } };
    }
    case 'ackCelebration': {
      const sessionId = input.sessionId;
      if (typeof sessionId !== 'string') return fail('UNKNOWN_COMMAND');
      return { ok: true, command: { type, sessionId } };
    }
    default:
      return fail('UNKNOWN_COMMAND');
  }
}
