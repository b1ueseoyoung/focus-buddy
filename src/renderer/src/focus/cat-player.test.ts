import { test, expect } from "bun:test";
import { CatPlayer, type CatAnimations } from "./cat-player";
const animations: CatAnimations = {
  sleep: {
    frames: [
      { file: "s0", durationMs: 500 },
      { file: "s1", durationMs: 500 },
    ],
    loop: true,
  },
  wake: {
    frames: [
      { file: "w0", durationMs: 200 },
      { file: "w1", durationMs: 200 },
    ],
    loop: false,
    next: "rest",
  },
  stretch: {
    frames: [
      { file: "t0", durationMs: 200 },
      { file: "t1", durationMs: 200 },
    ],
    loop: false,
    next: "rest",
  },
  rest: {
    frames: [
      { file: "r0", durationMs: 500 },
      { file: "r1", durationMs: 500 },
    ],
    loop: true,
  },
};
test("cat pause freezes frame and fractional time; resume continues without restart", () => {
  const p = new CatPlayer(animations);
  p.advance(650, false);
  expect(p.frame().file).toBe("s1");
  p.advance(10000, true);
  expect(p.frame().file).toBe("s1");
  expect(p.elapsed).toBe(150);
  p.advance(350, false);
  expect(p.frame().file).toBe("s0");
});
test("wake and stretch play once then quiet rest; state changes start at first frame", () => {
  const p = new CatPlayer(animations);
  p.setState("wake");
  p.advance(200, false);
  expect(p.frame().file).toBe("w1");
  p.advance(200, false);
  expect(p.state).toBe("rest");
  p.setState("stretch");
  p.advance(400, false);
  expect(p.state).toBe("rest");
  p.setState("sleep");
  expect(p.frame().file).toBe("s0");
});
