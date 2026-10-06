import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { CHANNELS } from '../../shared/focus/constants';
import type { TimerService } from './timer-service';

export interface IpcDeps {
  service: TimerService;
  ready: Promise<unknown>;
  assertKnownSender(event: IpcMainInvokeEvent): void;
  showMain(): void;
  showMini(): void | Promise<void>;
}

export function registerIpc({ service, ready, assertKnownSender, showMain, showMini }: IpcDeps): void {
  ipcMain.handle(CHANNELS.getState, async (event) => {
    assertKnownSender(event);
    await ready;
    return service.getSnapshot();
  });

  // 입력 검증은 서비스의 parseCommand 가 한다.
  ipcMain.handle(CHANNELS.dispatch, async (event, cmd: unknown) => {
    assertKnownSender(event);
    await ready;
    return service.dispatch(cmd);
  });

  ipcMain.handle(CHANNELS.windows, (event, action: unknown) => {
    assertKnownSender(event);
    if (action === 'showMain') return showMain();
    if (action === 'showMini') return showMini();
    throw new Error(`unknown window action: ${String(action)}`);
  });
}
