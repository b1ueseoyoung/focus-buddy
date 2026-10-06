import { expect, test } from 'bun:test';
import { TrayAnimation, tintTrayBitmap, type TrayPose } from './tray-animation';

function fixture() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const frames: Array<[TrayPose, number]> = [];
  const animation = new TrayAnimation({
    now: () => now,
    setTimeout(callback, ms) { timers.set(++id, { due: now + ms, callback }); return id; },
    clearTimeout(handle) { timers.delete(handle as number); },
  }, (mode, frame) => frames.push([mode, frame]));
  function advance(ms: number) {
    const target = now + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      now = next[1].due; timers.delete(next[0]); next[1].callback();
    }
    now = target;
  }
  return { animation, frames, advance, timers };
}
test('tray animation keeps one schedule across timer ticks and loops at five seconds', () => {
  const f = fixture();
  f.animation.update('running', 'focus');
  f.advance(2000); f.animation.update('running', 'focus');
  expect(f.timers.size).toBe(1);
  f.advance(3000);
  expect(f.frames).toEqual([['sleep', 0], ['sleep', 1], ['sleep', 2], ['sleep', 3], ['sleep', 0]]);
});
test('pause freezes current pose and resume preserves remaining frame delay', () => {
  const f = fixture();
  f.animation.update('running', 'focus'); f.advance(4650);
  f.animation.update('paused', 'focus'); f.advance(20000);
  expect(f.animation.frame).toBe(1); expect(f.animation.running).toBe(false);
  f.animation.update('running', 'focus'); f.advance(49);
  expect(f.animation.frame).toBe(1); f.advance(1); expect(f.animation.frame).toBe(2);
});
test('break uses rest and disposal cancels future callbacks', () => {
  const f = fixture();
  f.animation.update('running', 'focus'); f.advance(4700);
  f.animation.update('awaiting_next', 'short_break');
  expect(f.frames.at(-1)).toEqual(['rest', 0]);
  f.animation.dispose(); f.animation.update('running', 'focus'); f.advance(10000);
  expect(f.timers.size).toBe(0); expect(f.frames.at(-1)).toEqual(['rest', 0]);
});
test('recovered paused breaks immediately display a frozen rest pose', () => {
  for (const phase of ['short_break', 'long_break']) {
    const f = fixture();
    f.animation.update('paused', phase); f.advance(10000);
    expect(f.frames.at(-1)).toEqual(['rest', 0]);
    expect(f.animation.running).toBe(false);
    expect(f.timers.size).toBe(0);
    f.animation.update('running', phase); f.advance(4600);
    expect(f.frames.at(-1)).toEqual(['rest', 1]);
  }
});
test('taskbar tint preserves alpha and input bytes for either system theme', () => {
  const original = Buffer.from([12, 34, 56, 255, 0, 0, 0, 128, 0, 0, 0, 0]);
  expect([...tintTrayBitmap(original, true)]).toEqual([255, 255, 255, 255, 128, 128, 128, 128, 0, 0, 0, 0]);
  expect([...tintTrayBitmap(original, false)]).toEqual([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0]);
  expect(original[0]).toBe(12);
});
