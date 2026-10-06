import type { PersistedState, TodaySession, TodaySummary } from './types';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function dateKeyOf(epochMs: number, tz: string): string {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, formatter);
  }
  return formatter.format(epochMs);
}

export function splitByLocalDay(startAt: number, endAt: number, tz: string): { dateKey: string; ms: number }[] {
  const pieces: { dateKey: string; ms: number }[] = [];
  let cursor = startAt;
  while (cursor < endAt) {
    const dateKey = dateKeyOf(cursor, tz);
    if (dateKeyOf(endAt - 1, tz) === dateKey) {
      pieces.push({ dateKey, ms: endAt - cursor });
      break;
    }
    // 이진 탐색: lo는 항상 dateKey인 날, hi는 항상 그 뒤 날짜. 끝나면 hi가 날짜가 바뀌는 첫 ms다.
    let lo = cursor;
    let hi = endAt - 1;
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (dateKeyOf(mid, tz) === dateKey) lo = mid;
      else hi = mid;
    }
    pieces.push({ dateKey, ms: hi - cursor });
    cursor = hi;
  }
  return pieces;
}

// ponytail: 호출마다 전체 구간을 훑는다(O(전체 기록)). 기록이 수만 구간으로 늘어 느려지면 날짜 범위로 먼저 거른다.
export function buildTodaySummary(state: PersistedState, now: number, tz: string): TodaySummary {
  const todayKey = dateKeyOf(now, tz);

  let totalMs = 0;
  const todayMsBySession = new Map<string, number>();
  for (const segment of state.segments) {
    for (const piece of splitByLocalDay(segment.startAt, segment.endAt, segment.tz)) {
      if (piece.dateKey !== todayKey) continue;
      totalMs += piece.ms;
      todayMsBySession.set(segment.sessionId, (todayMsBySession.get(segment.sessionId) ?? 0) + piece.ms);
    }
  }

  let completedFocusCount = 0;
  const tasks = new Map<string, { ms: number; completedCount: number }>();
  const sessions: TodaySession[] = [];
  for (const session of state.sessions) {
    const isFocus = session.phase === 'focus';
    const hasTodayPiece = todayMsBySession.has(session.id);
    const focusMs = isFocus ? (todayMsBySession.get(session.id) ?? 0) : 0;
    const completedToday =
      isFocus &&
      session.status === 'completed' &&
      session.completedAt !== null &&
      dateKeyOf(session.completedAt, session.tz) === todayKey;

    if (completedToday) completedFocusCount += 1;
    if (isFocus && (hasTodayPiece || completedToday)) {
      const task = tasks.get(session.taskName) ?? { ms: 0, completedCount: 0 };
      task.ms += focusMs;
      if (completedToday) task.completedCount += 1;
      tasks.set(session.taskName, task);
    }
    if (hasTodayPiece || dateKeyOf(session.startedAt, session.tz) === todayKey) {
      sessions.push({
        id: session.id,
        phase: session.phase,
        taskName: session.taskName,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
        focusSeconds: Math.floor(focusMs / 1000),
      });
    }
  }

  const byTask = Array.from(tasks, ([taskName, task]) => ({
    taskName,
    focusSeconds: Math.floor(task.ms / 1000),
    completedCount: task.completedCount,
  })).sort((a, b) => b.focusSeconds - a.focusSeconds || (a.taskName < b.taskName ? -1 : a.taskName > b.taskName ? 1 : 0));

  sessions.sort((a, b) => a.startedAt - b.startedAt);

  return {
    dateKey: todayKey,
    focusSeconds: Math.floor(totalMs / 1000),
    completedFocusCount,
    byTask,
    sessions,
  };
}
