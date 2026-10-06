// Actual settings IPC/DOM checks, restricted to profiles created by this harness.
import {afterAll, afterEach, expect, test} from 'bun:test';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {launchCandidate, waitFor, type CandidateApp} from './helpers';
import {isolatedProfilePath} from './profile-paths';

const desktopTest = ['darwin', 'win32'].includes(process.platform) ? test : test.skip;
const active = new Set<CandidateApp>();
const cleanupErrors: unknown[] = [];
const taskKey = 'focus-buddy.pixel.next-task';
async function launch(profile?: string): Promise<CandidateApp> {
  const candidate = await launchCandidate({userDataDir:profile});
  active.add(candidate);
  return candidate;
}
afterEach(async () => {
  const apps = [...active];
  active.clear();
  const retained = new Set<string>();
  for (const candidate of apps) {
    try { await candidate.close(); }
    catch (error) { cleanupErrors.push(error); retained.add(candidate.userDataDir); }
  }
  for (const profile of new Set(apps.map(candidate => candidate.userDataDir))) {
    if (!retained.has(profile)) await rm(profile, {recursive:true, force:true, maxRetries:3, retryDelay:200});
  }
}, 30000);
afterAll(() => {
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Settings test shutdown failed; isolated profiles retained');
});

desktopTest('a snore disk failure rejects the form save, preserves the task and accepted value, and retries durably', async () => {
  let candidate = await launch();
  await candidate.main.evaluate(key => localStorage.setItem(key, 'previous task'), taskKey);
  await candidate.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:snore-settings', false));
  const path = join(candidate.userDataDir, 'focus-snore.json');
  const previous = await readFile(path, 'utf8');
  await candidate.nativeAction('설정 및 작업명');
  const main = candidate.main;
  const snore = main.getByRole('switch', {name:'고양이 코골이 소리', exact:true});
  await waitFor(() => snore.isEnabled(), Boolean);
  await main.getByRole('radio', {name:/직접 설정/}).check();
  await main.getByRole('spinbutton', {name:'집중 시간(분)'}).fill('1');
  await main.getByRole('textbox', {name:'작업명'}).fill('retry task');
  await snore.check();
  await mkdir(`${path}.tmp`);
  await main.getByRole('button', {name:'설정 저장', exact:true}).click();
  await main.getByRole('alert').filter({hasText:'코골이 설정을 저장하지 못했어요'}).waitFor();
  expect(await main.getByText('저장했어요. 다음 집중부터 함께해요.', {exact:true}).count()).toBe(0);
  expect(await main.getByRole('textbox', {name:'작업명'}).inputValue()).toBe('retry task');
  expect(await main.evaluate(key => localStorage.getItem(key), taskKey)).toBe('previous task');
  expect(await main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:snore-settings'))).toBe(false);
  expect(await readFile(path, 'utf8')).toBe(previous);
  expect((await candidate.snapshot()).settings.durations.focusMin).toBe(1);

  await rm(`${path}.tmp`, {recursive:true});
  await main.getByRole('button', {name:'설정 저장', exact:true}).click();
  await main.getByText('저장했어요. 다음 집중부터 함께해요.', {exact:true}).waitFor();
  expect(await main.evaluate(key => localStorage.getItem(key), taskKey)).toBe('retry task');
  expect(JSON.parse(await readFile(path, 'utf8')).sound).toBe(true);
  const profile = candidate.userDataDir;
  await candidate.close();
  candidate = await launch(profile);
  expect((await candidate.snapshot()).settings.durations.focusMin).toBe(1);
  expect(await candidate.main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:snore-settings'))).toBe(true);
  await candidate.nativeAction('설정 및 작업명');
  const restored = candidate.main.getByRole('switch', {name:'고양이 코골이 소리', exact:true});
  await waitFor(() => restored.isEnabled(), Boolean);
  expect(await restored.isChecked()).toBe(true);
  expect(await candidate.main.getByRole('textbox', {name:'작업명'}).inputValue()).toBe('retry task');
}, 60000);

desktopTest('unreadable snore preferences do not stop the timer or overwrite the file; settings can reload after recovery', async () => {
  const profile = await isolatedProfilePath();
  const path = join(profile, 'focus-snore.json');
  await mkdir(path); // EISDIR is a real read failure on both macOS and Windows.
  const candidate = await launch(profile);
  await candidate.nativeAction('설정 및 작업명');
  const main = candidate.main;
  const snore = main.getByRole('switch', {name:'고양이 코골이 소리', exact:true});
  await main.getByRole('alert').filter({hasText:'코골이 설정을 읽지 못했어요'}).waitFor();
  expect(await snore.isDisabled()).toBe(true);
  expect(await main.getByRole('button', {name:'설정 저장', exact:true}).isDisabled()).toBe(true);
  await expect(main.evaluate(() => window.electron!.ipcRenderer.invoke('focus:snore-settings'))).rejects.toThrow();
  const started = await candidate.dispatch({type:'startFocus', taskName:'read recovery fixture'});
  await candidate.advance(7000);
  const running = await candidate.snapshot();
  expect(running.status).toBe('running');
  expect(running.sessionId).toBe(started.sessionId);
  expect(started.remainingMs - running.remainingMs).toBeGreaterThanOrEqual(7000);
  await expect(readFile(`${path}.tmp`)).rejects.toThrow();

  await rm(path, {recursive:true});
  await writeFile(path, JSON.stringify({sound:true, checkpoint:{sessionId:started.sessionId, bucket:0}}));
  await main.getByRole('button', {name:'코골이 설정 다시 불러오기', exact:true}).click();
  await waitFor(() => snore.isEnabled(), Boolean);
  expect(await snore.isChecked()).toBe(true);
  expect(await main.getByRole('button', {name:'설정 저장', exact:true}).isEnabled()).toBe(true);
  expect(await main.getByRole('alert').count()).toBe(0);
  expect(JSON.parse(await readFile(path, 'utf8')).sound).toBe(true);
  await candidate.dispatch({type:'pause'});
}, 60000);
