export type CatState = "sleep" | "wake" | "stretch" | "rest";
export interface CatFrame {
  file: string;
  durationMs: number;
}
export interface CatAnimation {
  frames: CatFrame[];
  loop: boolean;
  next?: CatState;
}
export type CatAnimations = Record<CatState, CatAnimation>;
/** A single stable frame canvas; pause preserves the exact frame and elapsed fraction. */
export class CatPlayer {
  state: CatState;
  index = 0;
  elapsed = 0;
  constructor(
    readonly animations: CatAnimations,
    initial: CatState = "sleep",
  ) {
    this.state = initial;
  }
  setState(state: CatState): void {
    if (state === this.state) return;
    this.state = state;
    this.index = 0;
    this.elapsed = 0;
  }
  frame(): CatFrame {
    return this.animations[this.state].frames[this.index];
  }
  advance(ms: number, paused: boolean): void {
    if (paused || !Number.isFinite(ms) || ms < 0) return;
    this.elapsed += ms;
    for (
      let guard = 0;
      guard < 1000 && this.elapsed >= this.frame().durationMs;
      guard++
    ) {
      this.elapsed -= this.frame().durationMs;
      const row = this.animations[this.state];
      if (this.index + 1 < row.frames.length) this.index++;
      else if (row.loop) this.index = 0;
      else if (row.next) {
        this.state = row.next;
        this.index = 0;
      } else {
        this.elapsed = 0;
        break;
      }
    }
  }
}
