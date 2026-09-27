import type { AppData, EntityId, Folder, Word } from '../types/domain';
import type { Result } from '../types/storage';
import type { DataChange } from './deckService';
import { createId } from '../utils/createId';

export const MAX_FOLDER_NAME_LENGTH = 80;
export const MAX_FOLDER_DEPTH = 20;

export function folderExists(data: AppData, deckId: string, folderId: string | null): boolean {
  return (
    data.decks.some((deck) => deck.id === deckId) &&
    (folderId === null ||
      data.folders.some((folder) => folder.id === folderId && folder.deckId === deckId))
  );
}

export function folderPath(folders: Folder[], folderId: string | null): Folder[] {
  const path: Folder[] = [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  let current = folderId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const folder = byId.get(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export function descendantFolderIds(folders: Folder[], folderId: string): Set<string> {
  const ids = new Set([folderId]);
  const children = new Map<string, string[]>();
  for (const folder of folders)
    if (folder.parentId !== null)
      children.set(folder.parentId, [...(children.get(folder.parentId) || []), folder.id]);
  const queue = [folderId];
  for (let i = 0; i < queue.length; i++)
    for (const id of children.get(queue[i]) || [])
      if (!ids.has(id)) {
        ids.add(id);
        queue.push(id);
      }
  return ids;
}

export function wordsInFolder(
  data: AppData,
  deckId: string,
  folderId: string | null,
  recursive = false,
): Word[] {
  const ids =
    recursive && folderId !== null
      ? descendantFolderIds(
          data.folders.filter((folder) => folder.deckId === deckId),
          folderId,
        )
      : null;
  return data.words.filter((word) => {
    if (word.deckId !== deckId) return false;
    if (!recursive) return (word.folderId ?? null) === folderId;
    return folderId === null || !!ids?.has(word.folderId || '');
  });
}

function unavailable(): Result<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: '保存先の単語帳・フォルダーが見つかりません。' },
  };
}
function folderName(input: string): Result<string> {
  const name = input.trim();
  if (!name || name.length > MAX_FOLDER_NAME_LENGTH)
    return {
      ok: false,
      error: {
        code: 'validation',
        message: `フォルダー名は1〜${MAX_FOLDER_NAME_LENGTH}文字で入力してください。`,
      },
    };
  return { ok: true, value: name };
}

export function createFolderInData(
  data: AppData,
  deckId: EntityId,
  parentId: EntityId | null,
  input: string,
): Result<DataChange<Folder>> {
  if (!folderExists(data, deckId, parentId)) return unavailable();
  const name = folderName(input);
  if (!name.ok) return name;
  if (folderPath(data.folders, parentId).length >= MAX_FOLDER_DEPTH)
    return {
      ok: false,
      error: {
        code: 'validation',
        message: `フォルダーは${MAX_FOLDER_DEPTH}階層まで作成できます。`,
      },
    };
  const now = new Date().toISOString();
  const folder = {
    id: createId('folder'),
    deckId,
    parentId,
    name: name.value,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    value: { data: { ...data, folders: [...data.folders, folder] }, value: folder },
  };
}

export function renameFolderInData(
  data: AppData,
  deckId: string,
  folderId: string,
  input: string,
): Result<DataChange<Folder>> {
  const existing = data.folders.find(
    (folder) => folder.id === folderId && folder.deckId === deckId,
  );
  if (!existing) return unavailable();
  const name = folderName(input);
  if (!name.ok) return name;
  const folder = { ...existing, name: name.value, updatedAt: new Date().toISOString() };
  return {
    ok: true,
    value: {
      data: {
        ...data,
        folders: data.folders.map((item) => (item.id === folderId ? folder : item)),
      },
      value: folder,
    },
  };
}

export function deleteFolderFromData(
  data: AppData,
  deckId: string,
  folderId: string,
): Result<DataChange<void>> {
  if (!folderExists(data, deckId, folderId)) return unavailable();
  const ids = descendantFolderIds(
    data.folders.filter((folder) => folder.deckId === deckId),
    folderId,
  );
  const removedWordIds = new Set(
    data.words
      .filter((word) => word.deckId === deckId && ids.has(word.folderId || ''))
      .map((word) => word.id),
  );
  const session = data.activeSession;
  const sessionWordIds = session?.scopeWordIds ?? session?.wordIds ?? [];
  const endsSession =
    session?.deckId === deckId &&
    (ids.has(session.folderId || '') || sessionWordIds.some((id) => removedWordIds.has(id)));
  return {
    ok: true,
    value: {
      data: {
        ...data,
        folders: data.folders.filter((folder) => !ids.has(folder.id)),
        words: data.words.filter((word) => !removedWordIds.has(word.id)),
        activeSession: endsSession ? null : session,
      },
      value: undefined,
    },
  };
}

export function moveWordInData(
  data: AppData,
  deckId: string,
  wordId: string,
  folderId: string | null,
): Result<DataChange<Word>> {
  if (!folderExists(data, deckId, folderId)) return unavailable();
  const existing = data.words.find((word) => word.id === wordId && word.deckId === deckId);
  if (!existing) return unavailable();
  if ((existing.folderId ?? null) === folderId)
    return { ok: true, value: { data, value: existing } };
  const word = { ...existing, folderId, updatedAt: new Date().toISOString() };
  // 学習範囲を変えた単語が出題中なら、その回を終了する。単語の学習状態は残す。
  return {
    ok: true,
    value: {
      data: {
        ...data,
        words: data.words.map((item) => (item.id === wordId ? word : item)),
        activeSession:
          data.activeSession?.wordIds.includes(wordId) ||
          data.activeSession?.scopeWordIds?.includes(wordId)
            ? null
            : data.activeSession,
      },
      value: word,
    },
  };
}
