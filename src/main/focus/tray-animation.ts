// Windows owns one persistent Tray; only its cat image changes.
export type TrayPose = 'sleep' | 'rest';
export interface AnimationScheduler {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const DELAYS = [4600, 100, 100, 200];

export class TrayAnimation {
  mode: TrayPose = 'sleep';
  frame = 0;
  changes = 0;
  private timer: unknown;
  private deadline = 0;
  private remaining = DELAYS[0];
  private stopped = false;
  constructor(private readonly scheduler: AnimationScheduler, private readonly show: (mode: TrayPose, frame: number) => void) {
    show(this.mode, this.frame);
  }
  get running(): boolean { return this.timer !== undefined; }
  update(status: string, phase: string): void {
    if (this.stopped) return;
    const mode = phase === 'focus' ? 'sleep' : 'rest';
    if (mode !== this.mode) {
      this.cancel();
      this.mode = mode;
      this.frame = 0;
      this.remaining = DELAYS[0];
      this.show(this.mode, this.frame);
    }
    if (status === 'paused') {
      if (this.running) this.remaining = Math.max(0, this.deadline - this.scheduler.now());
      this.cancel();
      return;
    }
    if (!this.running) this.schedule();
  }
  private cancel(): void {
    if (this.running) this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }
  private schedule(): void {
    this.deadline = this.scheduler.now() + this.remaining;
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      this.frame = (this.frame + 1) % DELAYS.length;
      this.changes++;
      this.show(this.mode, this.frame);
      this.remaining = DELAYS[this.frame];
      this.schedule();
    }, this.remaining);
  }
  dispose(): void { this.stopped = true; this.cancel(); }
}

// NativeImage uses premultiplied BGRA on Windows. Preserve alpha and shape,
// choosing black/white for the taskbar's system theme (not the app theme).
export function tintTrayBitmap(bitmap: Buffer, darkTaskbar: boolean): Buffer {
  const tinted = Buffer.from(bitmap);
  for (let offset = 0; offset < tinted.length; offset += 4) {
    const channel = darkTaskbar ? tinted[offset + 3] : 0;
    tinted[offset] = tinted[offset + 1] = tinted[offset + 2] = channel;
  }
  return tinted;
}
