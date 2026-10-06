import type { Clock } from '../../shared/focus/clock';

export interface E2EClockControls {
  advance(ms: number): void;
  jumpWall(ms: number): void;
}

export type SystemClock = Clock & Partial<E2EClockControls>;

export function createSystemClock(): SystemClock {
  let monoOffset = 0;
  let wallOffset = 0;
  const clock: Clock = {
    mono: () => performance.now() + monoOffset,
    wall: () => Date.now() + wallOffset,
    tz: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  if (process.env.FOCUS_BUDDY_E2E !== '1') return clock;

  const fixedWall = Number(process.env.FOCUS_BUDDY_E2E_WALL_MS);
  if (process.env.FOCUS_BUDDY_E2E_WALL_MS && Number.isFinite(fixedWall)) wallOffset = fixedWall - Date.now();
  return {
    ...clock,
    advance: (ms) => {
      monoOffset += ms;
      wallOffset += ms;
    },
    jumpWall: (ms) => {
      wallOffset += ms;
    },
  };
}
