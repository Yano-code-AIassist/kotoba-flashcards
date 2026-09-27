import { describe, expect, it } from 'vitest';
import {
  authReturnPath,
  beginAuthRecovery,
  clearAuthRecovery,
  clearSessionDraft,
  hasSessionDraft,
  readAuthRecovery,
  readSessionDraft,
  saveSessionDraft,
  type StorageLike,
} from './sessionDrafts';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const isDraft = (value: unknown): value is { text: string } =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';

describe('セッション切れの入力復元', () => {
  it('同じアカウントと入力場所だけで下書きを復元し、明示的に削除できる', () => {
    const storage = memoryStorage();
    expect(saveSessionDraft('user-a', 'word:1', { text: '入力中' }, storage, 100)).toBe(true);
    expect(hasSessionDraft('user-a', 'word:1', storage, 200)).toBe(true);
    expect(readSessionDraft('user-a', 'word:1', isDraft, storage, 200)).toEqual({ text: '入力中' });
    expect(readSessionDraft('user-b', 'word:1', isDraft, storage, 200)).toBeNull();
    expect(readSessionDraft('user-a', 'word:2', isDraft, storage, 200)).toBeNull();
    clearSessionDraft('user-a', 'word:1', storage);
    expect(hasSessionDraft('user-a', 'word:1', storage)).toBe(false);
  });

  it('壊れた値・期限切れ・3MBを超える下書きを復元しない', () => {
    const storage = memoryStorage();
    storage.setItem('kotoba:session-draft:v1:user-a:word%3A1', '{');
    expect(readSessionDraft('user-a', 'word:1', isDraft, storage, 100)).toBeNull();
    saveSessionDraft('user-a', 'word:1', { text: '古い' }, storage, 100);
    expect(readSessionDraft('user-a', 'word:1', isDraft, storage, 86_400_101)).toBeNull();
    expect(saveSessionDraft('user-a', 'word:1', { text: 'a'.repeat(3_000_000) }, storage)).toBe(
      false,
    );
  });

  it('自動再表示では壊れた値と期限切れの値を候補にしない', () => {
    const storage = memoryStorage();
    storage.setItem('kotoba:session-draft:v1:user-a:word%3A1', '{');
    expect(hasSessionDraft('user-a', 'word:1', storage, 100)).toBe(false);
    saveSessionDraft('user-a', 'word:1', { text: '古い' }, storage, 100);
    expect(hasSessionDraft('user-a', 'word:1', storage, 86_400_101)).toBe(false);
  });

  it('ログイン期限切れ時の画面を記録し、再ログイン用URLを作る', () => {
    const storage = memoryStorage();
    const now = Date.now();
    beginAuthRecovery('user-a', '#/decks/deck-1/words/new', storage, now);
    expect(readAuthRecovery(storage, now + 100)).toEqual({
      userId: 'user-a',
      hash: '#/decks/deck-1/words/new',
      startedAt: now,
    });
    expect(authReturnPath(storage, '#/')).toBe('/#/decks/deck-1/words/new');
    clearAuthRecovery(storage);
    expect(authReturnPath(storage, '#/settings')).toBe('/#/settings');
  });
});
