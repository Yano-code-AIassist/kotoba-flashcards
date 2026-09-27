import type { AppData } from '../types/domain';
import type { Result } from '../types/storage';

export interface AppRepository {
  load(): Promise<Result<AppData | null>>;
  // dataは現在のrevisionを持つ。保存先で照合し、成功時だけ1増やす。
  save(data: AppData, expectedRevision: number): Promise<Result<AppData>>;
  // 別のタブでの変更を通知する。画面の入力は自動で差し替えない。
  subscribe?(onExternalChange: () => void): () => void;
  recovery?: {
    getOriginal(): Result<string>;
    reset(original: string): Promise<Result<void>>;
  };
}

export function createInitialAppData(): AppData {
  // 呼び出すたびに別の配列を作り、Provider間で初期値を共有しない。
  return {
    version: 2,
    revision: 0,
    decks: [],
    folders: [],
    words: [],
    settings: { defaultStudyMode: 'all', swipeEnabled: true },
    activeSession: null,
  };
}
