import { expect, test } from 'bun:test';
import { formatClock, formatTimeRange } from './format';

// 숫자 형식만 고정한다. 한국어 문구(formatDuration)는 사람이 읽는 것이라 테스트하지 않는다.
test('formatClock 은 올림 초를 mm:ss 로, 60분 이상은 h:mm:ss 로 쓴다', () => {
  const cases: Array<[number, string]> = [
    [1500000, '25:00'],
    [1499001, '25:00'],
    [1499000, '24:59'],
    [1000, '00:01'],
    [999, '00:01'],
    [0, '00:00'],
    [-5000, '00:00'],
    [3600000, '1:00:00'],
    [3599000, '59:59'],
    [10865000, '3:01:05'],
  ];
  for (const [ms, expected] of cases) expect(formatClock(ms)).toBe(expected);
});

test('formatTimeRange 는 로컬 HH:mm 범위이고 진행 중이면 끝이 비어 있다', () => {
  const start = new Date(2026, 8, 30, 9, 0, 0).getTime();
  const end = new Date(2026, 8, 30, 9, 25, 0).getTime();
  expect(formatTimeRange(start, end)).toBe('09:00–09:25');
  expect(formatTimeRange(start, null)).toBe('09:00–');
});
