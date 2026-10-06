import type { Clock } from "./clock";
import { LONG_BREAK_EVERY, STALL_MS } from "./constants";
import type {
  PauseReason,
  PersistedState,
  Phase,
  Recovery,
  Session,
  Settings,
  Snapshot,
  TimerStatus,
} from "./types";

export type CoreEvent =
  | { kind: "completed"; sessionId: string; phase: Phase }
  | { kind: "paused"; reason: PauseReason }
  | { kind: "endedWork" };

export interface CoreResult {
  changed: boolean;
  ignored: string | null;
  events: CoreEvent[];
}

const done = (...events: CoreEvent[]): CoreResult => ({
  changed: true,
  ignored: null,
  events,
});
const ignore = (reason: string): CoreResult => ({
  changed: false,
  ignored: reason,
  events: [],
});
const clone = (p: PersistedState): PersistedState =>
  JSON.parse(JSON.stringify(p));
// Allow millisecond wall-clock rounding and brief skew between the sequential reads.
const WALL_CLOCK_TOLERANCE_MS = 10;

export class TimerCore {
  private readonly clock: Clock;
  private readonly newId: () => string;
  private s: PersistedState;
  private runStartMono = 0;
  private runStartWall = 0;
  private lastTickMono = 0;

  private constructor(
    clock: Clock,
    state: PersistedState,
    newId: () => string,
  ) {
    this.clock = clock;
    this.s = state;
    this.newId = newId;
  }

  static restore(
    clock: Clock,
    persisted: PersistedState,
    opts?: { newId?: () => string },
  ): TimerCore {
    const s = clone(persisted);
    const active = s.active;
    if (active) {
      const wall = clock.wall();
      if (active.status === "running") {
        const session = s.sessions.find((x) => x.id === active.sessionId);
        if (session) session.status = "paused";
        active.status = "paused";
        active.openSegmentId = null;
        active.pausedBy = "crash";
        s.recovery = {
          kind: "crash",
          at: wall,
          lastSavedAt: persisted.savedAt,
        };
      } else if (active.pausedBy === "quit") {
        s.recovery = { kind: "quit", at: wall };
      }
    }
    return new TimerCore(clock, s, opts?.newId ?? (() => crypto.randomUUID()));
  }

  status(): TimerStatus {
    if (this.s.active) return this.s.active.status;
    return this.s.awaiting ? "awaiting_next" : "idle";
  }

  startFocus(taskName: string): CoreResult {
    if (this.s.active) return ignore("session already active");
    this.startSession("focus", taskName, this.clock.mono());
    return done();
  }

  startNext(taskName: string): CoreResult {
    if (this.s.active || !this.s.awaiting) return ignore("not awaiting next");
    const phase = this.s.awaiting.suggested;
    this.startSession(
      phase,
      phase === "focus" ? taskName : "",
      this.clock.mono(),
    );
    return done();
  }

  pause(reason: PauseReason = "user"): CoreResult {
    if (this.status() !== "running") return ignore("not running");
    const sample = this.sampleRun(this.clock.mono());
    this.pauseAt(sample.upTo, reason);
    if (reason === "sleep")
      this.s.recovery = { kind: "sleep", at: sample.wall };
    return done({ kind: "paused", reason });
  }

  resume(): CoreResult {
    const active = this.s.active;
    const session = this.session();
    if (!active || !session || active.status !== "paused")
      return ignore("not paused");
    session.status = "running";
    active.status = "running";
    active.pausedBy = null;
    this.beginRun(session, this.clock.mono());
    return done();
  }

  finishCurrent(): CoreResult {
    if (!this.s.active) return ignore("no active session");
    this.closeActive(this.clock.mono());
    this.s.awaiting = { suggested: "focus" };
    return done();
  }

  resetCurrent(): CoreResult {
    const phase = this.session()?.phase;
    if (!phase) return ignore("no active session");
    // Preserve accrued focus as an interrupted session; completed records and cycle stay intact.
    this.closeActive(this.clock.mono());
    this.s.awaiting = { suggested: phase };
    this.s.celebration = null;
    return done();
  }

  skipBreak(): CoreResult {
    if (
      this.s.active ||
      !this.s.awaiting ||
      this.s.awaiting.suggested === "focus"
    ) {
      return ignore("no break suggested");
    }
    this.s.awaiting = { suggested: "focus" };
    return done();
  }

  endWork(): CoreResult {
    const changed = this.s.active !== null || this.s.awaiting !== null;
    this.closeActive(this.clock.mono());
    this.s.awaiting = null;
    return { changed, ignored: null, events: [{ kind: "endedWork" }] };
  }

  setSettings(settings: Settings): CoreResult {
    this.s.settings = { ...settings, durations: { ...settings.durations } };
    return done();
  }

  ackCelebration(sessionId: string): CoreResult {
    if (this.s.celebration?.sessionId !== sessionId)
      return ignore("no such celebration");
    this.s.celebration = null;
    return done();
  }

  dismissRecovery(): CoreResult {
    if (!this.s.recovery) return ignore("no recovery notice");
    this.s.recovery = null;
    return done();
  }

  setRecovery(r: Recovery | null): CoreResult {
    this.s.recovery = r ? { ...r } : null;
    return done();
  }

  markEffectsHandled(sessionId: string): CoreResult {
    const completion = this.s.completions.find(
      (c) => c.sessionId === sessionId,
    );
    if (!completion || completion.effectsHandled)
      return ignore("effects already handled or unknown session");
    completion.effectsHandled = true;
    return done();
  }

  tick(): CoreResult {
    const session = this.session();
    if (!session || this.status() !== "running")
      return { changed: false, ignored: null, events: [] };
    const { mono, wall, upTo, rebased } = this.sampleRun(this.clock.mono());
    const stalled = upTo !== mono;
    if (
      session.elapsedMs + (upTo - this.runStartMono) >=
      session.plannedSeconds * 1000
    ) {
      return done(this.complete(session));
    }
    if (stalled) {
      this.pauseAt(upTo, "stall");
      this.s.recovery = { kind: "stall", at: wall };
      return done({ kind: "paused", reason: "stall" });
    }
    this.lastTickMono = mono;
    return { changed: rebased, ignored: null, events: [] };
  }

  msUntilCompletion(): number | null {
    const session = this.session();
    if (!session || this.status() !== "running") return null;
    return (
      session.plannedSeconds * 1000 -
      session.elapsedMs -
      this.runMs(session, this.accrualMono(this.clock.mono()))
    );
  }

  toPersisted(): PersistedState {
    const { upTo, wall } = this.sampleRun(this.clock.mono());
    const copy = clone(this.s);
    this.applyRun(copy, upTo);
    copy.savedAt = wall;
    return copy;
  }

  view(): Omit<Snapshot, "schemaVersion" | "today" | "persistence"> {
    const s = this.s;
    const session = this.session();
    const suggested = s.awaiting?.suggested ?? null;
    const plannedSeconds = session
      ? session.plannedSeconds
      : this.plannedSecondsOf(suggested ?? "focus");
    const elapsed = session
      ? session.elapsedMs +
        this.runMs(session, this.accrualMono(this.clock.mono()))
      : 0;
    return {
      status: this.status(),
      phase: session?.phase ?? null,
      sessionId: session?.id ?? null,
      taskName: session?.taskName ?? "",
      plannedSeconds,
      remainingMs: plannedSeconds * 1000 - elapsed,
      suggestedNext: suggested,
      cycleCount: s.cycle.completedFocusCount,
      settings: { ...s.settings, durations: { ...s.settings.durations } },
      recovery: s.recovery ? { ...s.recovery } : null,
      celebration: s.celebration ? { ...s.celebration } : null,
    };
  }

  private session(): Session | null {
    const active = this.s.active;
    if (!active) return null;
    return this.s.sessions.find((x) => x.id === active.sessionId) ?? null;
  }

  private plannedSecondsOf(phase: Phase): number {
    const d = this.s.settings.durations;
    const minutes =
      phase === "focus"
        ? d.focusMin
        : phase === "short_break"
          ? d.shortBreakMin
          : d.longBreakMin;
    return minutes * 60;
  }

  private startSession(phase: Phase, taskName: string, mono: number): void {
    const session: Session = {
      id: this.newId(),
      phase,
      taskName,
      plannedSeconds: this.plannedSecondsOf(phase),
      elapsedMs: 0,
      status: "running",
      startedAt: this.clock.wall(),
      endedAt: null,
      completedAt: null,
      tz: this.clock.tz(),
    };
    this.s.sessions.push(session);
    this.s.active = {
      sessionId: session.id,
      status: "running",
      openSegmentId: null,
      pausedBy: null,
    };
    this.s.awaiting = null;
    this.s.celebration = null;
    this.beginRun(session, mono);
  }

  private beginRun(session: Session, mono: number): void {
    this.runStartMono = mono;
    this.lastTickMono = this.runStartMono;
    this.runStartWall = this.clock.wall();
    this.openFocusSegment(session);
  }

  private openFocusSegment(session: Session): void {
    if (session.phase !== "focus" || !this.s.active) return;
    const id = this.newId();
    this.s.segments.push({
      id,
      sessionId: session.id,
      startAt: this.runStartWall,
      endAt: this.runStartWall,
      elapsedMs: 0,
      tz: this.clock.tz(),
    });
    this.s.active.openSegmentId = id;
  }

  // 공개 메서드가 시작할 때 한 번 읽은 mono를 받는다. 실제 시계는 읽을 때마다 값이 흐른다.
  private accrualMono(mono: number): number {
    return mono - this.lastTickMono > STALL_MS ? this.lastTickMono : mono;
  }

  private sampleRun(mono: number): {
    mono: number;
    wall: number;
    upTo: number;
    rebased: boolean;
  } {
    const wall = this.clock.wall();
    const upTo = this.accrualMono(mono);
    const session = this.session();
    const expectedWall = this.runStartWall + mono - this.runStartMono;
    if (
      !session ||
      this.status() !== "running" ||
      upTo !== mono ||
      Math.abs(wall - expectedWall) <= WALL_CLOCK_TOLERANCE_MS
    ) {
      return { mono, wall, upTo, rebased: false };
    }

    // Keep confirmed focus under its old wall mapping. The newest observed offset
    // applies after the last tick; reads must not move that tick or bypass the stall cap.
    const left = Math.max(0, session.plannedSeconds * 1000 - session.elapsedMs);
    const boundary = Math.max(
      this.runStartMono,
      Math.min(this.lastTickMono, mono, this.runStartMono + left),
    );
    this.applyRun(this.s, boundary);
    this.runStartMono = boundary;
    this.runStartWall = wall - (mono - boundary);
    this.openFocusSegment(session);
    return { mono, wall, upTo, rebased: true };
  }

  private runMs(session: Session, upToMono: number): number {
    if (session.status !== "running") return 0;
    const left = session.plannedSeconds * 1000 - session.elapsedMs;
    return Math.max(0, Math.min(upToMono - this.runStartMono, left));
  }

  private applyRun(state: PersistedState, upToMono: number): void {
    const active = state.active;
    if (!active || active.status !== "running") return;
    const session = state.sessions.find((x) => x.id === active.sessionId);
    if (!session) return;
    const run = this.runMs(session, upToMono);
    session.elapsedMs += run;
    const segment = state.segments.find((x) => x.id === active.openSegmentId);
    if (segment) {
      segment.elapsedMs = run;
      segment.endAt = segment.startAt + run;
    }
  }

  private pauseAt(upToMono: number, reason: PauseReason): void {
    const active = this.s.active;
    const session = this.session();
    if (!active || !session) return;
    this.applyRun(this.s, upToMono);
    session.status = "paused";
    active.status = "paused";
    active.openSegmentId = null;
    active.pausedBy = reason;
  }

  private closeActive(mono: number): void {
    const session = this.session();
    if (!session) return;
    const { upTo, wall } = this.sampleRun(mono);
    this.applyRun(this.s, upTo);
    session.status = session.phase === "focus" ? "interrupted" : "skipped";
    session.endedAt = wall;
    this.s.active = null;
  }

  private complete(session: Session): CoreEvent {
    const s = this.s;
    const fullMs = session.plannedSeconds * 1000;
    const rest = fullMs - session.elapsedMs;
    const completedAt = this.runStartWall + rest;
    const segment = s.segments.find((x) => x.id === s.active?.openSegmentId);
    if (segment) {
      segment.elapsedMs = rest;
      segment.endAt = segment.startAt + rest;
    }
    session.elapsedMs = fullMs;
    session.status = "completed";
    session.completedAt = completedAt;
    session.endedAt = completedAt;
    let suggested: Phase = "focus";
    if (session.phase === "focus") {
      s.cycle.completedFocusCount += 1;
      suggested =
        s.cycle.completedFocusCount % LONG_BREAK_EVERY === 0
          ? "long_break"
          : "short_break";
    }
    s.completions.push({
      sessionId: session.id,
      completedAt,
      effectsHandled: false,
    });
    s.celebration = { sessionId: session.id, phase: session.phase };
    s.active = null;
    s.awaiting = { suggested };
    return { kind: "completed", sessionId: session.id, phase: session.phase };
  }
}
