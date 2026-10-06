import { lstat, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const profileNamePrefix = 'focus-buddy-candidate-';

// Canonicalize the OS temporary root (including macOS /var -> /private/var).
// Only direct, real directories beneath it are allowed, including on Windows.
export async function isolatedProfilePath(existing?: string): Promise<string> {
  const tempRoot = await realpath(tmpdir());
  if (existing === undefined) return mkdtemp(join(tempRoot, profileNamePrefix));
  const path = resolve(existing);
  const name = basename(path);
  const unsafe = (): Error => new Error('Candidate E2E requires its own focus-buddy-candidate-* directory directly inside os.tmpdir()');
  if (!name.startsWith(profileNamePrefix) || name.length === profileNamePrefix.length) throw unsafe();
  if (await realpath(dirname(path)) !== tempRoot) throw unsafe();
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw unsafe();
  return realpath(path);
}
