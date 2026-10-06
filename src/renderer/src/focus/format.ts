const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 남은 시간. 올림 초 → mm:ss, 60분 이상이면 h:mm:ss. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 누적 시간. "1시간 25분", "25분", "0분". */
export function formatDuration(sec: number): string {
  const minutes = Math.max(0, Math.floor(sec / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatTimeWithSeconds(epochMs: number): string {
  return `${formatTime(epochMs)}:${pad2(new Date(epochMs).getSeconds())}`;
}

/** "09:00–09:25", 진행 중이면 "09:00–". */
export function formatTimeRange(start: number, end: number | null): string {
  return `${formatTime(start)}–${end === null ? '' : formatTime(end)}`;
}
