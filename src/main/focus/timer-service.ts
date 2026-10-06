import type { Clock } from '../../shared/focus/clock';
import { applySettingsPatch, parseCommand } from '../../shared/focus/commands';
import { SNAPSHOT_MS, TICK_MS } from '../../shared/focus/constants';
import { createEmptyState } from '../../shared/focus/state';
import { TimerCore } from '../../shared/focus/timer-core';
import type { CoreResult } from '../../shared/focus/timer-core';
import { buildTodaySummary } from '../../shared/focus/today';
import type { Command, DispatchResult, PersistedState, Snapshot, TodaySummary } from '../../shared/focus/types';
import type { LoadResult } from './store';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface Notifier {
  notify(title: string, body: string): void;
  beep(): void;
}

export interface TimerServiceDeps {
  clock: Clock;
  scheduler: Scheduler;
  store: { load(): Promise<LoadResult>; save(state: PersistedState): Promise<void> };
  notifier: Notifier;
  broadcast(snapshot: Snapshot): void;
  log?: (message: string, error: unknown) => void;
}

const QUIT_FLUSH_MS = 3000;
const NOTIFY_TITLE = 'Focus Buddy';
const FOCUS_DONE = '한 구간 끝냈어요. 잠깐 쉬어요.';
const BREAK_DONE = '휴식이 끝났어요. 준비되면 다음 집중을 시작해요.';
const IGNORED_MESSAGE = '지금은 할 수 없는 동작이에요.';
const SAVE_FAILED_MESSAGE = '기록을 저장하지 못했어요. 디스크 공간이나 권한을 확인해 주세요.';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class TimerService {
  private readonly log: (message: string, error: unknown) => void;
  private core: TimerCore | null = null;
  private persistence: Snapshot['persistence'] = { ok: true, lastSavedAt: null, error: null };
  private saveQueue: Promise<boolean> = Promise.resolve(true);
  private stopTimers: Array<() => void> = [];
  private memoryOnly = false;
  private disposed = false;
  private loggedTodayError = '';

  constructor(private readonly deps: TimerServiceDeps) {
    this.log = deps.log ?? ((message, error) => console.error(message, error));
  }

  async init(): Promise<Snapshot> {
    const { clock, store } = this.deps;
    let loaded: LoadResult = { state: null, source: 'fresh' };
    try {
      loaded = await store.load();
    } catch (error) {
      // 읽지 못한 파일을 빈 상태로 덮어쓰면 기록이 사라진다. 이 실행 동안은 저장하지 않는다.
      this.memoryOnly = true;
      this.persistence = { ok: false, lastSavedAt: null, error: `load failed: ${messageOf(error)}` };
      this.log('focus store load failed; running in memory only', error);
    }

    const core = TimerCore.restore(clock, loaded.state ?? createEmptyState(clock.wall()));
    this.core = core;
    if (loaded.source === 'backup') {
      core.setRecovery({ kind: 'backup', at: clock.wall(), corruptPath: loaded.corruptPath });
    } else if (loaded.source === 'fresh' && loaded.corruptPath) {
      core.setRecovery({ kind: 'fresh-after-corrupt', at: clock.wall(), corruptPath: loaded.corruptPath });
    }
    // 지난 실행에서 끝난 완료는 다시 울리지 않는다(SPEC §6-7).
    for (const completion of core.toPersisted().completions) {
      if (!completion.effectsHandled) core.markEffectsHandled(completion.sessionId);
    }

    await this.save();
    return this.getSnapshot();
  }

  getSnapshot(): Snapshot {
    const core = this.need();
    const { clock } = this.deps;
    let today: TodaySummary = { dateKey: '', focusSeconds: 0, completedFocusCount: 0, byTask: [], sessions: [] };
    let persistence = { ...this.persistence };
    try {
      today = buildTodaySummary(core.toPersisted(), clock.wall(), clock.tz());
    } catch (error) {
      // 저장된 tz 하나가 잘못됐다고 타이머 화면 전체가 죽으면 안 된다.
      if (!(error instanceof RangeError)) throw error;
      const message = `today summary unavailable: ${error.message}`;
      if (message !== this.loggedTodayError) {
        this.loggedTodayError = message;
        this.log(message, error);
      }
      persistence = { ...persistence, error: persistence.error ?? message };
    }
    return { schemaVersion: 1, ...core.view(), today, persistence };
  }

  // 코어 호출은 첫 await 전에 동기로 끝낸다: 겹친 dispatch가 호출 순서대로 처리되고, 저장만 큐에서 기다린다.
  async dispatch(input: unknown): Promise<DispatchResult> {
    const core = this.need();
    if (this.disposed) return this.rejected('IGNORED', IGNORED_MESSAGE);
    const parsed = parseCommand(input, core.view().settings);
    if (!parsed.ok) return this.rejected('INVALID', parsed.message);

    const settled = this.settleCompletion(core);
    const result = this.run(core, parsed.command);
    const applied = this.absorb(result);
    if (!settled && !applied) {
      return result.ignored === null ? { ok: true, snapshot: this.getSnapshot() } : this.rejected('IGNORED', IGNORED_MESSAGE);
    }

    const view = this.getSnapshot();
    const saved = await this.save();
    this.emit();
    const snapshot = { ...view, persistence: { ...this.persistence } };
    if (result.ignored !== null) return { ok: false, code: 'IGNORED', message: IGNORED_MESSAGE, snapshot };
    if (!saved) return { ok: false, code: 'SAVE_FAILED', message: SAVE_FAILED_MESSAGE, snapshot };
    return { ok: true, snapshot };
  }

  async tick(opts: { broadcast?: boolean } = {}): Promise<void> {
    if (this.disposed) return;
    if (this.absorb(this.need().tick())) await this.save();
    if (opts.broadcast !== false) this.emit();
  }

  async onSuspend(): Promise<void> {
    if (this.disposed) return;
    const core = this.need();
    const settled = this.settleCompletion(core);
    const paused = this.absorb(core.pause('sleep'));
    if (!settled && !paused) return;
    await this.save();
    this.emit();
  }

  onResumeFromSleep(): void {
    if (!this.disposed) this.emit();
  }

  async flushOnQuit(): Promise<void> {
    if (this.disposed) return;
    const core = this.need();
    this.settleCompletion(core);
    this.absorb(core.pause('quit'));
    const saved = this.save();
    this.dispose();
    const { scheduler } = this.deps;
    await new Promise<void>((resolve) => {
      const giveUp = scheduler.setTimeout(resolve, QUIT_FLUSH_MS);
      void saved.then(() => {
        scheduler.clearTimeout(giveUp);
        resolve();
      });
    });
  }

  async saveNow(): Promise<void> {
    if (this.disposed) return;
    await this.save();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private need(): TimerCore {
    if (!this.core) throw new Error('TimerService.init() must resolve before use');
    return this.core;
  }

  // 계획 길이에 닿았는데 tick이 아직 안 왔으면 명령보다 완료를 먼저 확정한다(안 하면 interrupted로 닫힌다).
  // 정체는 여기서 확정하지 않는다: 코어 명령이 정체 상한을 직접 적용하고 sleep·quit·user 사유를 지킨다.
  private settleCompletion(core: TimerCore): boolean {
    const ms = core.msUntilCompletion();
    return ms !== null && ms <= 0 ? this.absorb(core.tick()) : false;
  }

  private rejected(code: 'INVALID' | 'IGNORED', message: string): DispatchResult {
    return { ok: false, code, message, snapshot: this.getSnapshot() };
  }

  private run(core: TimerCore, command: Command): CoreResult {
    switch (command.type) {
      case 'startFocus':
        return core.startFocus(command.taskName);
      case 'startNext':
        return core.startNext(command.taskName);
      case 'pause':
        return core.pause('user');
      case 'resume':
        return core.resume();
      case 'finishCurrent':
        return core.finishCurrent();
      case 'resetCurrent':
        return core.resetCurrent();
      case 'skipBreak':
        return core.skipBreak();
      case 'endWork':
        return core.endWork();
      case 'ackCelebration':
        return core.ackCelebration(command.sessionId);
      case 'dismissRecovery':
        return core.dismissRecovery();
      case 'updateSettings': {
        const merged = applySettingsPatch(core.view().settings, command.patch);
        if (!merged.ok) return { changed: false, ignored: merged.message, events: [] };
        return core.setSettings(merged.settings);
      }
    }
  }

  private absorb(result: CoreResult): boolean {
    if (result.events.some((event) => event.kind === 'completed')) this.runEffects();
    if (result.changed) this.retime();
    return result.changed;
  }

  private runEffects(): void {
    const core = this.need();
    const { notifier } = this.deps;
    const { settings, completions, sessions } = core.toPersisted();
    for (const completion of completions) {
      if (completion.effectsHandled) continue;
      const phase = sessions.find((session) => session.id === completion.sessionId)?.phase;
      try {
        if (settings.soundEnabled) notifier.beep();
        if (settings.osNotificationEnabled) notifier.notify(NOTIFY_TITLE, phase === 'focus' ? FOCUS_DONE : BREAK_DONE);
      } catch (error) {
        this.log('completion effect failed', error);
      }
      core.markEffectsHandled(completion.sessionId);
    }
  }

  private retime(): void {
    this.clearTimers();
    const ms = this.need().msUntilCompletion();
    if (this.disposed || ms === null) return;
    const { scheduler } = this.deps;
    const tick = scheduler.setInterval(() => this.tick(), TICK_MS);
    const completion = scheduler.setTimeout(() => this.tick(), ms);
    const snapshot = scheduler.setInterval(() => this.saveNow(), SNAPSHOT_MS);
    this.stopTimers = [
      () => scheduler.clearInterval(tick),
      () => scheduler.clearTimeout(completion),
      () => scheduler.clearInterval(snapshot),
    ];
  }

  private clearTimers(): void {
    for (const stop of this.stopTimers) stop();
    this.stopTimers = [];
  }

  // 상태는 호출 시점에 찍고 쓰기는 한 줄로 세운다: 늦게 끝난 옛 저장이 새 상태를 덮지 못한다. reject하지 않는다.
  private save(): Promise<boolean> {
    if (this.memoryOnly) return Promise.resolve(false);
    const state = this.need().toPersisted();
    const write = async (): Promise<boolean> => {
      try {
        await this.deps.store.save(state);
        this.persistence = { ok: true, lastSavedAt: state.savedAt, error: null };
        return true;
      } catch (error) {
        this.persistence = { ...this.persistence, ok: false, error: messageOf(error) };
        this.log('focus state save failed', error);
        return false;
      }
    };
    this.saveQueue = this.saveQueue.then(write);
    return this.saveQueue;
  }

  private emit(): void {
    try {
      this.deps.broadcast(this.getSnapshot());
    } catch (error) {
      this.log('focus state broadcast failed', error);
    }
  }
}
