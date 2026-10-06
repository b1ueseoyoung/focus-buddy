import { beforeEach, describe, expect, test } from "bun:test";
import { FakeClock } from "./clock";
import type { Clock } from "./clock";
import { PRESETS } from "./constants";
import { createEmptyState, DEFAULT_SETTINGS } from "./state";
import { TimerCore } from "./timer-core";
import type { CoreEvent } from "./timer-core";
import type { PersistedState } from "./types";

const START = Date.UTC(2026, 8, 30, 0, 0, 0);
const FOCUS_MS = 1500000;

let clock: FakeClock;
let core: TimerCore;
let newId: () => string;

function setup(): void {
  clock = new FakeClock({ wall: START, tz: "Asia/Seoul" });
  let n = 0;
  newId = () => `id-${++n}`;
  core = TimerCore.restore(clock, createEmptyState(clock.wall()), { newId });
}

function runFor(ms: number): CoreEvent[] {
  const events: CoreEvent[] = [];
  for (let t = 0; t < ms; t += 1000) {
    clock.advance(1000);
    events.push(...core.tick().events);
  }
  return events;
}

const completedOf = (events: CoreEvent[]) =>
  events.filter((e) => e.kind === "completed");
const focusSum = (p: PersistedState) =>
  p.segments.reduce((sum, s) => sum + s.elapsedMs, 0);

beforeEach(setup);

describe("TimerCore", () => {
  test("a 25분 집중 완료", () => {
    core.startFocus("기획서 작성");
    const events = [...runFor(FOCUS_MS), ...core.tick().events];

    const p = core.toPersisted();
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions[0]).toMatchObject({
      phase: "focus",
      taskName: "기획서 작성",
      plannedSeconds: 1500,
      status: "completed",
      elapsedMs: FOCUS_MS,
      startedAt: START,
      tz: "Asia/Seoul",
    });
    expect(focusSum(p)).toBe(FOCUS_MS);
    expect(p.completions).toEqual([
      {
        sessionId: p.sessions[0].id,
        completedAt: START + FOCUS_MS,
        effectsHandled: false,
      },
    ]);
    expect(core.status()).toBe("awaiting_next");
    expect(core.view().suggestedNext).toBe("short_break");
    expect(core.view().celebration).toEqual({
      sessionId: p.sessions[0].id,
      phase: "focus",
    });
    expect(completedOf(events)).toEqual([
      { kind: "completed", sessionId: p.sessions[0].id, phase: "focus" },
    ]);
  });

  test("b 일시정지 시간은 집중 시간에서 제외", () => {
    core.startFocus("문서");
    runFor(600000);
    core.pause();
    clock.advance(300000);
    core.resume();
    const events = [...runFor(900000), ...core.tick().events];

    const p = core.toPersisted();
    expect(completedOf(events)).toHaveLength(1);
    expect(p.sessions[0].status).toBe("completed");
    expect(p.sessions[0].elapsedMs).toBe(FOCUS_MS);
    expect(p.segments.map((s) => s.elapsedMs)).toEqual([600000, 900000]);
    expect(p.segments.map((s) => s.endAt - s.startAt)).toEqual([
      600000, 900000,
    ]);
    expect((p.sessions[0].completedAt ?? 0) - p.sessions[0].startedAt).toBe(
      1800000,
    );
  });

  test("c 완료 4회마다 긴 휴식, 재시작 뒤에도 횟수 유지", () => {
    const suggested: Array<string | null> = [];

    core.startFocus("1");
    runFor(FOCUS_MS);
    suggested.push(core.view().suggestedNext);
    core.startNext("");
    runFor(300000);

    core.startNext("2");
    runFor(FOCUS_MS);
    suggested.push(core.view().suggestedNext);
    core.skipBreak();

    core.startNext("3");
    runFor(FOCUS_MS);
    suggested.push(core.view().suggestedNext);
    core.skipBreak();

    core.startNext("4");
    runFor(FOCUS_MS);
    suggested.push(core.view().suggestedNext);

    expect(suggested).toEqual([
      "short_break",
      "short_break",
      "short_break",
      "long_break",
    ]);
    expect(core.view().cycleCount).toBe(4);

    const restored = TimerCore.restore(clock, core.toPersisted(), { newId });
    expect(restored.view().cycleCount).toBe(4);
    expect(restored.view().suggestedNext).toBe("long_break");
    expect(restored.status()).toBe("awaiting_next");
  });

  test("d 집중 중도 종료", () => {
    core.startFocus("개발");
    runFor(600000);
    const r = core.finishCurrent();

    const p = core.toPersisted();
    expect(r.changed).toBe(true);
    expect(completedOf(r.events)).toHaveLength(0);
    expect(p.sessions[0].status).toBe("interrupted");
    expect(p.sessions[0].elapsedMs).toBe(600000);
    expect(focusSum(p)).toBe(600000);
    expect(p.completions).toHaveLength(0);
    expect(p.cycle.completedFocusCount).toBe(0);
    expect(p.celebration).toBeNull();
    expect(core.status()).toBe("awaiting_next");
    expect(core.view().suggestedNext).toBe("focus");
  });

  test("e 휴식 건너뛰기", () => {
    core.startFocus("디자인");
    runFor(FOCUS_MS);
    const r = core.skipBreak();

    const p = core.toPersisted();
    expect(r.changed).toBe(true);
    expect(core.status()).toBe("awaiting_next");
    expect(core.view().suggestedNext).toBe("focus");
    expect(p.sessions).toHaveLength(1);
    expect(focusSum(p)).toBe(FOCUS_MS);

    expect(core.skipBreak().ignored).not.toBeNull();

    setup();
    const idle = core.skipBreak();
    expect(idle.changed).toBe(false);
    expect(idle.ignored).not.toBeNull();
    expect(core.status()).toBe("idle");
  });

  test("f 실행 중 설정 변경은 다음 단계부터", () => {
    core.startFocus("a");
    runFor(300000);
    core.setSettings({
      ...DEFAULT_SETTINGS,
      preset: "long",
      durations: { ...PRESETS.long },
    });

    expect(core.view().remainingMs).toBe(1200000);
    expect(core.view().plannedSeconds).toBe(1500);

    runFor(1200000);
    expect(core.status()).toBe("awaiting_next");
    expect(core.toPersisted().sessions[0].elapsedMs).toBe(FOCUS_MS);
    expect(core.view().remainingMs).toBe(600000);

    core.skipBreak();
    core.startNext("b");
    expect(core.view().plannedSeconds).toBe(3000);
    expect(core.view().remainingMs).toBe(3000000);
  });

  test("g 정상 종료 뒤 재실행", () => {
    core.startFocus("a");
    runFor(300000);
    core.pause("quit");
    const saved = core.toPersisted();
    clock.advance(3600000);

    const restored = TimerCore.restore(clock, saved, { newId });
    expect(restored.status()).toBe("paused");
    expect(restored.view().remainingMs).toBe(1200000);
    expect(restored.view().recovery).toMatchObject({ kind: "quit" });
    expect(restored.toPersisted().sessions[0].elapsedMs).toBe(300000);
  });

  test("h 비정상 종료는 마지막 스냅샷으로 복구", () => {
    core.startFocus("a");
    runFor(100000);
    const snapshot = core.toPersisted();
    runFor(4000);

    const restored = TimerCore.restore(clock, snapshot, { newId });
    const p = restored.toPersisted();
    expect(restored.status()).toBe("paused");
    expect(p.sessions[0].elapsedMs).toBe(100000);
    expect(p.sessions[0].status).toBe("paused");
    expect(focusSum(p)).toBe(100000);
    expect(p.active).toMatchObject({
      status: "paused",
      pausedBy: "crash",
      openSegmentId: null,
    });
    expect(p.recovery).toEqual({
      kind: "crash",
      at: clock.wall(),
      lastSavedAt: snapshot.savedAt,
    });
    expect(snapshot.savedAt).toBe(START + 100000);
    expect(p.completions).toHaveLength(0);
  });

  test("i 절전과 복귀", () => {
    core.startFocus("a");
    runFor(300000);
    const r = core.pause("sleep");
    expect(r.events).toEqual([{ kind: "paused", reason: "sleep" }]);
    clock.advance(3600000);
    core.tick();

    expect(core.status()).toBe("paused");
    expect(core.toPersisted().sessions[0].elapsedMs).toBe(300000);
    expect(core.view().recovery).toMatchObject({ kind: "sleep" });

    core.resume();
    expect(core.status()).toBe("running");
    expect(core.view().remainingMs).toBe(1200000);
  });

  test("j 시스템 시각 변경은 타이머 길이를 바꾸지 않는다", () => {
    core.startFocus("a");
    clock.jumpWall(7200000);
    runFor(60000);

    expect(core.status()).toBe("running");
    expect(core.view().remainingMs).toBe(1440000);
    expect(core.msUntilCompletion()).toBe(1440000);
  });

  test("k 중복 명령은 무시", () => {
    core.startFocus("a");
    const before = core.toPersisted();
    const again = core.startFocus("b");
    expect(again.changed).toBe(false);
    expect(again.ignored).not.toBeNull();
    expect(core.toPersisted()).toEqual(before);

    expect(core.pause().changed).toBe(true);
    const pause2 = core.pause();
    expect(pause2.changed).toBe(false);
    expect(pause2.ignored).not.toBeNull();

    core.resume();
    expect(core.resume().ignored).not.toBeNull();
    runFor(FOCUS_MS);
    expect(core.status()).toBe("awaiting_next");

    clock.advance(1000);
    const lateTick = core.tick();
    expect(lateTick.events).toHaveLength(0);
    expect(core.toPersisted().completions).toHaveLength(1);
    expect(core.toPersisted().cycle.completedFocusCount).toBe(1);
    expect(core.pause().ignored).not.toBeNull();
    expect(core.resume().ignored).not.toBeNull();
    expect(core.msUntilCompletion()).toBeNull();

    const sessionId = core.toPersisted().sessions[0].id;
    expect(core.ackCelebration(sessionId).changed).toBe(true);
    expect(core.view().celebration).toBeNull();
    const ack2 = core.ackCelebration(sessionId);
    expect(ack2.changed).toBe(false);
    expect(ack2.ignored).not.toBeNull();

    expect(core.markEffectsHandled(sessionId).changed).toBe(true);
    expect(core.markEffectsHandled(sessionId).ignored).not.toBeNull();
    expect(core.toPersisted().completions[0].effectsHandled).toBe(true);
  });

  test("l 정체 가드", () => {
    core.startFocus("a");
    runFor(10000);
    clock.advance(40000);
    const r = core.tick();

    const p = core.toPersisted();
    expect(r.events).toEqual([{ kind: "paused", reason: "stall" }]);
    expect(core.status()).toBe("paused");
    expect(p.sessions[0].elapsedMs).toBe(10000);
    expect(focusSum(p)).toBe(10000);
    expect(p.active).toMatchObject({ pausedBy: "stall" });
    expect(p.recovery).toEqual({ kind: "stall", at: clock.wall() });
    expect(core.view().remainingMs).toBe(FOCUS_MS - 10000);
  });

  test("m 늦은 tick은 계획 길이까지만 적립, 정체 뒤에는 완료하지 않는다", () => {
    core.startFocus("a");
    runFor(1499000);
    clock.advance(4000);
    const r = core.tick();

    let p = core.toPersisted();
    expect(completedOf(r.events)).toHaveLength(1);
    expect(p.sessions[0].elapsedMs).toBe(FOCUS_MS);
    expect(focusSum(p)).toBe(FOCUS_MS);
    expect(p.sessions[0].completedAt).toBe(p.sessions[0].startedAt + FOCUS_MS);
    expect(p.sessions[0].endedAt).toBe(p.sessions[0].startedAt + FOCUS_MS);
    expect(p.segments[0].endAt).toBe(START + FOCUS_MS);

    setup();
    core.startFocus("b");
    runFor(1497000);
    clock.advance(60000);
    const stalled = core.tick();

    p = core.toPersisted();
    expect(stalled.events).toEqual([{ kind: "paused", reason: "stall" }]);
    expect(core.status()).toBe("paused");
    expect(p.sessions[0].elapsedMs).toBe(1497000);
    expect(p.sessions[0].status).toBe("paused");
    expect(p.completions).toHaveLength(0);
    expect(p.active).toMatchObject({ pausedBy: "stall" });
  });

  test("n 휴식 완료 뒤 집중 제안, 휴식은 구간을 만들지 않는다", () => {
    core.startFocus("a");
    runFor(FOCUS_MS);
    core.startNext("무시되는 이름");

    expect(core.view()).toMatchObject({
      status: "running",
      phase: "short_break",
      taskName: "",
      plannedSeconds: 300,
    });
    expect(core.view().celebration).toBeNull();
    expect(core.toPersisted().segments).toHaveLength(1);

    const events = runFor(300000);
    const p = core.toPersisted();
    expect(completedOf(events)).toEqual([
      { kind: "completed", sessionId: p.sessions[1].id, phase: "short_break" },
    ]);
    expect(p.sessions[1]).toMatchObject({
      phase: "short_break",
      status: "completed",
      elapsedMs: 300000,
    });
    expect(p.segments).toHaveLength(1);
    expect(focusSum(p)).toBe(FOCUS_MS);
    expect(p.cycle.completedFocusCount).toBe(1);
    expect(core.status()).toBe("awaiting_next");
    expect(core.view().suggestedNext).toBe("focus");
  });

  test("o 퇴근", () => {
    core.startFocus("a");
    runFor(120000);
    const focusEnd = core.endWork();
    let p = core.toPersisted();
    expect(focusEnd.events).toEqual([{ kind: "endedWork" }]);
    expect(core.status()).toBe("idle");
    expect(p.sessions[0]).toMatchObject({
      status: "interrupted",
      elapsedMs: 120000,
    });
    expect(p.active).toBeNull();
    expect(p.awaiting).toBeNull();

    setup();
    core.startFocus("a");
    runFor(FOCUS_MS);
    core.startNext("");
    runFor(60000);
    const breakEnd = core.endWork();
    p = core.toPersisted();
    expect(breakEnd.events).toEqual([{ kind: "endedWork" }]);
    expect(core.status()).toBe("idle");
    expect(p.sessions[1]).toMatchObject({
      phase: "short_break",
      status: "skipped",
    });
    expect(p.cycle.completedFocusCount).toBe(1);
    expect(focusSum(p)).toBe(FOCUS_MS);

    setup();
    const before = core.toPersisted();
    const idleEnd = core.endWork();
    expect(idleEnd.changed).toBe(false);
    expect(idleEnd.events).toEqual([{ kind: "endedWork" }]);
    expect(core.toPersisted()).toEqual(before);
    expect(core.status()).toBe("idle");
    expect(core.view().remainingMs).toBe(FOCUS_MS);
  });
  test("p 정체 뒤 명령은 마지막 tick까지만 적립", () => {
    const stallRunning = (): void => {
      setup();
      core.startFocus("a");
      runFor(10000);
      clock.advance(600000);
    };
    const commands: Array<[string, () => void]> = [
      ["pause sleep", () => void core.pause("sleep")],
      ["pause quit", () => void core.pause("quit")],
      ["toPersisted", () => undefined],
      ["finishCurrent", () => void core.finishCurrent()],
      ["endWork", () => void core.endWork()],
    ];
    for (const [name, run] of commands) {
      stallRunning();
      run();
      const p = core.toPersisted();
      expect([name, p.sessions[0].elapsedMs, focusSum(p)]).toEqual([
        name,
        10000,
        10000,
      ]);
      expect([name, p.segments[0].endAt - p.segments[0].startAt]).toEqual([
        name,
        10000,
      ]);
    }

    stallRunning();
    core.pause("sleep");
    expect(core.status()).toBe("paused");
    expect(core.toPersisted().active).toMatchObject({ pausedBy: "sleep" });
    expect(core.view().recovery).toMatchObject({ kind: "sleep" });

    stallRunning();
    expect(core.status()).toBe("running");
    expect(core.view().remainingMs).toBe(1490000);
    expect(core.msUntilCompletion()).toBe(1490000);
  });

  describe("읽을 때마다 흐르는 시계", () => {
    // performance.now()처럼 mono()를 읽을 때마다 1ms씩 흐른다(wall도 함께).
    class DriftingClock implements Clock {
      calls = 0;
      private monoMs = 0;
      private wallMs = START;

      mono(): number {
        this.calls += 1;
        this.monoMs += 1;
        this.wallMs += 1;
        return this.monoMs;
      }

      wall(): number {
        return this.wallMs;
      }

      tz(): string {
        return "Asia/Seoul";
      }

      advance(ms: number): void {
        this.monoMs += ms;
        this.wallMs += ms;
      }
    }

    let drift: DriftingClock;
    let dcore: TimerCore;

    const driftFor = (ms: number): CoreEvent[] => {
      const events: CoreEvent[] = [];
      for (let t = 0; t < ms; t += 1000) {
        drift.advance(1000);
        events.push(...dcore.tick().events);
      }
      return events;
    };

    beforeEach(() => {
      drift = new DriftingClock();
      dcore = TimerCore.restore(drift, createEmptyState(START), { newId });
    });

    test("q tick 30회에도 정체로 오판하지 않는다", () => {
      dcore.startFocus("a");
      const events = driftFor(30000);

      const p = dcore.toPersisted();
      expect(events).toEqual([]);
      expect(dcore.status()).toBe("running");
      expect(p.active).toMatchObject({ status: "running", pausedBy: null });
      expect(p.recovery).toBeNull();
      expect(p.sessions[0].elapsedMs).toBeGreaterThanOrEqual(30000);
      expect(p.sessions[0].elapsedMs).toBeLessThanOrEqual(30000 + drift.calls);
    });

    test("r pause·finishCurrent·toPersisted·view도 정체로 오판하지 않는다", () => {
      dcore.startFocus("a");
      expect(driftFor(10000)).toEqual([]);

      const v = dcore.view();
      expect(v.status).toBe("running");
      expect(v.recovery).toBeNull();
      expect(v.remainingMs).toBeLessThanOrEqual(FOCUS_MS - 10000);
      expect(v.remainingMs).toBeGreaterThanOrEqual(
        FOCUS_MS - 10000 - drift.calls,
      );
      expect(dcore.toPersisted().active).toMatchObject({
        status: "running",
        pausedBy: null,
      });

      expect(dcore.pause().events).toEqual([
        { kind: "paused", reason: "user" },
      ]);
      let p = dcore.toPersisted();
      expect(p.active).toMatchObject({ status: "paused", pausedBy: "user" });
      expect(p.recovery).toBeNull();
      expect(p.sessions[0].elapsedMs).toBeGreaterThanOrEqual(10000);
      expect(p.sessions[0].elapsedMs).toBeLessThanOrEqual(10000 + drift.calls);

      expect(dcore.resume().changed).toBe(true);
      expect(driftFor(10000)).toEqual([]);
      expect(dcore.status()).toBe("running");
      expect(dcore.finishCurrent().changed).toBe(true);

      p = dcore.toPersisted();
      expect(p.sessions[0].status).toBe("interrupted");
      expect(p.recovery).toBeNull();
      expect(p.sessions[0].elapsedMs).toBeGreaterThanOrEqual(20000);
      expect(p.sessions[0].elapsedMs).toBeLessThanOrEqual(20000 + drift.calls);
      expect(focusSum(p)).toBe(p.sessions[0].elapsedMs);
    });
  });
});

describe("reset current stage preserves user history", () => {
  beforeEach(setup);
  test("unfinished focus is interrupted; reset waits at full duration without counting completion", () => {
    core.startFocus("kept work");
    runFor(10000);
    core.resetCurrent();
    expect(core.view()).toMatchObject({
      status: "awaiting_next",
      suggestedNext: "focus",
      remainingMs: FOCUS_MS,
      cycleCount: 0,
    });
    const saved = core.toPersisted();
    expect(saved.sessions[0]).toMatchObject({
      taskName: "kept work",
      status: "interrupted",
      elapsedMs: 10000,
    });
    expect(saved.segments.reduce((n, s) => n + s.elapsedMs, 0)).toBe(10000);
    expect(saved.completions).toHaveLength(0);
    expect(saved.settings).toEqual(DEFAULT_SETTINGS);
  });
  test("break reset retains completed focus, cycle, and same break phase", () => {
    core.startFocus("completed");
    runFor(FOCUS_MS);
    core.startNext("");
    runFor(10000);
    core.pause();
    core.resetCurrent();
    expect(core.view()).toMatchObject({
      status: "awaiting_next",
      suggestedNext: "short_break",
      remainingMs: 300000,
      cycleCount: 1,
    });
    const saved = core.toPersisted();
    expect(saved.sessions[0].status).toBe("completed");
    expect(saved.sessions[1].status).toBe("skipped");
    expect(saved.completions).toHaveLength(1);
    const restored = TimerCore.restore(clock, saved);
    expect(restored.view().suggestedNext).toBe("short_break");
    restored.startNext("");
    expect(restored.view()).toMatchObject({
      status: "running",
      phase: "short_break",
      remainingMs: 300000,
    });
  });
});
