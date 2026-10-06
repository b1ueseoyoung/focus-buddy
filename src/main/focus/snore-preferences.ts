import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SnoreCheckpoint } from './snore-cue';

export interface SnorePreferenceData {
  sound: boolean;
  checkpoint: SnoreCheckpoint;
}

const defaults = (): SnorePreferenceData => ({ sound: false, checkpoint: { sessionId: null, bucket: 0 } });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readPreferences(path: string): SnorePreferenceData {
  let document: string;
  try {
    document = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaults();
    throw error;
  }
  try {
    const saved: unknown = JSON.parse(document);
    if (!isRecord(saved) || typeof saved.sound !== 'boolean' || !isRecord(saved.checkpoint)) return defaults();
    const { sessionId, bucket } = saved.checkpoint;
    if ((sessionId !== null && typeof sessionId !== 'string') ||
        typeof bucket !== 'number' || !Number.isSafeInteger(bucket) || bucket < 0) return defaults();
    return { sound: saved.sound, checkpoint: { sessionId, bucket } };
  } catch {
    return defaults();
  }
}

/** Publish accepted preferences only after their replacement file is written. */
export class SnorePreferences {
  private accepted: SnorePreferenceData | null = null;
  private loadError: unknown;

  constructor(private readonly path: string) {
    try { this.accepted = readPreferences(path); }
    catch (error) { this.loadError = error; }
  }

  get sound(): boolean { return this.current().sound; }
  get checkpoint(): SnoreCheckpoint { return { ...this.current().checkpoint }; }

  private current(): SnorePreferenceData {
    if (this.accepted === null) {
      try { this.accepted = readPreferences(this.path); this.loadError = undefined; }
      catch (error) { this.loadError = error; throw this.loadError; }
    }
    return this.accepted;
  }

  setSound(sound: boolean): void {
    this.save({ sound, checkpoint: this.checkpoint });
  }

  setCheckpoint(checkpoint: SnoreCheckpoint): void {
    this.save({ sound: this.sound, checkpoint: { ...checkpoint } });
  }

  private save(next: SnorePreferenceData): void {
    // An unreadable existing file must never be replaced with assumed defaults.
    this.current();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(next), 'utf8');
    renameSync(`${this.path}.tmp`, this.path);
    this.accepted = next;
  }
}
