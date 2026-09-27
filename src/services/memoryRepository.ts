import type { AppData } from '../types/domain';
import type { AppRepository } from './appRepository';

export function createMemoryRepository(initialData: AppData | null = null): AppRepository {
  // 呼び出し元が配列を変更しても、保存済みデータに影響させない。
  let storedData = initialData === null ? null : structuredClone(initialData);

  return {
    async load() {
      return { ok: true, value: storedData === null ? null : structuredClone(storedData) };
    },
    async save(data, expectedRevision) {
      const currentRevision = storedData?.revision ?? 0;
      if (
        currentRevision !== expectedRevision ||
        data.revision !== expectedRevision ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        expectedRevision === Number.MAX_SAFE_INTEGER
      ) {
        return {
          ok: false,
          error: {
            code: 'conflict',
            message: 'データが更新されています。画面を開き直してから操作してください。',
          },
        };
      }

      try {
        const nextData = structuredClone({ ...data, revision: expectedRevision + 1 });
        const resultData = structuredClone(nextData);
        // 保存値と返却値も分け、画面からの意図しない変更を防ぐ。
        storedData = nextData;
        return { ok: true, value: resultData };
      } catch {
        return {
          ok: false,
          error: {
            code: 'write-failed',
            message: '保存できませんでした。もう一度お試しください。',
          },
        };
      }
    },
  };
}
