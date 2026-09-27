const DRAFT_PREFIX = 'kotoba:session-draft:v1:';
const AUTH_RECOVERY_KEY = 'kotoba:auth-recovery:v1';
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;
// 2MBまでのCSV本文とJSONの管理情報を、同じタブ内で復元できる大きさにする。
const MAX_DRAFT_LENGTH = 3_000_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuthRecovery {
  userId: string;
  hash: string;
  startedAt: number;
}

function browserStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function draftKey(userId: string, scope: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(scope)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function saveSessionDraft<T>(
  userId: string,
  scope: string,
  data: T,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage || !userId || !scope) return false;
  const key = draftKey(userId, scope);
  try {
    const raw = JSON.stringify({ version: 1, userId, scope, savedAt: now, data });
    if (raw.length > MAX_DRAFT_LENGTH) {
      storage.removeItem(key);
      return false;
    }
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function readSessionDraft<T>(
  userId: string,
  scope: string,
  validate: (value: unknown) => value is T,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): T | null {
  if (!storage) return null;
  const key = draftKey(userId, scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.userId !== userId ||
      value.scope !== scope ||
      typeof value.savedAt !== 'number' ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt > MAX_DRAFT_AGE_MS ||
      !validate(value.data)
    ) {
      storage.removeItem(key);
      return null;
    }
    return value.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* 利用できないストレージでは、画面内の入力をそのまま維持する。 */
    }
    return null;
  }
}

export function hasSessionDraft(
  userId: string,
  scope: string,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const key = draftKey(userId, scope);
    const raw = storage.getItem(key);
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      value.userId !== userId ||
      value.scope !== scope ||
      typeof value.savedAt !== 'number' ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt > MAX_DRAFT_AGE_MS
    ) {
      storage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSessionDraft(
  userId: string,
  scope: string,
  storage: StorageLike | null = browserStorage(),
): void {
  try {
    storage?.removeItem(draftKey(userId, scope));
  } catch {
    /* 保存完了後の削除に失敗しても、サーバー上の保存結果は変更しない。 */
  }
}

export function beginAuthRecovery(
  userId: string,
  hash: string,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): void {
  if (!storage || !userId) return;
  const safeHash = /^#\//.test(hash) ? hash : '#/';
  try {
    storage.setItem(
      AUTH_RECOVERY_KEY,
      JSON.stringify({ userId, hash: safeHash, startedAt: now } satisfies AuthRecovery),
    );
  } catch {
    /* ログイン画面への切り替えは継続し、URLのハッシュから復帰する。 */
  }
}

export function readAuthRecovery(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): AuthRecovery | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_RECOVERY_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      typeof value.userId !== 'string' ||
      !value.userId ||
      typeof value.hash !== 'string' ||
      !/^#\//.test(value.hash) ||
      typeof value.startedAt !== 'number' ||
      !Number.isFinite(value.startedAt) ||
      value.startedAt > now ||
      now - value.startedAt > MAX_DRAFT_AGE_MS
    ) {
      storage.removeItem(AUTH_RECOVERY_KEY);
      return null;
    }
    return value as unknown as AuthRecovery;
  } catch {
    try {
      storage.removeItem(AUTH_RECOVERY_KEY);
    } catch {
      /* 利用できないストレージでは、ログイン画面の表示を継続する。 */
    }
    return null;
  }
}

export function clearAuthRecovery(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(AUTH_RECOVERY_KEY);
  } catch {
    /* 次回の読み込み時に期限切れとして破棄する。 */
  }
}

export function authReturnPath(
  storage: StorageLike | null = browserStorage(),
  currentHash = typeof window === 'undefined' ? '#/' : window.location.hash,
): string {
  const hash = readAuthRecovery(storage)?.hash ?? (/^#\//.test(currentHash) ? currentHash : '#/');
  return `/${hash}`;
}
