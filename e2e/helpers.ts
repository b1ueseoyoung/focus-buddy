// Original candidate-only Playwright harness, written on 2026-10-06.
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import type { Command, DispatchResult, PersistedState, Snapshot } from '../src/shared/focus/types';

export const candidateRoot = resolve(import.meta.dir, '..');
const profilePrefix = '/tmp/focus-buddy-candidate-';
const fixedWall = Date.UTC(2026, 9, 6, 3);

export async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value: T;
  do {
    value = await read();
    if (accept(value)) return value;
    await new Promise<void>((done) => setTimeout(done, 50));
  } while (Date.now() < deadline);
  throw new Error(`Candidate condition timed out; last value: ${JSON.stringify(value!)}`);
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
  windows(): Promise<Array<{ name: 'main' | 'mini'; visible: boolean; alwaysOnTop: boolean }>>;
  mini(): Promise<Page>;
  persisted(): Promise<PersistedState>;
  close(): Promise<void>;
}

export async function launchCandidate(options: { userDataDir?: string; executablePath?: string } = {}): Promise<CandidateApp> {
  const userDataDir = options.userDataDir ?? await mkdtemp(profilePrefix);
  if (!resolve(userDataDir).startsWith(profilePrefix)) {
    throw new Error('Candidate E2E requires its own /tmp/focus-buddy-candidate-* profile');
  }
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
  let closed = false;
  try {
    const main = await app.firstWindow({ timeout: 20000 });
    await main.waitForFunction(() => Boolean(window.focusBuddy && window.focusBuddyTest), undefined, { timeout: 15000 });
    await main.evaluate(() => window.focusBuddy!.getState());
    return {
      app, main, userDataDir,
      snapshot: (page = main) => page.evaluate(() => window.focusBuddy!.getState()),
      async dispatch(command, page = main) {
        const result: DispatchResult = await page.evaluate((cmd) => window.focusBuddy!.dispatch(cmd), command);
        if (!result.ok) throw new Error(`Candidate command failed: ${result.code}: ${result.message}`);
        return result.snapshot;
      },
      advance: (ms, page = main) => page.evaluate((value) => window.focusBuddyTest!.advance(value), ms),
      trayAction: (label) => main.evaluate((value) => window.focusBuddyTest!.trayClick(value), label),
      nativeAction: (label) => main.evaluate((value) => window.electron!.ipcRenderer.invoke('focus:native-menu-test', value), label),
      windows: () => main.evaluate(() => window.focusBuddyTest!.windowsInfo()),
      async mini() {
        const page = await waitFor(async () => app.windows().find((window) => window.url().includes('#/mini')) ?? null, Boolean);
        if (!page) throw new Error('Candidate mini window did not mount');
        await page.waitForFunction(() => Boolean(window.focusBuddy && window.focusBuddyTest));
        await page.locator('.pixel-clock').waitFor({ state: 'attached' });
        await page.evaluate(() => window.focusBuddy!.getState());
        return page;
      },
      async persisted() {
        await main.evaluate(() => window.focusBuddyTest!.saveNow());
        return JSON.parse(await readFile(join(userDataDir, 'focus-buddy.json'), 'utf8')) as PersistedState;
      },
      async close() {
        if (closed || app.process().exitCode !== null || app.process().signalCode !== null) return;
        closed = true;
        const exit = app.waitForEvent('close', { timeout: 20000 });
        await main.evaluate(() => window.focusBuddyTest!.quit());
        await exit;
      },
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
