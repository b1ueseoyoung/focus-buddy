import * as nodeFs from 'node:fs/promises';
import * as path from 'node:path';
import type { PersistedState } from '../../shared/focus/types';

type StoreFs = Pick<typeof import('node:fs/promises'), 'open' | 'readFile' | 'rename' | 'copyFile' | 'unlink' | 'mkdir'>;

export interface LoadResult {
  state: PersistedState | null;
  source: 'main' | 'backup' | 'fresh';
  corruptPath?: string;
  error?: string;
}

type ReadOutcome =
  | { kind: 'ok'; state: PersistedState }
  | { kind: 'missing' }
  | { kind: 'corrupt'; path: string; error: string };

const MAIN = 'focus-buddy.json';
const BAK = 'focus-buddy.json.bak';
const TMP = 'focus-buddy.json.tmp';
const MAIN_CORRUPT_PREFIX = 'focus-buddy.corrupt-';
const BAK_CORRUPT_PREFIX = 'focus-buddy.bak.corrupt-';

const PHASES = ['focus', 'short_break', 'long_break'];
const SESSION_STATUSES = ['running', 'paused', 'completed', 'interrupted', 'skipped'];
const PAUSE_REASONS = ['user', 'sleep', 'stall', 'quit', 'crash'];
const PRESETS = ['classic', 'long', 'custom'];
const RECOVERY_KINDS = ['crash', 'quit', 'sleep', 'stall', 'backup', 'fresh-after-corrupt'];

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): boolean => typeof v === 'string';
const isBool = (v: unknown): boolean => typeof v === 'boolean';
const isOneOf = (v: unknown, values: string[]): boolean => typeof v === 'string' && values.includes(v);
const isNullOr = (v: unknown, check: (x: unknown) => boolean): boolean => v === null || check(v);
const isArrayOf = (v: unknown, check: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(check);

const isSettings = (v: unknown): boolean =>
  isRec(v) &&
  isOneOf(v.preset, PRESETS) &&
  isRec(v.durations) &&
  isNum(v.durations.focusMin) &&
  isNum(v.durations.shortBreakMin) &&
  isNum(v.durations.longBreakMin) &&
  isBool(v.soundEnabled) &&
  isBool(v.osNotificationEnabled) &&
  isBool(v.alwaysOnTop) &&
  isBool(v.trayHintSeen);

const isSession = (v: unknown): boolean =>
  isRec(v) &&
  isStr(v.id) &&
  isOneOf(v.phase, PHASES) &&
  isStr(v.taskName) &&
  isNum(v.plannedSeconds) &&
  isNum(v.elapsedMs) &&
  isOneOf(v.status, SESSION_STATUSES) &&
  isNum(v.startedAt) &&
  isNullOr(v.endedAt, isNum) &&
  isNullOr(v.completedAt, isNum) &&
  isStr(v.tz);

const isSegment = (v: unknown): boolean =>
  isRec(v) && isStr(v.id) && isStr(v.sessionId) && isNum(v.startAt) && isNum(v.endAt) && isNum(v.elapsedMs) && isStr(v.tz);

const isActive = (v: unknown): boolean =>
  isRec(v) &&
  isStr(v.sessionId) &&
  isOneOf(v.status, ['running', 'paused']) &&
  isNullOr(v.openSegmentId, isStr) &&
  isNullOr(v.pausedBy, (x) => isOneOf(x, PAUSE_REASONS));

const isCompletion = (v: unknown): boolean =>
  isRec(v) && isStr(v.sessionId) && isNum(v.completedAt) && isBool(v.effectsHandled);

const isRecovery = (v: unknown): boolean =>
  isRec(v) &&
  isOneOf(v.kind, RECOVERY_KINDS) &&
  isNum(v.at) &&
  (v.lastSavedAt === undefined || isNum(v.lastSavedAt)) &&
  (v.corruptPath === undefined || isStr(v.corruptPath));

export function isPersistedState(value: unknown): value is PersistedState {
  return (
    isRec(value) &&
    value.schemaVersion === 1 &&
    isSettings(value.settings) &&
    isArrayOf(value.sessions, isSession) &&
    isArrayOf(value.segments, isSegment) &&
    isNullOr(value.active, isActive) &&
    isNullOr(value.awaiting, (v) => isRec(v) && isOneOf(v.suggested, PHASES)) &&
    isRec(value.cycle) &&
    isNum(value.cycle.completedFocusCount) &&
    isArrayOf(value.completions, isCompletion) &&
    isNullOr(value.recovery, isRecovery) &&
    isNullOr(value.celebration, (v) => isRec(v) && isStr(v.sessionId) && isOneOf(v.phase, PHASES)) &&
    isNum(value.savedAt)
  );
}

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code;

const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:.Z]/g, '');

export class JsonStore {
  private readonly fs: StoreFs;
  private readonly now: () => number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    deps: { fs?: StoreFs; now?: () => number } = {},
  ) {
    this.fs = deps.fs ?? nodeFs;
    this.now = deps.now ?? Date.now;
  }

  async load(): Promise<LoadResult> {
    const main = await this.read(MAIN, MAIN_CORRUPT_PREFIX);
    if (main.kind === 'ok') return { state: main.state, source: 'main' };

    const bak = await this.read(BAK, BAK_CORRUPT_PREFIX);
    const corrupt = main.kind === 'corrupt' ? main : bak.kind === 'corrupt' ? bak : null;
    return {
      ...(bak.kind === 'ok' ? { state: bak.state, source: 'backup' } : { state: null, source: 'fresh' }),
      ...(corrupt ? { corruptPath: corrupt.path, error: corrupt.error } : {}),
    };
  }

  save(state: PersistedState): Promise<void> {
    const write = (): Promise<void> => this.write(state);
    this.queue = this.queue.then(write, write);
    return this.queue;
  }

  private async read(name: string, corruptPrefix: string): Promise<ReadOutcome> {
    const file = path.join(this.dir, name);
    let text: string;
    try {
      text = await this.fs.readFile(file, 'utf8');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return { kind: 'missing' };
      throw error;
    }

    let reason: string;
    try {
      const parsed: unknown = JSON.parse(text);
      if (isPersistedState(parsed)) return { kind: 'ok', state: parsed };
      reason = `${name}: not a schemaVersion 1 PersistedState`;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      reason = `${name}: ${error.message}`;
    }
    return { kind: 'corrupt', path: await this.quarantine(file, corruptPrefix), error: reason };
  }

  private async quarantine(file: string, prefix: string): Promise<string> {
    const base = prefix + stamp(this.now());
    for (let n = 0; ; n += 1) {
      const target = path.join(this.dir, `${base}${n === 0 ? '' : `-${n}`}.json`);
      try {
        // rename은 기존 파일을 덮어쓰므로 'wx'로 이름을 먼저 선점해 앞선 손상본을 지킨다.
        await (await this.fs.open(target, 'wx')).close();
      } catch (error) {
        if (hasCode(error, 'EEXIST')) continue;
        throw error;
      }
      await this.fs.rename(file, target);
      return target;
    }
  }

  private async write(state: PersistedState): Promise<void> {
    if (!isPersistedState(state)) {
      throw new TypeError('save rejected: state is not a schemaVersion 1 PersistedState');
    }
    const json = JSON.stringify(state);
    if (!isPersistedState(JSON.parse(json))) {
      throw new TypeError('save rejected: state does not survive JSON serialization');
    }

    const main = path.join(this.dir, MAIN);
    const tmp = path.join(this.dir, TMP);
    await this.fs.mkdir(this.dir, { recursive: true });
    try {
      const handle = await this.fs.open(tmp, 'w');
      try {
        await handle.writeFile(json);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const current = await this.read(MAIN, MAIN_CORRUPT_PREFIX);
      if (current.kind === 'ok') await this.fs.copyFile(main, path.join(this.dir, BAK));
      await this.fs.rename(tmp, main);
    } catch (error) {
      try {
        await this.fs.unlink(tmp);
      } catch (cleanupError) {
        // 정리 실패는 원래 저장 오류를 가리지 않는다: 남은 tmp는 다음 save의 open('w')가 덮어쓴다.
        if (!hasCode(cleanupError, 'ENOENT')) throw error;
      }
      throw error;
    }
  }
}
