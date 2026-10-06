import { expect, test } from 'bun:test';
import { createEmptyState } from './state';
import { buildTodaySummary, dateKeyOf, splitByLocalDay } from './today';
import type { FocusSegment, PersistedState, Session } from './types';

const MIN = 60_000;
const HOUR = 3_600_000;
const SEOUL = 'Asia/Seoul';
const NEW_YORK = 'America/New_York';
const LOS_ANGELES = 'America/Los_Angeles';

function session(id: string, startedAt: number, elapsedMs: number, over: Partial<Session> = {}): Session {
  return {
    id,
    phase: 'focus',
    taskName: '기획서 작성',
    plannedSeconds: 1500,
    elapsedMs,
    status: 'completed',
    startedAt,
    endedAt: startedAt + elapsedMs,
    completedAt: startedAt + elapsedMs,
    tz: SEOUL,
    ...over,
  };
}

function segmentOf(s: Session): FocusSegment {
  return {
    id: `seg-${s.id}`,
    sessionId: s.id,
    startAt: s.startedAt,
    endAt: s.startedAt + s.elapsedMs,
    elapsedMs: s.elapsedMs,
    tz: s.tz,
  };
}

// 집중 세션마다 구간 1개, 휴식은 구간 없음(타이머 코어 계약과 같음)
function stateOf(sessions: Session[]): PersistedState {
  const state = createEmptyState(0);
  state.sessions = sessions;
  state.segments = sessions.filter((s) => s.phase === 'focus').map(segmentOf);
  return state;
}

test('(1) Asia/Seoul 23:50→00:10 구간은 전날 600초, 다음날 600초로 나뉜다', () => {
  const start = Date.UTC(2026, 8, 30, 14, 50); // 09-30 23:50 KST
  const end = start + 20 * MIN;

  expect(splitByLocalDay(start, end, SEOUL)).toEqual([
    { dateKey: '2026-09-30', ms: 10 * MIN },
    { dateKey: '2026-10-01', ms: 10 * MIN },
  ]);

  const state = stateOf([session('s1', start, 20 * MIN)]);
  const before = buildTodaySummary(state, Date.UTC(2026, 8, 30, 14, 59), SEOUL);
  const after = buildTodaySummary(state, Date.UTC(2026, 8, 30, 15, 10), SEOUL);
  expect([before.dateKey, before.focusSeconds]).toEqual(['2026-09-30', 600]);
  expect([after.dateKey, after.focusSeconds]).toEqual(['2026-10-01', 600]);
  expect(after.sessions.map((s) => [s.id, s.focusSeconds])).toEqual([['s1', 600]]);
});

test('(2) 00:05에 완료한 집중은 완료 당일에만 카운트된다', () => {
  const start = Date.UTC(2026, 8, 30, 14, 40); // 09-30 23:40 KST, 완료 10-01 00:05 KST
  const state = stateOf([session('s1', start, 25 * MIN)]);

  const startDay = buildTodaySummary(state, Date.UTC(2026, 8, 30, 14, 59), SEOUL);
  const doneDay = buildTodaySummary(state, Date.UTC(2026, 8, 30, 15, 30), SEOUL);

  expect([startDay.completedFocusCount, startDay.focusSeconds]).toEqual([0, 1200]);
  expect(startDay.byTask).toEqual([{ taskName: '기획서 작성', focusSeconds: 1200, completedCount: 0 }]);
  expect([doneDay.completedFocusCount, doneDay.focusSeconds]).toEqual([1, 300]);
  expect(doneDay.byTask).toEqual([{ taskName: '기획서 작성', focusSeconds: 300, completedCount: 1 }]);
});

test('(3) America/New_York 서머타임 시작을 지나는 1시간 구간은 같은 날짜, 합 3600000', () => {
  const start = Date.UTC(2026, 2, 8, 6, 30); // 03-08 01:30 EST, 02:00에 03:00으로 건너뜀
  const end = start + HOUR; // 03-08 03:30 EDT

  expect(dateKeyOf(start, NEW_YORK)).toBe('2026-03-08');
  expect(splitByLocalDay(start, end, NEW_YORK)).toEqual([{ dateKey: '2026-03-08', ms: HOUR }]);
});

test('(4) America/New_York 서머타임 종료를 지나는 1시간 구간은 같은 날짜, 합 3600000', () => {
  const start = Date.UTC(2026, 10, 1, 5, 30); // 11-01 01:30 EDT, 02:00에 01:00으로 돌아감
  const end = start + HOUR; // 11-01 01:30 EST

  expect(dateKeyOf(start, NEW_YORK)).toBe('2026-11-01');
  expect(splitByLocalDay(start, end, NEW_YORK)).toEqual([{ dateKey: '2026-11-01', ms: HOUR }]);
});

test('(5) 서울에서 기록한 구간은 로스앤젤레스의 전날 저녁에 조회하면 오늘에 들어가지 않는다', () => {
  const start = Date.UTC(2026, 9, 1, 0, 0); // 서울 10-01 09:00
  const state = stateOf([session('s1', start, 25 * MIN)]);
  const now = Date.UTC(2026, 9, 1, 4, 0); // 로스앤젤레스 09-30 21:00 PDT

  const summary = buildTodaySummary(state, now, LOS_ANGELES);

  expect(summary.dateKey).toBe('2026-09-30');
  expect(summary.focusSeconds).toBe(0);
  expect(summary.completedFocusCount).toBe(0);
  expect(summary.byTask).toEqual([]);
  expect(summary.sessions).toEqual([]);
});

test('(6) interrupted는 초에만, 휴식은 초에서 제외, 빈 작업명은 한 키로 묶인다', () => {
  const day = Date.UTC(2026, 9, 1, 0, 0); // 서울 10-01 09:00
  const state = stateOf([
    session('a', day, 25 * MIN, { taskName: 'A' }),
    session('b', day + 30 * MIN, 600_500, { taskName: '', status: 'interrupted', completedAt: null }),
    session('c', day + 60 * MIN, 25 * MIN, { taskName: '' }),
    session('d', day + 90 * MIN, 5 * MIN, { taskName: '', phase: 'short_break', plannedSeconds: 300 }),
  ]);

  const summary = buildTodaySummary(state, day + 3 * HOUR, SEOUL);

  expect(summary.focusSeconds).toBe(3600); // 3600500ms 내림, 휴식 300초 제외
  expect(summary.completedFocusCount).toBe(2);
  expect(summary.byTask).toEqual([
    { taskName: '', focusSeconds: 2100, completedCount: 1 },
    { taskName: 'A', focusSeconds: 1500, completedCount: 1 },
  ]);
  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([
    ['a', 'completed', 1500],
    ['b', 'interrupted', 600],
    ['c', 'completed', 1500],
    ['d', 'completed', 0],
  ]);
});

test('(7) 50시간 구간은 조각 3개로 나뉘고 합이 보존된다', () => {
  const start = Date.UTC(2026, 8, 30, 1, 0); // 서울 09-30 10:00
  const pieces = splitByLocalDay(start, start + 50 * HOUR, SEOUL);

  expect(pieces).toEqual([
    { dateKey: '2026-09-30', ms: 14 * HOUR },
    { dateKey: '2026-10-01', ms: 24 * HOUR },
    { dateKey: '2026-10-02', ms: 12 * HOUR },
  ]);
  expect(pieces.reduce((sum, p) => sum + p.ms, 0)).toBe(50 * HOUR);
});

test('(8) 23:58→00:03에 완료한 휴식은 다음날에도 기록되지만 집중 총계에는 더하지 않는다', () => {
  const start = Date.UTC(2026, 8, 30, 14, 58); // 09-30 23:58 KST
  const state = stateOf([session('break', start, 5 * MIN, { phase: 'short_break', plannedSeconds: 300 })]);

  const summary = buildTodaySummary(state, start + 10 * MIN, SEOUL);

  expect(summary.dateKey).toBe('2026-10-01');
  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([['break', 'completed', 0]]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
  expect(buildTodaySummary(state, start + 2 * 24 * HOUR, SEOUL).sessions).toEqual([]);
});

test('(9) 자정 뒤 건너뛴 휴식은 종료일 기록에 포함되고 시작 시각 순서를 유지한다', () => {
  const midnight = Date.UTC(2026, 8, 30, 15, 0); // 10-01 00:00 KST
  const state = stateOf([
    session('completed', midnight - 2 * MIN, 5 * MIN, { phase: 'short_break', plannedSeconds: 300 }),
    session('skipped', midnight - 5 * MIN, 6 * MIN, {
      phase: 'long_break', plannedSeconds: 900, status: 'skipped', completedAt: null,
    }),
  ]);

  const summary = buildTodaySummary(state, midnight + 10 * MIN, SEOUL);

  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([
    ['skipped', 'skipped', 0],
    ['completed', 'completed', 0],
  ]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});

test('(10) 정확히 00:00에 완료한 집중은 새 날짜의 0초 기록과 완료 1회로 일치한다', () => {
  const start = Date.UTC(2026, 8, 30, 14, 35); // 09-30 23:35 KST
  const midnight = start + 25 * MIN;
  const state = stateOf([session('focus', start, 25 * MIN)]);

  const summary = buildTodaySummary(state, midnight, SEOUL);

  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 1]);
  expect(summary.byTask).toEqual([{ taskName: '기획서 작성', focusSeconds: 0, completedCount: 1 }]);
  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([['focus', 'completed', 0]]);
  const previous = buildTodaySummary(state, midnight - 1, SEOUL);
  expect([previous.focusSeconds, previous.completedFocusCount]).toEqual([1500, 0]);
  expect(previous.sessions.map((s) => [s.id, s.focusSeconds])).toEqual([['focus', 1500]]);
});

test.each(['running', 'paused'] as const)('(11) 자정 전 시작한 현재 %s 휴식은 새 날짜의 기록에 남는다', (status) => {
  const start = Date.UTC(2026, 8, 30, 14, 58); // 09-30 23:58 KST
  const state = stateOf([
    session('active', start, MIN, {
      phase: status === 'running' ? 'short_break' : 'long_break',
      status, endedAt: null, completedAt: null,
    }),
    session('stale-running', start, MIN, { phase: 'short_break', status: 'running', endedAt: null, completedAt: null }),
    session('stale-paused', start, MIN, { phase: 'long_break', status: 'paused', endedAt: null, completedAt: null }),
  ]);
  state.active = { sessionId: 'active', status, openSegmentId: null, pausedBy: status === 'paused' ? 'user' : null };

  const summary = buildTodaySummary(state, start + 3 * MIN, SEOUL);

  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([['active', status, 0]]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});

test('(12) 오래된 휴식과 오늘 구간 없이 일시정지·중단된 과거 집중을 새로 포함하지 않는다', () => {
  const start = Date.UTC(2026, 8, 30, 12, 0); // 09-30 21:00 KST
  const now = Date.UTC(2026, 8, 30, 15, 10); // 10-01 00:10 KST
  const state = stateOf([
    session('completed-break', start, 5 * MIN, { phase: 'short_break' }),
    session('skipped-break', start, MIN, { phase: 'long_break', status: 'skipped', completedAt: null }),
    session('paused-focus', start, MIN, { status: 'paused', endedAt: null, completedAt: null }),
    session('interrupted-focus', start, MIN, { status: 'interrupted', endedAt: now, completedAt: null }),
  ]);
  state.active = { sessionId: 'paused-focus', status: 'paused', openSegmentId: null, pausedBy: 'user' };

  const summary = buildTodaySummary(state, now, SEOUL);

  expect(summary.sessions).toEqual([]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});

test.each(['completed', 'skipped'] as const)('(13) %s 휴식의 종료 날짜는 기록 당시 시간대로 판단한다', (status) => {
  const start = Date.UTC(2026, 8, 30, 14, 58); // 서울 09-30 23:58, 완료는 서울 10-01 / UTC 09-30
  const state = stateOf([session('break', start, 5 * MIN, {
    phase: 'short_break', status, completedAt: status === 'completed' ? start + 5 * MIN : null,
  })]);

  const summary = buildTodaySummary(state, Date.UTC(2026, 9, 1, 0, 30), 'UTC');

  expect(summary.dateKey).toBe('2026-10-01');
  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([['break', status, 0]]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});

test('(14) 현재 휴식은 조회 시간대와 달라도 기록 시간대의 오늘 날짜가 같으면 포함된다', () => {
  const start = Date.UTC(2026, 8, 30, 14, 58); // 서울 09-30 23:58
  const state = stateOf([session('break', start, MIN, {
    phase: 'long_break', status: 'paused', endedAt: null, completedAt: null,
  })]);
  state.active = { sessionId: 'break', status: 'paused', openSegmentId: null, pausedBy: 'user' };

  const summary = buildTodaySummary(state, Date.UTC(2026, 9, 1, 4, 0), 'UTC');

  expect(summary.dateKey).toBe('2026-10-01');
  expect(summary.sessions.map((s) => [s.id, s.status, s.focusSeconds])).toEqual([['break', 'paused', 0]]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});

test('(15) 현재 휴식도 기록 시간대가 조회하는 오늘 날짜와 다르면 새로 포함하지 않는다', () => {
  const start = Date.UTC(2026, 8, 30, 15, 2); // 서울 10-01 00:02
  const state = stateOf([session('break', start, MIN, {
    phase: 'short_break', status: 'paused', endedAt: null, completedAt: null,
  })]);
  state.active = { sessionId: 'break', status: 'paused', openSegmentId: null, pausedBy: 'user' };

  const summary = buildTodaySummary(state, Date.UTC(2026, 9, 1, 4, 0), LOS_ANGELES); // LA 09-30 21:00

  expect(summary.dateKey).toBe('2026-09-30');
  expect(summary.sessions).toEqual([]);
  expect([summary.focusSeconds, summary.completedFocusCount]).toEqual([0, 0]);
  expect(summary.byTask).toEqual([]);
});
