export interface Clock {
  mono(): number;
  wall(): number;
  tz(): string;
}

export class FakeClock implements Clock {
  private monoMs: number;
  private wallMs: number;
  private tzStr: string;

  constructor(opts: { mono?: number; wall: number; tz: string }) {
    this.monoMs = opts.mono ?? 0;
    this.wallMs = opts.wall;
    this.tzStr = opts.tz;
  }

  mono(): number {
    return this.monoMs;
  }

  wall(): number {
    return this.wallMs;
  }

  tz(): string {
    return this.tzStr;
  }

  advance(ms: number): void {
    this.monoMs += ms;
    this.wallMs += ms;
  }

  jumpWall(ms: number): void {
    this.wallMs += ms;
  }

  setTz(tz: string): void {
    this.tzStr = tz;
  }
}
