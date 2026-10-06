import { app, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { CHANNELS, TICK_MS } from '../../shared/focus/constants';
import type { SystemClock } from './system-clock';
import type { TimerService } from './timer-service';
import type { TrayItem } from './tray';
import type { WindowInfo } from './windows';

export interface TestHookDeps {
  clock: SystemClock;
  service: TimerService;
  ready: Promise<unknown>;
  assertKnownSender(event: IpcMainInvokeEvent): void;
  trayItems(): TrayItem[];
  trayTitle(): string;
  windowsInfo(): WindowInfo[];
}

const msArg = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`invalid ms: ${String(value)}`);
  return value;
};

export function registerTestHooks({
  clock, service, ready, assertKnownSender, trayItems, trayTitle, windowsInfo,
}: TestHookDeps): void {
  if (process.env.FOCUS_BUDDY_E2E !== '1') return;
  const { advance, jumpWall } = clock;
  if (!advance || !jumpWall) throw new Error('E2E clock controls are missing');

  ipcMain.handle(CHANNELS.test, async (event, action: unknown, arg: unknown) => {
    assertKnownSender(event);
    await ready;
    switch (action) {
      case 'advance': {
        // 한 번에 크게 옮기면 정체 가드(30초)가 걸리므로 틱 간격으로 나눈다.
        for (let left = msArg(arg); left > 0; left -= TICK_MS) {
          advance(Math.min(TICK_MS, left));
          await service.tick({ broadcast: false });
        }
        await service.tick();
        return;
      }
      case 'jumpWall':
        jumpWall(msArg(arg));
        return;
      case 'suspend':
        await service.onSuspend();
        return;
      case 'resumeFromSleep':
        service.onResumeFromSleep();
        return;
      case 'saveNow':
        await service.saveNow();
        return;
      case 'quit':
        // 응답을 먼저 보낸 뒤 종료한다(before-quit 저장 경로).
        setImmediate(() => app.quit());
        return;
      case 'trayMenu':
        return trayItems().map(({ label, enabled }) => ({ label, enabled }));
      case 'trayTitle':
        return trayTitle();
      case 'trayClick': {
        const item = trayItems().find(({ label }) => label === arg);
        if (!item) throw new Error(`unknown tray item: ${String(arg)}`);
        if (!item.enabled) throw new Error(`tray item is disabled: ${item.label}`);
        await item.click();
        return;
      }
      case 'windowsInfo':
        return windowsInfo();
      default:
        throw new Error(`unknown test action: ${String(action)}`);
    }
  });
}
