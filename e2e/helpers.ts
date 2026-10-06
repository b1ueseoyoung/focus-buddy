// Original candidate-only Playwright harness, written on 2026-10-06.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import type { Command, DispatchResult, PersistedState, Snapshot } from '../src/shared/focus/types';
import { isolatedProfilePath } from './profile-paths';

export const candidateRoot = resolve(import.meta.dir, '..');
const fixedWall = Date.UTC(2026, 9, 6, 3);

export interface RuntimeInfo {
  userData: string;
  tray: {
    backend: 'AppKit' | 'Electron';
    ready: boolean;
    title: string;
    visible?: boolean;
    retained: boolean;
    destroyed: boolean;
    template: boolean;
    imageEmpty: boolean;
    imageSize: { width: number; height: number };
    bounds?: { width: number; height: number };
    animation?: { mode: string; frame: number; changes: number; running: boolean; frames: number };
  };
}

export async function within<T>(stage: string, operation: () => Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Candidate stage timed out after ${timeoutMs}ms: ${stage}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15000, stage = 'condition'): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value: T;
  do {
    // The read itself can hang (for example a renderer IPC), not just its predicate.
    value = await within(`${stage} read`, read, Math.max(1, deadline - Date.now()));
    if (accept(value)) return value;
    await new Promise<void>((done) => setTimeout(done, 50));
  } while (Date.now() < deadline);
  throw new Error(`Candidate ${stage} timed out; last value: ${JSON.stringify(value!)}`);
}

export interface CandidateApp {
  app: ElectronApplication;
  main: Page;
  userDataDir: string;
  snapshot(page?: Page): Promise<Snapshot>;
  dispatch(command: Command, page?: Page): Promise<Snapshot>;
  advance(ms: number, page?: Page): Promise<void>;
  trayAction(label: string): Promise<void>;
  nativeAction(label: string): Promise<void>;
  runtime(): Promise<RuntimeInfo>;
  windows(): Promise<Array<{ name: 'main' | 'mini'; visible: boolean; alwaysOnTop: boolean }>>;
  mini(): Promise<Page>;
  persisted(): Promise<PersistedState>;
  close(): Promise<void>;
}

export async function launchCandidate(options: { userDataDir?: string; executablePath?: string } = {}): Promise<CandidateApp> {
  const userDataDir = await isolatedProfilePath(options.userDataDir);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  delete env.ELECTRON_RENDERER_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  env.FOCUS_BUDDY_USER_DATA_DIR = userDataDir;
  env.FOCUS_BUDDY_E2E = '1';
  env.FOCUS_BUDDY_E2E_WALL_MS = String(fixedWall);
  env.TZ = 'Asia/Seoul';
  const executablePath = options.executablePath
    ?? process.env.FOCUS_BUDDY_CANDIDATE_ELECTRON
    ?? process.env.FOCUS_BUDDY_TEST_EXECUTABLE;
  const app = await _electron.launch({
    cwd: candidateRoot,
    args: executablePath ? [] : [candidateRoot],
    env,
    ...(executablePath ? { executablePath } : {}),
    timeout: 30000,
  });
  app.context().setDefaultTimeout(15000);
  const childProcess = app.process();
  // On Windows this child PID may be Playwright's cmd.exe wrapper, not Electron.
  let ownedIdentity: { pid: number; userData: string } | undefined;
  let appClosed = false;
  app.once('close', () => { appClosed = true; });
  const exited = (): boolean => appClosed;
  const output: string[] = [];
  const remember = (line: string): void => {
    output.push(line.trim().slice(-1200));
    if (output.length > 12) output.shift();
  };
  childProcess.stdout?.on('data', (data) => remember(String(data)));
  childProcess.stderr?.on('data', (data) => remember(String(data)));
  app.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') remember(`[main ${message.type()}] ${message.text()}`);
  });
  const observe = (page: Page): void => {
    page.on('pageerror', (error) => remember(`[renderer error] ${error.message}`));
    page.on('crash', () => remember(`[renderer crash] ${page.url()}`));
  };
  app.on('window', observe);
  const stage = async <T>(label: string, operation: () => Promise<T>, timeoutMs = 15000): Promise<T> => {
    try {
      return await within(label, operation, timeoutMs);
    } catch (error) {
      console.error(`[E2E pid=${childProcess.pid}] ${label} failed; exit=${childProcess.exitCode}; signal=${childProcess.signalCode}; windows=${JSON.stringify(app.windows().map((page) => ({ url: page.url(), closed: page.isClosed() })))}\n${output.join('\n')}`);
      throw error;
    }
  };
  const readIdentity = (): Promise<{ pid: number; userData: string }> => stage('verify owned Electron PID and profile', () => app.evaluate(({ app }) => ({ pid: process.pid, userData: app.getPath('userData') })), 3000);
  const verifyOwned = async (): Promise<void> => {
    if (!ownedIdentity) throw new Error('Candidate process identity was not verified; refusing shutdown');
    const current = await readIdentity();
    if (current.pid !== ownedIdentity.pid || current.userData !== userDataDir)
      throw new Error('Candidate PID or isolated profile changed; refusing shutdown');
  };
  let closing: Promise<void> | undefined;
  const close = async (): Promise<void> => {
    if (exited()) return;
    if (closing) return closing;
    closing = (async () => {
      // No shutdown request is sent unless both actual Electron PID and profile match.
      await verifyOwned();
      try {
        // Quit in the main process. A hidden renderer need not acknowledge shutdown.
        await stage('request normal quit', () => app.evaluate(({ app }) => { setImmediate(() => app.quit()); }), 3000);
        await waitFor(async () => exited(), Boolean, 6000, 'normal process exit');
      } catch (error) {
        if (exited()) return;
        console.warn(`[E2E pid=${childProcess.pid}] normal quit failed; trying Playwright app.close`);
        await verifyOwned();
        await stage('Playwright app.close fallback', () => app.close(), 3000);
        await waitFor(async () => exited(), Boolean, 2000, 'fallback process exit');
        throw new Error('Candidate normal quit required fallback cleanup', { cause: error });
      }
    })();
    return closing;
  };
  try {
    ownedIdentity = await readIdentity();
    if (ownedIdentity.userData !== userDataDir || !Number.isInteger(ownedIdentity.pid) || ownedIdentity.pid <= 0) {
      ownedIdentity = undefined;
      throw new Error('Candidate launch did not select the isolated profile');
    }
    console.log(`[E2E] owned Electron pid=${ownedIdentity.pid}; launcher pid=${childProcess.pid}; profile verified`);
    const main = await app.firstWindow({ timeout: 20000 });
    observe(main);
    await main.waitForFunction(() => Boolean(window.focusBuddy && window.focusBuddyTest), undefined, { timeout: 15000 });
    await stage('initial snapshot', () => main.evaluate(() => window.focusBuddy!.getState()));
    const trayInfo = (): Promise<RuntimeInfo & { items: Array<{ label: string; enabled: boolean }> }> => stage('main tray diagnostic', () => app.evaluate(({ app }) => {
      let info: (RuntimeInfo & { items: Array<{ label: string; enabled: boolean }> }) | undefined;
      app.emit('focus-buddy:e2e-tray-info', (value: typeof info) => { info = value; });
      if (!info) throw new Error('Candidate tray diagnostic event unavailable');
      return info;
    }));
    const runtime = (): Promise<RuntimeInfo> => trayInfo();
    await waitFor(runtime, (info) => info.tray.ready === true);
    const nativeAction = async (label: string): Promise<void> => {
      console.log(`[E2E pid=${childProcess.pid}] menu waiting: ${label}`);
      await waitFor(
        trayInfo,
        (info) => info.items.some((item) => item.label === label && item.enabled),
        15000,
        `enabled menu item ${label}`,
      );
      // Mirrors a native tray event: executes the actual menu callback in main.
      await stage(`native menu callback: ${label}`, () => app.evaluate(({ app }, value) => {
        if (!app.emit('focus-buddy:e2e-tray-action', value)) throw new Error('Candidate native tray test event unavailable');
      }, label));
      console.log(`[E2E pid=${childProcess.pid}] menu invoked: ${label}`);
    };
    return {
      app, main, userDataDir, runtime,
      snapshot: (page = main) => stage('snapshot', () => page.evaluate(() => window.focusBuddy!.getState())),
      async dispatch(command, page = main) {
        const result: DispatchResult = await stage(`dispatch ${command.type}`, () => page.evaluate((cmd) => window.focusBuddy!.dispatch(cmd), command));
        if (!result.ok) throw new Error(`Candidate command failed: ${result.code}: ${result.message}`);
        return result.snapshot;
      },
      advance: (ms, page = main) => stage(`advance ${ms}ms`, () => page.evaluate((value) => window.focusBuddyTest!.advance(value), ms)),
      // Calls the real AppKit action dispatcher or Electron MenuItem.click callback.
      // Callers await observable state after asynchronous native menu actions.
      trayAction: nativeAction,
      nativeAction,
      windows: () => stage('window visibility', () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({
        name: window.webContents.getURL().includes('#/mini') ? 'mini' as const : 'main' as const,
        visible: window.isVisible(),
        alwaysOnTop: window.isAlwaysOnTop(),
      })))),
      async mini() {
        const page = await waitFor(async () => app.windows().find((window) => window.url().includes('#/mini')) ?? null, Boolean, 15000, 'mini window mount');
        if (!page) throw new Error('Candidate mini window did not mount');
        await page.waitForFunction(() => Boolean(window.focusBuddy && window.focusBuddyTest));
        await page.locator('.pixel-clock').waitFor({ state: 'attached' });
        await stage('mini initial snapshot', () => page.evaluate(() => window.focusBuddy!.getState()));
        return page;
      },
      async persisted() {
        await stage('save profile', () => main.evaluate(() => window.focusBuddyTest!.saveNow()));
        return JSON.parse(await readFile(join(userDataDir, 'focus-buddy.json'), 'utf8')) as PersistedState;
      },
      close,
    };
  } catch (error) {
    await close().catch((cleanup) => console.warn(`[E2E launch cleanup] ${String(cleanup)}`));
    throw error;
  }
}
