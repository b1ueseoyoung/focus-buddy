import { expect, test } from 'bun:test';
import { waitFor, within } from './helpers';

test('condition timeout also bounds a stalled IPC read', async () => {
  await expect(waitFor(() => new Promise<boolean>(() => {}), Boolean, 20, 'stalled IPC')).rejects.toThrow('stalled IPC read');
});

test('bounded operations preserve errors and report their stage on a timeout', async () => {
  const error = new Error('original failure');
  await expect(within('failing request', () => Promise.reject(error), 20)).rejects.toBe(error);
  await expect(within('shutdown request', () => new Promise<void>(() => {}), 20)).rejects.toThrow('shutdown request');
});
