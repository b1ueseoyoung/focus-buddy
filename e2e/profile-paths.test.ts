import { expect, test } from 'bun:test';
import { mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isolatedProfilePath } from './profile-paths';

test('E2E profiles use the actual OS temp root and can be reused on restart', async () => {
  const profile = await isolatedProfilePath();
  try {
    expect(dirname(profile)).toBe(await realpath(tmpdir()));
    expect(await isolatedProfilePath(profile)).toBe(profile);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test('E2E profiles reject the workspace, temp root, and nested directories', async () => {
  await expect(isolatedProfilePath(process.cwd())).rejects.toThrow();
  await expect(isolatedProfilePath(tmpdir())).rejects.toThrow();
  const profile = await isolatedProfilePath();
  try {
    const nested = join(profile, 'focus-buddy-candidate-nested');
    await mkdir(nested);
    await expect(isolatedProfilePath(nested)).rejects.toThrow();
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test('E2E profiles reject symlinks and Windows junctions even with a valid name', async () => {
  const profile = await isolatedProfilePath();
  const link = `${profile}-link`;
  try {
    await symlink(profile, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(isolatedProfilePath(link)).rejects.toThrow();
  } finally {
    await rm(link, { force: true });
    await rm(profile, { recursive: true, force: true });
  }
});
