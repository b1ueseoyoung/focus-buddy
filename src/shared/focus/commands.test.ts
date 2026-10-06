import { describe, it, expect } from 'bun:test';
import {
  normalizeTaskName,
  applySettingsPatch,
  parseCommand,
  VALIDATION_MESSAGES,
} from './commands';
import type { ValidationCode } from './commands';
import { DEFAULT_SETTINGS } from './state';
import { PRESETS } from './constants';
import type { Command, Settings } from './types';

const CUSTOM: Settings = {
  ...DEFAULT_SETTINGS,
  preset: 'custom',
  durations: { focusMin: 40, shortBreakMin: 7, longBreakMin: 17 },
};

function settingsPatch(input: unknown, current: Settings) {
  const result = parseCommand(input, current);
  if (!result.ok || result.command.type !== 'updateSettings') throw new Error('not updateSettings');
  return result.command.patch;
}

describe('normalizeTaskName', () => {
  it('accepts valid task name strings', () => {
    const result = normalizeTaskName('기획서 작성');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value).toBe('기획서 작성');
  });

  it('trims whitespace', () => {
    const result = normalizeTaskName('  작업명  ');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value).toBe('작업명');
  });

  it('removes control characters', () => {
    const result = normalizeTaskName('기획서\u0007 작성');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value).toBe('기획서 작성');
  });

  it('allows empty string (free focus)', () => {
    const result = normalizeTaskName('');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value).toBe('');
  });

  it('converts whitespace-only to empty string', () => {
    const result = normalizeTaskName('   ');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value).toBe('');
  });

  it('accepts 100 character task name', () => {
    const name = '가'.repeat(100);
    const result = normalizeTaskName(name);
    expect(result.ok).toBe(true);
  });

  it('rejects 101 character task name', () => {
    const name = '가'.repeat(101);
    const result = normalizeTaskName(name);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TASK_TOO_LONG');
  });

  it('rejects non-string input (number)', () => {
    const result = normalizeTaskName(25);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TASK_NOT_STRING');
  });

  it('rejects non-string input (null)', () => {
    const result = normalizeTaskName(null);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TASK_NOT_STRING');
  });

  it('rejects non-string input (array)', () => {
    const result = normalizeTaskName([]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TASK_NOT_STRING');
  });

  it('rejects non-string input (object)', () => {
    const result = normalizeTaskName({});
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('TASK_NOT_STRING');
  });
});

describe('applySettingsPatch', () => {
  it('applies classic preset', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, { preset: 'classic' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.preset).toBe('classic');
      expect(result.settings.durations.focusMin).toBe(PRESETS.classic.focusMin);
    }
  });

  it('applies long preset', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, { preset: 'long' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.preset).toBe('long');
      expect(result.settings.durations.focusMin).toBe(PRESETS.long.focusMin);
    }
  });

  it('ignores durations when preset is classic', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'classic',
      durations: { focusMin: 100, shortBreakMin: 50, longBreakMin: 50 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.durations.focusMin).toBe(PRESETS.classic.focusMin);
    }
  });

  it('requires all durations for custom preset', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 30, shortBreakMin: 10 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('CUSTOM_INCOMPLETE');
  });

  it('validates custom durations are within ranges', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: {
        focusMin: 30,
        shortBreakMin: 10,
        longBreakMin: 20,
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects focus time boundary 0', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 0, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('FOCUS_RANGE');
  });

  it('accepts focus time boundary 1', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 1, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts focus time boundary 180', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 180, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects focus time boundary 181', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 181, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('FOCUS_RANGE');
  });

  it('rejects short break boundary 0', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 0, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('SHORT_RANGE');
  });

  it('accepts short break boundary 1', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 1, longBreakMin: 15 },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts short break boundary 60', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 60, longBreakMin: 15 },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects short break boundary 61', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 61, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('SHORT_RANGE');
  });

  it('rejects long break boundary 0', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 5, longBreakMin: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('LONG_RANGE');
  });

  it('accepts long break boundary 1', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 5, longBreakMin: 1 },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts long break boundary 120', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 5, longBreakMin: 120 },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects long break boundary 121', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 25, shortBreakMin: 5, longBreakMin: 121 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('LONG_RANGE');
  });

  it('rejects decimal focus time 1.5', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: 1.5, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('FOCUS_RANGE');
  });

  it('rejects string focus time "25"', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: '25' as unknown as number, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects NaN focus time', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: NaN, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects Infinity focus time', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: Infinity, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects negative focus time -1', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'custom',
      durations: { focusMin: -1, shortBreakMin: 5, longBreakMin: 15 },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid boolean soundEnabled', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, { soundEnabled: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.soundEnabled).toBe(true);
    }
  });

  it('rejects string "true" for soundEnabled', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      soundEnabled: 'true' as unknown as boolean,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('NOT_BOOLEAN');
  });

  it('rejects unknown preset', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      preset: 'unknown' as unknown as 'classic' | 'long' | 'custom',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_PRESET');
  });

  it('rejects unknown key', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      unknownKey: 'value' as unknown as never,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_KEY');
  });

  it('sets preset to custom when only durations provided', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      durations: { focusMin: 30, shortBreakMin: 10, longBreakMin: 20 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.preset).toBe('custom');
    }
  });

  it('preserves other settings when patching', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, {
      soundEnabled: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.soundEnabled).toBe(true);
      expect(result.settings.preset).toBe(DEFAULT_SETTINGS.preset);
    }
  });

  it('rejects own __proto__ key from JSON', () => {
    const patch: unknown = JSON.parse('{"__proto__":{"x":1}}');
    const result = applySettingsPatch(DEFAULT_SETTINGS, patch);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_KEY');
  });

  it('rejects own constructor key', () => {
    const patch = { constructor: {} } as unknown as Record<string, unknown>;
    const result = applySettingsPatch(DEFAULT_SETTINGS, patch);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_KEY');
  });
});

describe('parseCommand', () => {
  it('rejects unknown command type', () => {
    const result = parseCommand({ type: 'unknownCommand' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_COMMAND');
  });

  it('parses startFocus with task name', () => {
    const result = parseCommand({ type: 'startFocus', taskName: '작업' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cmd = result.command as Extract<Command, { type: 'startFocus' }>;
      expect(cmd.type).toBe('startFocus');
      expect(cmd.taskName).toBe('작업');
    }
  });

  it('validates task name in startFocus', () => {
    const result = parseCommand({ type: 'startFocus', taskName: null }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
  });

  it('rejects null input', () => {
    const result = parseCommand(null, DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_COMMAND');
  });

  it('rejects array input', () => {
    const result = parseCommand([], DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_COMMAND');
  });

  it('rejects string input', () => {
    const result = parseCommand('startFocus', DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_COMMAND');
  });

  it('rejects number input', () => {
    const result = parseCommand(123, DEFAULT_SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_COMMAND');
  });

  it('parses pause command', () => {
    const result = parseCommand({ type: 'pause' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('pause');
    }
  });

  it('parses resume command', () => {
    const result = parseCommand({ type: 'resume' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('resume');
    }
  });

  it('parses finishCurrent command', () => {
    const result = parseCommand({ type: 'finishCurrent' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('finishCurrent');
    }
  });

  it('parses skipBreak command', () => {
    const result = parseCommand({ type: 'skipBreak' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('skipBreak');
    }
  });

  it('parses endWork command', () => {
    const result = parseCommand({ type: 'endWork' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('endWork');
    }
  });

  it('parses updateSettings command', () => {
    const result = parseCommand(
      { type: 'updateSettings', patch: { preset: 'long' } },
      DEFAULT_SETTINGS
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cmd = result.command as Extract<Command, { type: 'updateSettings' }>;
      expect(cmd.type).toBe('updateSettings');
    }
  });

  it('parses ackCelebration command', () => {
    const result = parseCommand({ type: 'ackCelebration', sessionId: 'id-123' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cmd = result.command as Extract<Command, { type: 'ackCelebration' }>;
      expect(cmd.type).toBe('ackCelebration');
      expect(cmd.sessionId).toBe('id-123');
    }
  });

  it('parses dismissRecovery command', () => {
    const result = parseCommand({ type: 'dismissRecovery' }, DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.type).toBe('dismissRecovery');
    }
  });
});

describe('applySettingsPatch: keep, copy, own keys', () => {
  const BOOL_KEYS = ['soundEnabled', 'osNotificationEnabled', 'alwaysOnTop', 'trayHintSeen'] as const;

  for (const key of BOOL_KEYS) {
    it(`custom user can change only ${key}`, () => {
      const result = applySettingsPatch(CUSTOM, { [key]: !CUSTOM[key] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings).toEqual({ ...CUSTOM, [key]: !CUSTOM[key] });
    });

    it(`rejects null ${key}`, () => {
      const result = applySettingsPatch(DEFAULT_SETTINGS, { [key]: null });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe('NOT_BOOLEAN');
    });

    it(`rejects explicit undefined ${key}`, () => {
      const result = applySettingsPatch(DEFAULT_SETTINGS, { [key]: undefined });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe('NOT_BOOLEAN');
    });
  }

  it('empty patch keeps custom settings', () => {
    const result = applySettingsPatch(CUSTOM, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings).toEqual(CUSTOM);
  });

  it('preset custom without durations is incomplete even when current is custom', () => {
    const result = applySettingsPatch(CUSTOM, { preset: 'custom' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('CUSTOM_INCOMPLETE');
  });

  it('maps every duration of classic and long presets', () => {
    for (const preset of ['classic', 'long'] as const) {
      const result = applySettingsPatch(CUSTOM, { preset });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings).toEqual({ ...CUSTOM, preset, durations: PRESETS[preset] });
    }
  });

  it('preset durations are copies, not PRESETS objects', () => {
    for (const preset of ['classic', 'long'] as const) {
      const result = applySettingsPatch(DEFAULT_SETTINGS, { preset });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings.durations).not.toBe(PRESETS[preset]);
    }
  });

  it('kept durations are a copy of current durations', () => {
    const result = applySettingsPatch(CUSTOM, { soundEnabled: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).not.toBe(CUSTOM);
      expect(result.settings.durations).not.toBe(CUSTOM.durations);
      expect(result.settings.durations).toEqual(CUSTOM.durations);
    }
  });

  it('custom durations are a copy of the patch and drop extra keys', () => {
    const durations = { focusMin: 30, shortBreakMin: 10, longBreakMin: 20, extra: 1 };
    const result = applySettingsPatch(DEFAULT_SETTINGS, { durations });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.durations).not.toBe(durations);
      expect(result.settings.durations).toEqual({ focusMin: 30, shortBreakMin: 10, longBreakMin: 20 });
    }
  });

  it('does not mutate current or patch', () => {
    const current = structuredClone(CUSTOM);
    const patch = { preset: 'long', soundEnabled: true };
    applySettingsPatch(current, patch);
    expect(current).toEqual(CUSTOM);
    expect(patch).toEqual({ preset: 'long', soundEnabled: true });
  });

  it('rejects a patch whose keys are inherited', () => {
    const result = applySettingsPatch(DEFAULT_SETTINGS, Object.create({ preset: 'long' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_KEY');
    expect(Object.hasOwn(Object.prototype, 'x')).toBe(false);
  });
});

describe('parseCommand: updateSettings patch contract', () => {
  it('returns only the keys the caller sent', () => {
    expect(settingsPatch({ type: 'updateSettings', patch: { alwaysOnTop: false } }, CUSTOM)).toEqual({
      alwaysOnTop: false,
    });
    expect(settingsPatch({ type: 'updateSettings', patch: {} }, CUSTOM)).toEqual({});
    expect(settingsPatch({ type: 'updateSettings', patch: { preset: 'long' } }, CUSTOM)).toEqual({
      preset: 'long',
    });
  });

  it('drops extra keys inside durations', () => {
    const patch = { durations: { focusMin: 30, shortBreakMin: 10, longBreakMin: 20, extra: 1 } };
    expect(settingsPatch({ type: 'updateSettings', patch }, DEFAULT_SETTINGS)).toEqual({
      durations: { focusMin: 30, shortBreakMin: 10, longBreakMin: 20 },
    });
  });

  it('parsed patch applies to the same settings as the raw patch', () => {
    const patches = [
      {},
      { soundEnabled: true },
      { preset: 'long' },
      { preset: 'classic', durations: { focusMin: 100, shortBreakMin: 50, longBreakMin: 50 } },
      { durations: { focusMin: 30, shortBreakMin: 10, longBreakMin: 20 } },
      { preset: 'custom', durations: { focusMin: 1, shortBreakMin: 60, longBreakMin: 120 }, trayHintSeen: true },
    ];
    for (const current of [DEFAULT_SETTINGS, CUSTOM]) {
      for (const patch of patches) {
        const parsed = settingsPatch({ type: 'updateSettings', patch }, current);
        const viaParsed = applySettingsPatch(current, parsed);
        expect(viaParsed.ok).toBe(true);
        expect(viaParsed).toEqual(applySettingsPatch(current, patch));
      }
    }
  });

  it('rejects unknown and invalid patch keys with the settings code', () => {
    const cases: Array<[unknown, ValidationCode]> = [
      [{ nope: 1 }, 'UNKNOWN_KEY'],
      [{ soundEnabled: null }, 'NOT_BOOLEAN'],
      [{ preset: 'custom' }, 'CUSTOM_INCOMPLETE'],
      [null, 'UNKNOWN_KEY'],
      [[], 'UNKNOWN_KEY'],
      [undefined, 'UNKNOWN_KEY'],
    ];
    for (const [patch, code] of cases) {
      const result = parseCommand({ type: 'updateSettings', patch }, CUSTOM);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe(code);
    }
  });

  it('parses startNext with a normalized task name', () => {
    const result = parseCommand({ type: 'startNext', taskName: ' 다음 ', extra: 1 }, DEFAULT_SETTINGS);
    expect(result).toEqual({ ok: true, command: { type: 'startNext', taskName: '다음' } });
  });

  it('rejects malformed input without throwing', () => {
    const inputs: unknown[] = [null, undefined, [], 42, 'str', {}, { type: 123 }, { type: 'startFocus' }, { type: 'ackCelebration', sessionId: 5 }];
    for (const input of inputs) expect(parseCommand(input, DEFAULT_SETTINGS).ok).toBe(false);
  });
});

describe('VALIDATION_MESSAGES', () => {
  it('contains all required messages', () => {
    expect(VALIDATION_MESSAGES.UNKNOWN_COMMAND).toBeDefined();
    expect(VALIDATION_MESSAGES.TASK_NOT_STRING).toBeDefined();
    expect(VALIDATION_MESSAGES.TASK_TOO_LONG).toBeDefined();
    expect(VALIDATION_MESSAGES.FOCUS_RANGE).toBeDefined();
    expect(VALIDATION_MESSAGES.SHORT_RANGE).toBeDefined();
    expect(VALIDATION_MESSAGES.LONG_RANGE).toBeDefined();
    expect(VALIDATION_MESSAGES.UNKNOWN_KEY).toBeDefined();
    expect(VALIDATION_MESSAGES.NOT_BOOLEAN).toBeDefined();
    expect(VALIDATION_MESSAGES.UNKNOWN_PRESET).toBeDefined();
    expect(VALIDATION_MESSAGES.CUSTOM_INCOMPLETE).toBeDefined();
  });
});
