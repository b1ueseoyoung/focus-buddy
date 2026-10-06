// Original isolated-profile integration tests, written on 2026-10-06.
// AppKit dispatch/Electron MenuItem callbacks and clock/suspend hooks are fixtures.
// They do not claim physical notification-area/menu-bar clicks or OS sleep.
import { afterAll, afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { Page } from 'playwright';
import { launchCandidate, waitFor, within, type CandidateApp } from './helpers';

const desktopTest = ['darwin', 'win32'].includes(process.platform) ? test : test.skip;
const windowsTest = process.platform === 'win32' ? test : test.skip;
const active = new Set<CandidateApp>();
const cleanupErrors: unknown[] = [];
async function launch(userDataDir?: string): Promise<CandidateApp> {
  const app = await launchCandidate({ userDataDir });
  active.add(app);
  return app;
}
afterEach(async () => {
  const apps = [...active];
  active.clear();
  const retained = new Set<string>();
  for (const app of apps) {
    try { await app.close(); }
    catch (error) {
      cleanupErrors.push(error);
      retained.add(app.userDataDir);
      console.warn(`[E2E cleanup] isolated profile retained after shutdown failure: ${String(error)}`);
    }
  }
  for (const profile of new Set(apps.map((app) => app.userDataDir))) {
    if (retained.has(profile)) continue;
    try {
      await within('remove isolated profile', () => rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }), 4000);
    } catch (error) {
      // Windows may retain Chromium file handles briefly; never obscure the test failure.
      console.warn(`[E2E cleanup] temporary profile remains for runner cleanup: ${String(error)}`);
    }
  }
}, 30000);
afterAll(() => {
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Candidate shutdown cleanup failed; preceding test failures remain primary');
});

async function smallDurations(app: CandidateApp): Promise<void> {
  await app.dispatch({ type: 'updateSettings', patch: { preset: 'custom', durations: { focusMin: 1, shortBreakMin: 1, longBreakMin: 2 } } });
}
async function shared(app: CandidateApp, mini: Page): Promise<void> {
  const [mainState, miniState] = await Promise.all([app.snapshot(), app.snapshot(mini)]);
  expect(miniState.sessionId).toBe(mainState.sessionId);
  expect(miniState.status).toBe(mainState.status);
  expect(miniState.phase).toBe(mainState.phase);
  expect(miniState.cycleCount).toBe(mainState.cycleCount);
  expect(Math.abs(miniState.remainingMs - mainState.remainingMs)).toBeLessThan(1500);
}

desktopTest('fresh candidate starts with hidden windows and a ready platform tray; actual menu callback opens settings', async () => {
  const app = await launch();
  const state = await app.snapshot();
  expect(state.status).toBe('idle');
  expect(state.settings.durations).toEqual({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15 });
  expect(state.settings.soundEnabled).toBe(false);
  expect((await app.windows()).every((window) => !window.visible)).toBe(true);
  const menu = await app.main.evaluate(() => window.focusBuddyTest!.trayMenu());
  expect(menu.some((item) => item.label === '위젯 켜기' && item.enabled)).toBe(true);
  const runtime = await app.runtime();
  expect(runtime.userData).toBe(app.userDataDir);
  expect(runtime.tray.backend).toBe(process.platform === 'darwin' ? 'AppKit' : 'Electron');
  expect(runtime.tray.ready).toBe(true);
  expect(runtime.tray.retained).toBe(true);
  expect(runtime.tray.destroyed).toBe(false);
  expect(runtime.tray.imageEmpty).toBe(false);
  expect(runtime.tray.title).toBe('25:00');
  if (process.platform === 'darwin') {
    expect(runtime.tray.visible).toBe(true);
    expect(Math.abs(runtime.tray.bounds!.width - 74)).toBeLessThanOrEqual(2);
    expect(runtime.tray.imageSize).toEqual({ width: 18, height: 18 });
  } else {
    expect(runtime.tray.template).toBe(false);
    expect(runtime.tray.imageSize.width).toBeGreaterThan(0);
    expect(runtime.tray.imageSize.height).toBeGreaterThan(0);
  }
  await expect(app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:native-menu-test', '일시정지'))).rejects.toThrow();
  await app.nativeAction('설정 및 작업명');
  await waitFor(() => app.windows(), (windows) => windows.some((window) => window.name === 'main' && window.visible));
  expect(await app.main.getByRole('heading', { name: '집중 리듬' }).isVisible()).toBe(true);
  await app.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes('#/mini'));
    if (!main) throw new Error('Main window missing');
    main.close();
  });
  await waitFor(() => app.windows(), (windows) => windows.every((window) => !window.visible));
  expect(app.app.process().exitCode).toBeNull();
  await app.nativeAction('오늘 기록');
  await app.main.getByRole('heading', { name: '오늘의 집중', exact: true }).waitFor();
}, 60000);

desktopTest('main and widget share timer controls, completion, manual next, four-focus long break and skip', async () => {
  const app = await launch();
  await smallDurations(app);
  await app.trayAction('위젯 켜기');
  const mini = await app.mini();
  let state = await app.dispatch({ type: 'startFocus', taskName: 'single-state check' }, mini);
  const firstId = state.sessionId;
  await app.advance(5000);
  state = await app.dispatch({ type: 'pause' });
  const paused = state.remainingMs;
  await app.advance(3000, mini);
  expect((await app.snapshot()).remainingMs).toBe(paused);
  await shared(app, mini);
  await app.dispatch({ type: 'resume' }, mini);
  await app.advance(1000);
  state = await app.dispatch({ type: 'resetCurrent' });
  expect(state.status).toBe('awaiting_next');
  expect(state.suggestedNext).toBe('focus');
  expect(state.cycleCount).toBe(0);
  expect(state.today.sessions.find((session) => session.id === firstId)?.status).toBe('interrupted');
  await shared(app, mini);

  for (let count = 1; count <= 4; count++) {
    state = await app.dispatch({ type: 'startNext', taskName: `focus ${count}` }, mini);
    expect(state.phase).toBe('focus');
    await app.advance(state.remainingMs + 1000);
    state = await app.snapshot();
    expect(state.status).toBe('awaiting_next');
    expect(state.sessionId).toBeNull();
    expect(state.cycleCount).toBe(count);
    expect(state.suggestedNext).toBe(count === 4 ? 'long_break' : 'short_break');
    await app.advance(1000);
    expect((await app.snapshot()).status).toBe('awaiting_next');
    await shared(app, mini);
    if (count < 4) {
      await app.dispatch({ type: 'skipBreak' });
      expect((await app.snapshot(mini)).suggestedNext).toBe('focus');
    }
  }
  state = await app.dispatch({ type: 'startNext', taskName: '' });
  expect(state.phase).toBe('long_break');
  expect(state.plannedSeconds).toBe(120);
  await app.trayAction('휴식 건너뛰기');
  state = await waitFor(() => app.snapshot(), (snapshot) => snapshot.status === 'awaiting_next' && snapshot.suggestedNext === 'focus');
  expect(state.status).toBe('awaiting_next');
  expect(state.suggestedNext).toBe('focus');
  expect(state.today.completedFocusCount).toBe(4);
  expect(new Set(state.today.sessions.map((session) => session.id)).size).toBe(state.today.sessions.length);
  await shared(app, mini);
}, 120000);

desktopTest('widget on/off and 100-to-125 percent scale persist across a relaunch without duplicate completion records', async () => {
  let app = await launch();
  await smallDurations(app);
  await app.trayAction('위젯 켜기');
  const mini = await app.mini();
  expect(await app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:widget-scale'))).toBe(1);
  await app.trayAction('위젯 크기 125%');
  await waitFor(() => mini.locator('.pixel-viewport').evaluate((element) => element.getBoundingClientRect().width), (width) => Math.abs(width - 350) < 1);
  await app.dispatch({ type: 'startFocus', taskName: 'persist once' });
  await app.advance(61000);
  const completed = await app.persisted();
  expect(completed.completions.length).toBe(1);
  await app.trayAction('위젯 끄기');
  await waitFor(() => app.windows(), (windows) => windows.find((window) => window.name === 'mini')?.visible === false);
  expect((await app.windows()).find((window) => window.name === 'mini')?.visible).toBe(false);
  await app.trayAction('위젯 켜기');
  await waitFor(() => app.windows(), (windows) => windows.some((window) => window.name === 'mini' && window.visible));
  const profile = app.userDataDir;
  await app.close();
  app = await launch(profile);
  await waitFor(() => app.windows(), (windows) => windows.some((window) => window.name === 'mini' && window.visible));
  const restoredMini = await app.mini();
  expect(await app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:widget-scale'))).toBe(1.25);
  expect(await restoredMini.locator('.pixel-viewport').evaluate((element) => element.getBoundingClientRect().width)).toBe(350);
  const restored = await app.persisted();
  expect(restored.completions.map((item) => item.sessionId)).toEqual(completed.completions.map((item) => item.sessionId));
  expect(restored.sessions.map((session) => session.id)).toEqual(completed.sessions.map((session) => session.id));
  expect((await app.snapshot()).today.completedFocusCount).toBe(1);
}, 90000);

desktopTest('UI saves a task and custom settings; history survives normal quit and active work recovers paused in the same isolated profile', async () => {
  let app = await launch();
  await app.trayAction('설정 및 작업명');
  const main = app.main;
  await main.getByRole('radio', { name: /직접 설정/ }).check();
  await main.getByRole('spinbutton', { name: '집중 시간(분)' }).fill('1');
  await main.getByRole('spinbutton', { name: '짧은 휴식(분)' }).fill('2');
  await main.getByRole('spinbutton', { name: '긴 휴식(분)' }).fill('3');
  await main.getByRole('switch', { name: '작은 창 항상 위에 표시' }).uncheck();
  await main.getByRole('switch', { name: 'OS 알림', exact: true }).uncheck();
  await main.getByRole('switch', { name: '고양이 코골이 소리', exact: true }).check();
  const task = main.getByRole('textbox', { name: '작업명' });
  await task.fill('candidate local task');
  await task.blur();
  await waitFor(() => task.inputValue(), (value) => value === 'candidate local task');
  await main.getByRole('button', { name: '설정 저장', exact: true }).click();
  await waitFor(() => app.snapshot(), (state) => state.settings.preset === 'custom' && state.settings.durations.longBreakMin === 3);
  await main.getByText('저장했어요. 다음 집중부터 함께해요.', { exact: true }).waitFor();
  await waitFor(() => main.evaluate(() => localStorage.getItem('focus-buddy.pixel.next-task')), (value) => value === 'candidate local task');
  await app.trayAction('시작');
  let state = await waitFor(() => app.snapshot(), (snapshot) => snapshot.status === 'running');
  expect(state.taskName).toBe('candidate local task');
  await app.advance(61000);
  await app.dispatch({ type: 'skipBreak' });
  state = await app.dispatch({ type: 'startNext', taskName: 'recover active task' });
  const recoverId = state.sessionId;
  await app.advance(7000);
  const before = await app.snapshot();
  const profile = app.userDataDir;
  await app.close();
  app = await launch(profile);
  state = await app.snapshot();
  expect(state.status).toBe('paused');
  expect(state.sessionId).toBe(recoverId);
  expect(state.recovery?.kind).toBe('quit');
  expect(Math.abs(state.remainingMs - before.remainingMs)).toBeLessThan(2000);
  expect(state.settings.durations).toEqual({ focusMin: 1, shortBreakMin: 2, longBreakMin: 3 });
  expect(state.settings.alwaysOnTop).toBe(false);
  expect(state.settings.osNotificationEnabled).toBe(false);
  expect(await app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:snore-settings'))).toBe(true);
  expect(state.today.completedFocusCount).toBe(1);
  await app.trayAction('오늘 기록');
  await app.main.getByRole('heading', { name: '오늘의 집중', exact: true }).waitFor();
  expect(await app.main.getByText('candidate local task', { exact: true }).count()).toBeGreaterThan(0);
  expect(new Set((await app.persisted()).sessions.map((session) => session.id)).size).toBe(state.today.sessions.length);
  await app.trayAction('위젯 켜기');
  await app.mini();
  await waitFor(() => app.windows(), (windows) => windows.some((window) => window.name === 'mini' && window.visible));
  expect((await app.windows()).find((window) => window.name === 'mini')?.alwaysOnTop).toBe(false);
}, 90000);

desktopTest('hidden windows keep elapsed time; simulated suspend pauses and wake cannot resume without an explicit user command', async () => {
  const app = await launch();
  await smallDurations(app);
  await app.dispatch({ type: 'startFocus', taskName: 'hidden clock' });
  expect((await app.windows()).every((window) => !window.visible)).toBe(true);
  const before = await app.snapshot();
  await app.advance(9000);
  expect(before.remainingMs - (await app.snapshot()).remainingMs).toBeGreaterThanOrEqual(9000);
  await app.main.evaluate(() => window.focusBuddyTest!.suspend());
  const sleeping = await app.snapshot();
  expect(sleeping.status).toBe('paused');
  expect(sleeping.recovery?.kind).toBe('sleep');
  await app.advance(30000);
  await app.main.evaluate(() => window.focusBuddyTest!.resumeFromSleep());
  expect((await app.snapshot()).status).toBe('paused');
  expect((await app.snapshot()).remainingMs).toBe(sleeping.remainingMs);
  await app.dispatch({ type: 'resume' });
  await app.advance(2000);
  const resumed = await app.snapshot();
  expect(resumed.status).toBe('running');
  expect(sleeping.remainingMs - resumed.remainingMs).toBeGreaterThanOrEqual(2000);
  expect(resumed.today.completedFocusCount).toBe(0);
}, 60000);

desktopTest('actual menu callbacks start, pause, resume and reset; widget cat animates, freezes and changes to rest', async () => {
  const app = await launch();
  await smallDurations(app);
  await app.trayAction('위젯 켜기');
  const mini = await app.mini();
  await mini.emulateMedia({ reducedMotion: 'no-preference' });
  const cat = mini.locator('.pixel-cat');
  await waitFor(() => cat.getAttribute('data-animation-ready'), (ready) => ready === 'true');
  expect(await waitFor(() => cat.evaluate((element) => (element as HTMLImageElement).naturalWidth), (width) => width > 0)).toBeGreaterThan(0);

  await app.nativeAction('시작');
  const started = await waitFor(() => app.snapshot(), (state) => state.status === 'running');
  expect(started.phase).toBe('focus');
  await waitFor(() => cat.getAttribute('data-animation'), (state) => state === 'sleep');
  const movingFrame = await cat.getAttribute('src');
  await waitFor(() => cat.getAttribute('src'), (frame) => frame !== movingFrame);

  await app.nativeAction('일시정지');
  await waitFor(() => app.snapshot(), (state) => state.status === 'paused');
  await waitFor(() => cat.getAttribute('data-paused'), (paused) => paused === 'true');
  const pausedFrame = await cat.getAttribute('src');
  // Observe longer than one 500ms focus animation frame, using the real renderer clock.
  await new Promise((done) => setTimeout(done, 650));
  expect(await cat.getAttribute('src')).toBe(pausedFrame);
  await app.nativeAction('재개');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running');
  await waitFor(() => cat.getAttribute('src'), (frame) => frame !== pausedFrame);
  await app.nativeAction('현재 타이머 초기화');
  const reset = await waitFor(() => app.snapshot(), (state) => state.status === 'awaiting_next');
  expect(reset.suggestedNext).toBe('focus');
  expect(reset.today.sessions.find((session) => session.id === started.sessionId)?.status).toBe('interrupted');
  expect(reset.settings.durations).toEqual(started.settings.durations);
  await mini.getByRole('button', { name: '▶ 시작', exact: true }).waitFor({ state: 'visible' });

  await app.nativeAction('시작');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running');
  // A core snapshot can lead the persisted/broadcast state. Observe the new
  // running render and an actual frame before jumping a full focus interval.
  await mini.getByRole('button', { name: 'Ⅱ 일시정지', exact: true }).waitFor({ state: 'visible' });
  const restartedFrame = await cat.getAttribute('src');
  await waitFor(() => cat.getAttribute('src'), (frame) => frame !== restartedFrame, 15000, 'restarted focus animation frame');
  await app.advance(61000);
  expect((await app.snapshot()).today.completedFocusCount).toBe(1);
  await waitFor(() => cat.getAttribute('data-animation'), (state) => state === 'rest');
  await app.nativeAction('시작');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running' && state.phase === 'short_break');
  await waitFor(() => cat.getAttribute('data-animation'), (state) => state === 'rest');

  // Reduced motion is an OS/media preference, independent of the timer's test clock.
  await mini.emulateMedia({ reducedMotion: 'reduce' });
  const reducedFrame = await cat.getAttribute('src');
  await new Promise((done) => setTimeout(done, 650));
  expect(await cat.getAttribute('src')).toBe(reducedFrame);
  await mini.emulateMedia({ reducedMotion: 'no-preference' });
  await waitFor(() => cat.getAttribute('src'), (frame) => frame !== reducedFrame);
  await app.nativeAction('현재 단계 종료');
  const finished = await waitFor(() => app.snapshot(), (state) => state.status === 'awaiting_next');
  expect(finished.suggestedNext).toBe('focus');
  expect(finished.today.completedFocusCount).toBe(1);
}, 90000);

desktopTest('widget resize control obeys bounds and preserves scale plus hidden preference after restart', async () => {
  let app = await launch();
  await app.trayAction('위젯 켜기');
  const mini = await app.mini();
  const resize = mini.getByRole('button', { name: '모서리를 끌어 위젯 크기 조절' });
  const scale = (): Promise<number> => app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:widget-scale'));
  const waitScale = async (expected: number): Promise<void> => {
    await waitFor(scale, (value) => Math.abs(value - expected) < 0.001);
    await waitFor(() => mini.locator('.pixel-viewport').evaluate((element) => element.getBoundingClientRect().width), (width) => Math.abs(width - expected * 280) < 1);
  };
  await resize.press('ArrowRight', { delay: 50 });
  await waitScale(1.05);
  const bounds = await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/mini'))!.getBounds());
  expect(bounds.width).toBe(294);
  expect(bounds.height).toBe(326);

  await app.trayAction('위젯 크기 80%');
  await waitScale(0.8);
  await resize.press('ArrowLeft', { delay: 50 });
  expect(await scale()).toBe(0.8);
  await app.trayAction('위젯 크기 150%');
  await waitScale(1.5);
  await resize.press('ArrowRight', { delay: 50 });
  expect(await scale()).toBe(1.5);
  await app.trayAction('위젯 크기 125%');
  await waitScale(1.25);
  await resize.press('ArrowRight', { delay: 50 });
  await waitScale(1.3);
  await app.trayAction('위젯 끄기');
  await waitFor(() => app.windows(), (windows) => windows.every((window) => !window.visible));
  const profile = app.userDataDir;
  await app.close();
  app = await launch(profile);
  expect((await app.windows()).every((window) => !window.visible)).toBe(true);
  expect(await scale()).toBe(1.3);
  await app.trayAction('위젯 켜기');
  const restored = await app.mini();
  await waitFor(() => restored.locator('.pixel-viewport').evaluate((element) => element.getBoundingClientRect().width), (width) => Math.abs(width - 364) < 1);
}, 90000);

windowsTest('Windows Electron tray animates focus/rest icons and holds the exact icon while paused', async () => {
  const app = await launch();
  await smallDurations(app);
  await app.nativeAction('시작');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running');
  const focus = await waitFor(() => app.runtime(), (runtime) => runtime.tray.animation?.mode === 'sleep' && runtime.tray.animation.running);
  expect(focus.tray.backend).toBe('Electron');
  expect(focus.tray.animation!.frames).toBeGreaterThan(1);
  await waitFor(() => app.runtime(), (runtime) => runtime.tray.animation!.changes > focus.tray.animation!.changes, 8000);
  await app.nativeAction('일시정지');
  const paused = await waitFor(() => app.runtime(), (runtime) => runtime.tray.animation?.running === false);
  await new Promise((done) => setTimeout(done, 650));
  const held = await app.runtime();
  expect(held.tray.animation!.frame).toBe(paused.tray.animation!.frame);
  expect(held.tray.animation!.changes).toBe(paused.tray.animation!.changes);
  await app.nativeAction('재개');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running');
  await app.advance(61000);
  await app.nativeAction('시작');
  await waitFor(() => app.snapshot(), (state) => state.status === 'running' && state.phase === 'short_break');
  await waitFor(() => app.runtime(), (runtime) => runtime.tray.animation?.mode === 'rest' && runtime.tray.animation.running);
}, 90000);
