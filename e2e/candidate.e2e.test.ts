// Original isolated-profile integration tests, written on 2026-10-06.
// AppKit actions and clock/suspend hooks are fixtures; no physical OS sleep or click is claimed.
import { afterEach, expect, test } from 'bun:test';
import type { Page } from 'playwright';
import { launchCandidate, waitFor, type CandidateApp } from './helpers';

const macTest = process.platform === 'darwin' ? test : test.skip;
const active = new Set<CandidateApp>();
async function launch(userDataDir?: string): Promise<CandidateApp> {
  const app = await launchCandidate({ userDataDir });
  active.add(app);
  return app;
}
afterEach(async () => {
  for (const app of active) await app.close();
  active.clear();
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

macTest('fresh candidate is menu-bar-first; native timer is ready and its settings action shows the hidden main window', async () => {
  const app = await launch();
  const state = await app.snapshot();
  expect(state.status).toBe('idle');
  expect(state.settings.durations).toEqual({ focusMin: 25, shortBreakMin: 5, longBreakMin: 15 });
  expect(state.settings.soundEnabled).toBe(false);
  expect((await app.windows()).every((window) => !window.visible)).toBe(true);
  const menu = await app.main.evaluate(() => window.focusBuddyTest!.trayMenu());
  expect(menu.some((item) => item.label === '위젯 켜기' && item.enabled)).toBe(true);
  const runtime = await waitFor(
    () => app.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:runtime-info')),
    (value) => value.tray.backend === 'AppKit' && value.tray.ready === true && value.tray.bounds?.width > 0,
  );
  expect(runtime.userData).toBe(app.userDataDir);
  expect(runtime.tray.title).toBe('25:00');
  expect(runtime.tray.visible).toBe(true);
  expect(Math.abs(runtime.tray.bounds.width - 74)).toBeLessThanOrEqual(2);
  expect(runtime.tray.imageSize).toEqual({ width: 18, height: 18 });
  await app.nativeAction('설정 및 작업명');
  await waitFor(() => app.windows(), (windows) => windows.some((window) => window.name === 'main' && window.visible));
  expect(await app.main.getByRole('heading', { name: '집중 리듬' }).isVisible()).toBe(true);
}, 60000);

macTest('main and widget share timer controls, completion, manual next, four-focus long break and skip', async () => {
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
  state = await app.snapshot();
  expect(state.status).toBe('awaiting_next');
  expect(state.suggestedNext).toBe('focus');
  expect(state.today.completedFocusCount).toBe(4);
  expect(new Set(state.today.sessions.map((session) => session.id)).size).toBe(state.today.sessions.length);
  await shared(app, mini);
}, 120000);

macTest('widget on/off and 100-to-125 percent scale persist across a relaunch without duplicate completion records', async () => {
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
  expect((await app.windows()).find((window) => window.name === 'mini')?.visible).toBe(false);
  await app.trayAction('위젯 켜기');
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

macTest('UI saves a task and custom settings; history survives normal quit and active work recovers paused in the same isolated profile', async () => {
  let app = await launch();
  await app.trayAction('설정 및 작업명');
  const main = app.main;
  await main.getByRole('radio', { name: /직접 설정/ }).check();
  await main.getByRole('spinbutton', { name: '집중 시간(분)' }).fill('1');
  await main.getByRole('spinbutton', { name: '짧은 휴식(분)' }).fill('2');
  await main.getByRole('spinbutton', { name: '긴 휴식(분)' }).fill('3');
  await main.getByRole('textbox', { name: '작업명' }).fill('candidate local task');
  await main.getByRole('button', { name: '설정 저장', exact: true }).click();
  await waitFor(() => app.snapshot(), (state) => state.settings.preset === 'custom' && state.settings.durations.longBreakMin === 3);
  await main.getByText('저장했어요. 다음 집중부터 함께해요.', { exact: true }).waitFor();
  await app.trayAction('시작');
  let state = await app.snapshot();
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
  expect(state.today.completedFocusCount).toBe(1);
  await app.trayAction('오늘 기록');
  await app.main.getByRole('heading', { name: '오늘의 집중', exact: true }).waitFor();
  expect(await app.main.getByText('candidate local task', { exact: true }).count()).toBeGreaterThan(0);
  expect(new Set((await app.persisted()).sessions.map((session) => session.id)).size).toBe(state.today.sessions.length);
}, 90000);

macTest('hidden windows keep elapsed time; simulated suspend pauses and wake cannot resume without an explicit user command', async () => {
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
