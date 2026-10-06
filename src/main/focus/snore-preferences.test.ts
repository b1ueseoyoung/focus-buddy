import { afterEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Snapshot } from '../../shared/focus/types';
import { observeSnoreCue, SnoreCueClock } from './snore-cue';
import { SnorePreferences } from './snore-preferences';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function preferencePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'focus-buddy-snore-unit-'));
  directories.push(directory);
  return join(directory, 'focus-snore.json');
}
const previous = { sound: false, checkpoint: { sessionId: 'focus-1', bucket: 2 } };

test('valid sound and checkpoint survive a new preferences instance', () => {
  const path = preferencePath();
  const preferences = new SnorePreferences(path);
  expect(preferences.sound).toBe(false);
  preferences.setSound(true);
  preferences.setCheckpoint({ sessionId: 'focus-1', bucket: 2 });
  const restored = new SnorePreferences(path);
  expect(restored.sound).toBe(true);
  expect(restored.checkpoint).toEqual({ sessionId: 'focus-1', bucket: 2 });
});

test('invalid documents cannot partially enable sound before checkpoint validation', () => {
  const path = preferencePath();
  for (const document of ['null', '{', '{"sound":true}', '{"sound":"true","checkpoint":{"sessionId":null,"bucket":0}}', '{"sound":true,"checkpoint":{"sessionId":"focus-1","bucket":-1}}']) {
    writeFileSync(path, document);
    const preferences = new SnorePreferences(path);
    expect(preferences.sound).toBe(false);
    expect(preferences.checkpoint).toEqual({ sessionId: null, bucket: 0 });
  }
});

test('a failed temporary write preserves accepted sound, checkpoint and the existing file, then retries', () => {
  const path = preferencePath();
  const original = JSON.stringify(previous);
  writeFileSync(path, original);
  const preferences = new SnorePreferences(path);
  mkdirSync(`${path}.tmp`);
  expect(() => preferences.setSound(true)).toThrow();
  expect(preferences.sound).toBe(false);
  expect(preferences.checkpoint).toEqual(previous.checkpoint);
  expect(readFileSync(path, 'utf8')).toBe(original);
  rmSync(`${path}.tmp`, { recursive: true });
  preferences.setSound(true);
  expect(new SnorePreferences(path).sound).toBe(true);
});

test('a failed rename does not publish the prospective sound or checkpoint', () => {
  const path = preferencePath();
  writeFileSync(path, JSON.stringify(previous));
  const preferences = new SnorePreferences(path);
  rmSync(path);
  mkdirSync(path);
  writeFileSync(join(path, 'block-replacement'), 'keep');
  expect(() => preferences.setSound(true)).toThrow();
  expect(() => preferences.setCheckpoint({ sessionId: 'focus-2', bucket: 0 })).toThrow();
  expect(preferences.sound).toBe(false);
  expect(preferences.checkpoint).toEqual(previous.checkpoint);
  expect(readFileSync(join(path, 'block-replacement'), 'utf8')).toBe('keep');
});

test('checkpoint failure is isolated, leaves both accepted checkpoints intact and emits once after retry', () => {
  const path = preferencePath();
  const baseline = { sound: true, checkpoint: { sessionId: 'focus-1', bucket: 0 } };
  writeFileSync(path, JSON.stringify(baseline));
  const preferences = new SnorePreferences(path);
  const clock = new SnoreCueClock(preferences.checkpoint, next => preferences.setCheckpoint(next));
  const snapshot = { sessionId: 'focus-1', phase: 'focus', status: 'running', plannedSeconds: 1500, remainingMs: 1200000 } as Snapshot;
  const errors: unknown[] = [];
  mkdirSync(`${path}.tmp`);
  expect(observeSnoreCue(clock, snapshot, error => errors.push(error))).toBeNull();
  expect(errors).toHaveLength(1);
  expect(clock.checkpoint).toEqual(baseline.checkpoint);
  expect(preferences.checkpoint).toEqual(baseline.checkpoint);
  expect(preferences.sound).toBe(true);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(baseline);
  rmSync(`${path}.tmp`, { recursive: true });
  expect(observeSnoreCue(clock, snapshot, error => errors.push(error))).toBe('focus-1:1');
  expect(preferences.checkpoint).toEqual({ sessionId: 'focus-1', bucket: 1 });
  expect(observeSnoreCue(clock, snapshot, error => errors.push(error))).toBeNull();
});

const posixTest = process.platform === 'win32' ? test.skip : test;
posixTest('an unreadable true preference rejects reads and blocks manual and automatic writes until reload succeeds', () => {
  const path = preferencePath();
  const baseline = { sound: true, checkpoint: { sessionId: 'focus-1', bucket: 2 } };
  const original = JSON.stringify(baseline);
  writeFileSync(path, original);
  chmodSync(path, 0o000);
  try {
    let readError: NodeJS.ErrnoException | undefined;
    try { readFileSync(path, 'utf8'); } catch (error) { readError = error as NodeJS.ErrnoException; }
    expect(readError?.code).toBe('EACCES');
    // Optional preferences can be constructed without aborting app initialization.
    const preferences = new SnorePreferences(path);
    const clock = new SnoreCueClock(undefined, next => preferences.setCheckpoint(next));
    const snapshot = { sessionId: 'focus-1', phase: 'focus', status: 'running', plannedSeconds: 1500, remainingMs: 600000 } as Snapshot;
    const errors: unknown[] = [];
    expect(() => preferences.sound).toThrow();
    expect(() => preferences.checkpoint).toThrow();
    expect(() => preferences.setSound(false)).toThrow();
    expect(() => preferences.setCheckpoint({ sessionId: 'focus-2', bucket: 0 })).toThrow();
    expect(observeSnoreCue(clock, snapshot, error => errors.push(error), () => preferences.checkpoint)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(clock.checkpoint).toEqual({ sessionId: null, bucket: 0 });
    expect(existsSync(`${path}.tmp`)).toBe(false);
    chmodSync(path, 0o600);
    expect(readFileSync(path, 'utf8')).toBe(original);
    // The same instance retries the read and synchronizes the persisted clock,
    // preserving both enabled sound and the prior bucket before writing again.
    expect(preferences.sound).toBe(true);
    expect(preferences.checkpoint).toEqual(baseline.checkpoint);
    expect(observeSnoreCue(clock, snapshot, error => errors.push(error), () => preferences.checkpoint)).toBe('focus-1:3');
    expect(preferences.sound).toBe(true);
    expect(new SnorePreferences(path).checkpoint).toEqual({ sessionId: 'focus-1', bucket: 3 });
    expect(observeSnoreCue(clock, snapshot, error => errors.push(error), () => preferences.checkpoint)).toBeNull();
  } finally { chmodSync(path, 0o600); }
});

test('a filesystem read failure does not create a replacement and the same instance recovers after reload', () => {
  const path = preferencePath();
  mkdirSync(path);
  writeFileSync(join(path, 'keep'), 'unchanged');
  const preferences = new SnorePreferences(path);
  expect(() => preferences.sound).toThrow();
  expect(() => preferences.setSound(true)).toThrow();
  expect(() => preferences.setCheckpoint({ sessionId: 'focus-1', bucket: 0 })).toThrow();
  expect(existsSync(`${path}.tmp`)).toBe(false);
  expect(readFileSync(join(path, 'keep'), 'utf8')).toBe('unchanged');
  rmSync(path, { recursive: true });
  writeFileSync(path, JSON.stringify({ sound: true, checkpoint: { sessionId: 'focus-1', bucket: 2 } }));
  expect(preferences.sound).toBe(true);
  expect(preferences.checkpoint).toEqual({ sessionId: 'focus-1', bucket: 2 });
  preferences.setSound(false);
  expect(new SnorePreferences(path).sound).toBe(false);
});
