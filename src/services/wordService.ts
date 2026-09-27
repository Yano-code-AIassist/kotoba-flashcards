import type { AppData, EntityId, Word, WordInput } from '../types/domain';
import type { Result } from '../types/storage';
import { createId } from '../utils/createId';
import type { DataChange } from './deckService';
import { folderExists } from './folderService';

export const MAX_QUESTION_LENGTH = 2000;
export const MAX_ANSWER_LENGTH = 2000;
export const MAX_NOTE_LENGTH = 5000;

function normalizeWordInput(input: WordInput): WordInput {
  // 前後の空白だけを除き、補足の途中にある改行や字下げは保持する。
  return {
    question: input.question.trim(),
    answer: input.answer.trim(),
    note: input.note.trim(),
  };
}

export function getWordInputErrors(input: WordInput): Partial<Record<keyof WordInput, string>> {
  const { question, answer, note } = normalizeWordInput(input);
  const errors: Partial<Record<keyof WordInput, string>> = {};
  if (!question) {
    errors.question = '問題を入力してください。';
  } else if (question.length > MAX_QUESTION_LENGTH) {
    errors.question = `問題は${MAX_QUESTION_LENGTH}文字以内で入力してください。`;
  }
  if (!answer) {
    errors.answer = '答えを入力してください。';
  } else if (answer.length > MAX_ANSWER_LENGTH) {
    errors.answer = `答えは${MAX_ANSWER_LENGTH}文字以内で入力してください。`;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `補足は${MAX_NOTE_LENGTH}文字以内で入力してください。`;
  }
  return errors;
}

export function validateWordInput(input: WordInput): Result<WordInput> {
  // 画面の項目別エラーと保存時の検証が食い違わないよう、同じ検証を使う。
  const errors = getWordInputErrors(input);
  const message = errors.question ?? errors.answer ?? errors.note;
  if (message) return { ok: false, error: { code: 'validation', message } };
  return { ok: true, value: normalizeWordInput(input) };
}

function findWordInDeck(data: AppData, deckId: EntityId, wordId: EntityId): Result<Word> {
  if (!data.decks.some((deck) => deck.id === deckId)) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳は見つかりませんでした。' },
    };
  }
  // 単語IDだけで探すと、URLやフォームの取り違えで別の単語帳を変更できてしまう。
  const word = data.words.find((item) => item.id === wordId && item.deckId === deckId);
  if (!word) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳に対象の単語は見つかりませんでした。' },
    };
  }
  return { ok: true, value: word };
}

function activeSessionUsesWord(data: AppData, wordId: EntityId): boolean {
  const session = data.activeSession;
  return (
    !!session &&
    (session.wordIds.includes(wordId) || session.scopeWordIds?.includes(wordId) === true)
  );
}

export function createWordInData(
  data: AppData,
  deckId: EntityId,
  input: WordInput,
  folderId: EntityId | null = null,
): Result<DataChange<Word>> {
  if (!folderExists(data, deckId, folderId)) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳は見つかりませんでした。' },
    };
  }
  const validated = validateWordInput(input);
  if (!validated.ok) return validated;
  const now = new Date().toISOString();
  const word: Word = {
    id: createId('word'),
    deckId,
    folderId,
    ...validated.value,
    status: 'unlearned',
    lastStudiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  // 進行中の出題順には追加せず、新しい単語は次の学習開始時から対象にする。
  return {
    ok: true,
    value: { data: { ...data, words: [...data.words, word] }, value: word },
  };
}

export function updateWordInData(
  data: AppData,
  deckId: EntityId,
  wordId: EntityId,
  input: WordInput,
): Result<DataChange<Word>> {
  const existing = findWordInDeck(data, deckId, wordId);
  if (!existing.ok) return existing;
  const validated = validateWordInput(input);
  if (!validated.ok) return validated;
  const currentWord = existing.value;
  const content = validated.value;
  if (
    currentWord.question === content.question &&
    currentWord.answer === content.answer &&
    currentWord.note === content.note
  ) {
    return { ok: true, value: { data, value: currentWord } };
  }

  // 編集項目だけを差し替え、ID・所属・作成日時・これまでの学習状態を維持する。
  const word: Word = { ...currentWord, ...content, updatedAt: new Date().toISOString() };
  return {
    ok: true,
    value: {
      data: {
        ...data,
        words: data.words.map((item) =>
          item.id === wordId && item.deckId === deckId ? word : item,
        ),
        // 内容を変更した問題の古い回答を使って学習を再開しないよう、対象の回を終了する。
        activeSession: activeSessionUsesWord(data, wordId) ? null : data.activeSession,
      },
      value: word,
    },
  };
}

export function deleteWordFromData(
  data: AppData,
  deckId: EntityId,
  wordId: EntityId,
): Result<DataChange<void>> {
  const existing = findWordInDeck(data, deckId, wordId);
  if (!existing.ok) return existing;
  return {
    ok: true,
    value: {
      data: {
        ...data,
        words: data.words.filter((word) => !(word.id === wordId && word.deckId === deckId)),
        // 存在しない問題を再開時に参照しないよう、出題対象を削除した回を終了する。
        activeSession: activeSessionUsesWord(data, wordId) ? null : data.activeSession,
      },
      value: undefined,
    },
  };
}
