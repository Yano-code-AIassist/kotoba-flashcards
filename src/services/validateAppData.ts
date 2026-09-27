import type { AppData, StudyFormat, StudyMode } from '../types/domain';
import type { Result } from '../types/storage';
import { MAX_DECK_NAME_LENGTH } from './deckService';
import { MAX_ANSWER_LENGTH, MAX_NOTE_LENGTH, MAX_QUESTION_LENGTH } from './wordService';
import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH, descendantFolderIds } from './folderService';
import type { Folder } from '../types/domain';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isText(value: unknown, max: number, required = true): value is string {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  // アプリが書き出すUTC形式と比較し、2月30日などの自動補正も拒否する。
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isMode(value: unknown): value is StudyMode {
  return value === 'all' || value === 'unlearned' || value === 'learning' || value === 'random';
}

function isFormat(value: unknown): value is StudyFormat {
  return value === 'flashcard' || value === 'multiple-choice';
}

function corrupted(): Result<never> {
  return {
    ok: false,
    error: {
      code: 'corrupted',
      message: '保存データの形式を確認できませんでした。元データは変更していません。',
    },
  };
}

export function validateAppData(value: unknown): Result<AppData> {
  // JSONの解析成功だけでは安全に表示できない。型・所属・出題順をまとめて検証する。
  if (!isRecord(value)) return corrupted();
  // 旧版は全単語が直下。revision・学習状態・IDを保ったまま読み取り時に移行する。
  if (value.version === 1) return validateAppData({ ...value, version: 2, folders: [] });
  if (
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version > 0 &&
    value.version !== 2
  ) {
    return {
      ok: false,
      error: {
        code: 'unsupported-version',
        message: 'このアプリでは対応していない形式の保存データです。元データは変更していません。',
      },
    };
  }
  if (
    value.version !== 2 ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.decks) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.words) ||
    !isRecord(value.settings) ||
    !isMode(value.settings.defaultStudyMode) ||
    typeof value.settings.swipeEnabled !== 'boolean'
  )
    return corrupted();

  const deckIds = new Set<string>();
  for (const deck of value.decks) {
    if (
      !isRecord(deck) ||
      !isId(deck.id) ||
      deckIds.has(deck.id) ||
      !isText(deck.name, MAX_DECK_NAME_LENGTH) ||
      !isDate(deck.createdAt) ||
      !isDate(deck.updatedAt)
    )
      return corrupted();
    deckIds.add(deck.id);
  }
  const folders = new Map<string, Folder>();
  for (const folder of value.folders) {
    if (
      !isRecord(folder) ||
      !isId(folder.id) ||
      folders.has(folder.id) ||
      !isId(folder.deckId) ||
      !deckIds.has(folder.deckId) ||
      (folder.parentId !== null && !isId(folder.parentId)) ||
      !isText(folder.name, MAX_FOLDER_NAME_LENGTH) ||
      !isDate(folder.createdAt) ||
      !isDate(folder.updatedAt)
    )
      return corrupted();
    folders.set(folder.id, folder as unknown as Folder);
  }
  for (const folder of folders.values()) {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId !== null) {
      const parent = folders.get(parentId);
      if (
        !parent ||
        parent.deckId !== folder.deckId ||
        seen.has(parentId) ||
        seen.size >= MAX_FOLDER_DEPTH
      )
        return corrupted();
      seen.add(parentId);
      parentId = parent.parentId;
    }
  }
  const wordDecks = new Map<string, string>();
  for (const word of value.words) {
    if (
      !isRecord(word) ||
      !isId(word.id) ||
      wordDecks.has(word.id) ||
      !isId(word.deckId) ||
      !deckIds.has(word.deckId) ||
      (word.folderId !== undefined &&
        word.folderId !== null &&
        (!isId(word.folderId) || folders.get(word.folderId)?.deckId !== word.deckId)) ||
      !isText(word.question, MAX_QUESTION_LENGTH) ||
      !isText(word.answer, MAX_ANSWER_LENGTH) ||
      !isText(word.note, MAX_NOTE_LENGTH, false) ||
      (word.status !== 'unlearned' && word.status !== 'remembered' && word.status !== 'learning') ||
      !isDate(word.createdAt) ||
      !isDate(word.updatedAt) ||
      (word.lastStudiedAt !== null && !isDate(word.lastStudiedAt))
    )
      return corrupted();
    wordDecks.set(word.id, word.deckId);
  }
  const session = value.activeSession;
  if (session !== null) {
    if (
      !isRecord(session) ||
      !isId(session.id) ||
      !isId(session.deckId) ||
      !deckIds.has(session.deckId) ||
      (session.folderId !== undefined &&
        session.folderId !== null &&
        (!isId(session.folderId) || folders.get(session.folderId)?.deckId !== session.deckId)) ||
      !isMode(session.mode) ||
      (session.format !== undefined && !isFormat(session.format)) ||
      (session.scopeWordIds !== undefined &&
        (!Array.isArray(session.scopeWordIds) || session.scopeWordIds.length === 0)) ||
      !Array.isArray(session.wordIds) ||
      session.wordIds.length === 0 ||
      !Array.isArray(session.answers) ||
      session.answers.length > session.wordIds.length ||
      !isDate(session.startedAt) ||
      !isDate(session.updatedAt)
    )
      return corrupted();
    const seen = new Set<string>();
    const scope =
      typeof session.folderId === 'string'
        ? descendantFolderIds([...folders.values()], session.folderId)
        : null;
    const wordFolders = new Map(value.words.map((word) => [word.id, word.folderId]));
    const scopedIds = new Set<string>();
    if (Array.isArray(session.scopeWordIds)) {
      for (const id of session.scopeWordIds) {
        if (!isId(id) || scopedIds.has(id) || wordDecks.get(id) !== session.deckId)
          return corrupted();
        if (scope && !scope.has(wordFolders.get(id))) return corrupted();
        scopedIds.add(id);
      }
    }
    for (const id of session.wordIds) {
      if (!isId(id) || seen.has(id) || wordDecks.get(id) !== session.deckId) return corrupted();
      if (scope && !scope.has(wordFolders.get(id))) return corrupted();
      if (scopedIds.size > 0 && !scopedIds.has(id)) return corrupted();
      seen.add(id);
    }
    if (session.format === 'multiple-choice') {
      if (scopedIds.size === 0) return corrupted();
      const answers = new Set(
        value.words
          .filter((word) => scopedIds.has(word.id))
          .map((word) =>
            word.answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
          ),
      );
      if (answers.size < 4) return corrupted();
    }
    for (const [index, answer] of session.answers.entries()) {
      if (
        !isRecord(answer) ||
        answer.wordId !== session.wordIds[index] ||
        (answer.rating !== 'remembered' && answer.rating !== 'learning') ||
        !isDate(answer.answeredAt)
      )
        return corrupted();
    }
  }
  // 旧版からの移行を含め、現行形式の全必須項目と参照関係を検証済み。
  return { ok: true, value: value as unknown as AppData };
}

export function parseStoredData(raw: string): Result<AppData> {
  try {
    const value: unknown = JSON.parse(raw);
    return validateAppData(value);
  } catch {
    return corrupted();
  }
}
