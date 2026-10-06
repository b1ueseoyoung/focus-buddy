import { app, powerMonitor, powerSaveBlocker } from 'electron';
import type { Snapshot } from '../../shared/focus/types';
import type { TimerService } from './timer-service';

const logFailure = (what: string) => (error: unknown): void => {
  console.error(`focus power ${what} failed`, error);
};

export function registerPower(service: TimerService, ready: Promise<unknown>): (snapshot: Snapshot) => void {
  powerMonitor.on('suspend', () => {
    ready.then(() => service.onSuspend()).catch(logFailure('suspend'));
  });
  powerMonitor.on('resume', () => {
    ready.then(() => service.onResumeFromSleep()).catch(logFailure('resume'));
  });
  // 시스템 종료도 before-quit 저장 경로를 탄다. Electron 31 타입에는 인자가 없지만 런타임은 preventDefault 가능한 Event 를 넘긴다(문서).
  powerMonitor.on('shutdown', (event?: Electron.Event) => {
    event?.preventDefault();
    app.quit();
  });

  let blocker: number | null = null;
  return (snapshot) => {
    const running = snapshot.status === 'running';
    if (running && blocker === null) {
      blocker = powerSaveBlocker.start('prevent-app-suspension');
    } else if (!running && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
  };
}
