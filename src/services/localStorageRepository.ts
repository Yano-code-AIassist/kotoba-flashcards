import type { AppData } from '../types/domain';
import type { Result } from '../types/storage';
import type { AppRepository } from './appRepository';
import { parseStoredData, validateAppData } from './validateAppData';

export const STORAGE_KEY = 'kotoba:app';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function unavailable(): Result<never> {
  return {
    ok: false,
    error: {
      code: 'unavailable',
      message:
        'このブラウザの保存領域にアクセスできません。ブラウザの保存許可を確認してから、もう一度お試しください。',
    },
  };
}

function conflict(): Result<never> {
  return {
    ok: false,
    error: {
      code: 'conflict',
      message:
        '別のタブなどで保存データが変わりました。入力を控えてから、ページを再読み込みしてください。',
    },
  };
}

function writeError(error: unknown): Result<never> {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return {
      ok: false,
      error: {
        code: 'quota-exceeded',
        message:
          'ブラウザの保存容量が不足しています。入力内容は残っています。保存領域の空きを確保して、再度保存してください。',
      },
    };
  }
  if (name === 'SecurityError') return unavailable();
  return {
    ok: false,
    error: {
      code: 'write-failed',
      message: '保存できませんでした。入力内容は残っています。もう一度お試しください。',
    },
  };
}

export function createLocalStorageRepository(
  getStorage: () => StorageAccess = () => window.localStorage,
): AppRepository {
  let observedRaw: string | null | undefined;
  let recoveryRaw: string | undefined;

  function readRaw(): Result<string | null> {
    try {
      return { ok: true, value: getStorage().getItem(STORAGE_KEY) };
    } catch {
      return unavailable();
    }
  }

  return {
    async load() {
      recoveryRaw = undefined;
      const raw = readRaw();
      if (!raw.ok) return raw;
      observedRaw = raw.value;
      // 存在しないキーだけを初回と扱う。空文字や不正JSONは破損として保護する。
      if (raw.value === null) return { ok: true, value: null };
      const parsed = parseStoredData(raw.value);
      if (!parsed.ok) recoveryRaw = raw.value;
      return parsed;
    },
    async save(data: AppData, expectedRevision: number) {
      const valid = validateAppData(data);
      if (!valid.ok) return valid;
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        expectedRevision === Number.MAX_SAFE_INTEGER ||
        data.revision !== expectedRevision
      )
        return conflict();
      const raw = readRaw();
      if (!raw.ok) return raw;
      const stored =
        raw.value === null ? { ok: true as const, value: null } : parseStoredData(raw.value);
      if (!stored.ok) return stored;
      if (
        (stored.value?.revision ?? 0) !== expectedRevision ||
        (observedRaw !== undefined && raw.value !== observedRaw)
      )
        return conflict();
      try {
        // 全体を1回で書き込み、成功するまでProviderの表示を更新しない。
        const next = structuredClone({ ...data, revision: expectedRevision + 1 });
        const serialized = JSON.stringify(next);
        getStorage().setItem(STORAGE_KEY, serialized);
        observedRaw = serialized;
        return { ok: true, value: next };
      } catch (error) {
        return writeError(error);
      }
    },
    subscribe(onExternalChange) {
      const listener = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        try {
          if (event.storageArea !== getStorage()) return;
        } catch {
          onExternalChange();
          return;
        }
        const current = readRaw();
        if (!current.ok || current.value !== observedRaw) onExternalChange();
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
    recovery: {
      getOriginal() {
        return recoveryRaw === undefined ? unavailable() : { ok: true, value: recoveryRaw };
      },
      async reset(original) {
        const current = readRaw();
        if (!current.ok) return current;
        // 確認中に別タブで修復・更新されたデータを、古い確認で消さない。
        if (original !== recoveryRaw || current.value !== original) return conflict();
        try {
          // clear()は使わず、このアプリのキーだけを削除する。
          getStorage().removeItem(STORAGE_KEY);
          observedRaw = null;
          recoveryRaw = undefined;
          return { ok: true, value: undefined };
        } catch (error) {
          return writeError(error);
        }
      },
    },
  };
}
