import type { SettingsPatch } from '../../../shared/focus/types';

export type SnoreInvoker = (value?: boolean) => Promise<unknown>;

export async function readSnoreSetting(invoke: SnoreInvoker): Promise<boolean> {
  const value = await invoke();
  if (typeof value !== 'boolean') throw new Error('코골이 설정을 읽지 못했어요. 다시 불러와 주세요.');
  return value;
}

export interface SettingsDraft {
  patch: SettingsPatch;
  snoreSound: boolean;
  taskName: string;
}

interface SaveDependencies {
  savePrimary: (patch: SettingsPatch) => Promise<{ ok: true } | { ok: false; message: string }>;
  saveSnore: SnoreInvoker;
  saveTask: (taskName: string) => void;
}

type SaveStage = 'primary' | 'snore' | 'task';
const failureMessage: Record<SaveStage, string> = {
  primary: '타이머 설정을 파일에 저장하지 못했어요. 작업명과 코골이 설정은 변경하지 않았어요.',
  snore: '타이머 설정은 저장했지만 코골이 설정을 저장하지 못했어요. 작업명은 변경하지 않았어요.',
  task: '타이머·코골이 설정은 저장했지만 작업명을 저장하지 못했어요.',
};

export class SettingsSaveError extends Error {
  constructor(readonly stage: SaveStage, cause: unknown) {
    super(`${failureMessage[stage]} 입력을 유지했으니 다시 저장해 주세요.`, { cause });
  }
}

/** Each store commits independently; a rejection must never acknowledge the whole draft. */
export async function saveSettingsDraft(draft: SettingsDraft, dependencies: SaveDependencies): Promise<void> {
  let stage: SaveStage = 'primary';
  try {
    // A previous SAVE_FAILED already changed the in-memory baseline. Even an
    // empty patch must retry primary persistence before acknowledging this form.
    const result = await dependencies.savePrimary(draft.patch);
    if (!result.ok) throw new Error(result.message);
    stage = 'snore';
    const accepted = await dependencies.saveSnore(draft.snoreSound);
    if (typeof accepted !== 'boolean' || accepted !== draft.snoreSound) throw new Error('Snore preference was not acknowledged');
    stage = 'task';
    dependencies.saveTask(draft.taskName);
  } catch (error) {
    throw new SettingsSaveError(stage, error);
  }
}
