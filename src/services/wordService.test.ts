import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppData, Word, WordInput } from '../types/domain';
import type { Result } from '../types/storage';
import { createInitialAppData } from './appRepository';
import type { DataChange } from './deckService';
import {
  createWordInData,
  deleteWordFromData,
  getWordInputErrors,
  MAX_ANSWER_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUESTION_LENGTH,
  updateWordInData,
  validateWordInput,
} from './wordService';

const createdAt = '2026-01-01T00:00:00.000Z';
const studiedAt = '2026-02-01T00:00:00.000Z';
const changedAt = '2026-03-01T00:00:00.000Z';
const validInput: WordInput = { question: 'RFP', answer: '提案依頼書', note: '' };

function word(id: string, deckId: string): Word {
  return {
    id,
    deckId,
    ...validInput,
    status: 'remembered',
    lastStudiedAt: studiedAt,
    createdAt,
    updatedAt: createdAt,
  };
}

function dataWithWords(): AppData {
  return {
    ...createInitialAppData(),
    decks: [
      { id: 'deck-a', name: '基本情報', createdAt, updatedAt: createdAt },
      { id: 'deck-b', name: '英単語', createdAt, updatedAt: createdAt },
    ],
    words: [word('word-a', 'deck-a'), word('word-b', 'deck-a'), word('word-c', 'deck-b')],
    activeSession: {
      id: 'session-a',
      deckId: 'deck-a',
      mode: 'all',
      wordIds: ['word-a'],
      answers: [],
      startedAt: createdAt,
      updatedAt: createdAt,
    },
  };
}

function success<T>(result: Result<DataChange<T>>): DataChange<T> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('単語の入力と変更', () => {
  it('入力の前後をtrimし、内部の改行と空欄のメモを保持する', () => {
    expect(
      validateWordInput({
        question: '　 RFP \n',
        answer: ' 提案依頼書　',
        note: ' \nシステムの要件\n提案を依頼する文書\n ',
      }),
    ).toEqual({
      ok: true,
      value: {
        question: 'RFP',
        answer: '提案依頼書',
        note: 'システムの要件\n提案を依頼する文書',
      },
    });
    expect(validateWordInput({ ...validInput, note: '　 \n ' })).toEqual({
      ok: true,
      value: validInput,
    });
  });

  it('問題または答えが空白だけの場合は拒否する', () => {
    for (const field of ['question', 'answer'] as const) {
      expect(validateWordInput({ ...validInput, [field]: '　 \n ' })).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
  });

  it('各欄の上限ちょうどを許可し、trim後の上限超過を拒否する', () => {
    const limits = {
      question: MAX_QUESTION_LENGTH,
      answer: MAX_ANSWER_LENGTH,
      note: MAX_NOTE_LENGTH,
    };
    expect(limits).toEqual({ question: 2000, answer: 2000, note: 5000 });
    for (const field of ['question', 'answer', 'note'] as const) {
      const value = 'あ'.repeat(limits[field]);
      expect(validateWordInput({ ...validInput, [field]: ` ${value} ` })).toEqual({
        ok: true,
        value: { ...validInput, [field]: value },
      });
      expect(validateWordInput({ ...validInput, [field]: `${value}あ` })).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
  });

  it('各項目の入力エラーをまとめて返し、正常な項目は含めない', () => {
    expect(
      getWordInputErrors({
        question: '　 ',
        answer: 'あ'.repeat(MAX_ANSWER_LENGTH + 1),
        note: 'あ'.repeat(MAX_NOTE_LENGTH + 1),
      }),
    ).toEqual({
      question: expect.any(String),
      answer: expect.any(String),
      note: expect.any(String),
    });
    expect(getWordInputErrors({ ...validInput, question: '　 ' })).toEqual({
      question: expect.any(String),
    });
    expect(getWordInputErrors(validInput)).toEqual({});
  });

  it('未学習の単語を一意なIDで追加し、既存データとセッションを維持する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(changedAt));
    const data = dataWithWords();
    const before = structuredClone(data);
    const added = success(createWordInData(data, 'deck-a', { ...validInput, question: ' RFP ' }));
    expect(added.value).toEqual({
      id: expect.any(String),
      deckId: 'deck-a',
      folderId: null,
      ...validInput,
      status: 'unlearned',
      lastStudiedAt: null,
      createdAt: changedAt,
      updatedAt: changedAt,
    });
    expect(added.value.id).not.toBe('');
    expect(data.words.some((item) => item.id === added.value.id)).toBe(false);
    expect(added.data.words).toEqual([...data.words, added.value]);
    expect(added.data.activeSession).toEqual(data.activeSession);
    expect(added.data.revision).toBe(data.revision);
    const second = success(createWordInData(added.data, 'deck-a', validInput));
    expect(second.value.id).not.toBe(added.value.id);
    expect(data).toEqual(before);
  });

  it('存在しない単語帳への追加・編集・削除を拒否する', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    for (const result of [
      createWordInData(data, 'missing', validInput),
      updateWordInData(data, 'missing', 'word-a', validInput),
      deleteWordFromData(data, 'missing', 'word-a'),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } });
    }
    expect(data).toEqual(before);
  });

  it('存在しない単語や他の単語帳の単語は編集・削除できない', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    for (const wordId of ['missing', 'word-c']) {
      expect(updateWordInData(data, 'deck-a', wordId, validInput)).toMatchObject({
        ok: false,
        error: { code: 'not-found' },
      });
      expect(deleteWordFromData(data, 'deck-a', wordId)).toMatchObject({
        ok: false,
        error: { code: 'not-found' },
      });
    }
    expect(data).toEqual(before);
  });

  it('編集で学習履歴と識別情報を維持し、対象を含むセッションを終了する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(changedAt));
    const data = dataWithWords();
    const before = structuredClone(data);
    const updated = success(
      updateWordInData(data, 'deck-a', 'word-a', {
        question: ' DNS ',
        answer: ' 名前解決の仕組み ',
        note: ' ドメイン名とIPアドレスを対応付ける ',
      }),
    );
    expect(updated.value).toEqual({
      ...data.words[0],
      question: 'DNS',
      answer: '名前解決の仕組み',
      note: 'ドメイン名とIPアドレスを対応付ける',
      updatedAt: changedAt,
    });
    expect(updated.data.words).toEqual([updated.value, ...data.words.slice(1)]);
    expect(updated.data.activeSession).toBeNull();
    expect(updated.data.revision).toBe(data.revision);
    expect(data).toEqual(before);
  });

  it('trim後に内容が同じ編集では学習セッションを維持する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(changedAt));
    const data = dataWithWords();
    const before = structuredClone(data);
    const unchanged = success(
      updateWordInData(data, 'deck-a', 'word-a', {
        question: ' RFP ',
        answer: ' 提案依頼書 ',
        note: '　 ',
      }),
    );
    expect(unchanged.data).toBe(data);
    expect(unchanged.data.activeSession).toEqual(data.activeSession);
    expect(unchanged.value).toEqual(data.words[0]);
    expect(data).toEqual(before);
  });

  it('セッションの出題に含まれない単語の編集ではセッションを維持する', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    for (const [deckId, wordId] of [
      ['deck-a', 'word-b'],
      ['deck-b', 'word-c'],
    ]) {
      const updated = success(
        updateWordInData(data, deckId, wordId, { ...validInput, note: '補足を追加' }),
      );
      expect(updated.data.activeSession).toEqual(data.activeSession);
    }
    expect(data).toEqual(before);
  });

  it('4択の誤答候補に使う単語を編集・削除した場合もセッションを終了する', () => {
    const data = dataWithWords();
    data.activeSession = {
      ...data.activeSession!,
      format: 'multiple-choice',
      scopeWordIds: ['word-a', 'word-b'],
    };
    const updated = success(
      updateWordInData(data, 'deck-a', 'word-b', { ...validInput, note: '選択肢を変更' }),
    );
    expect(updated.data.activeSession).toBeNull();
    expect(success(deleteWordFromData(data, 'deck-a', 'word-b')).data.activeSession).toBeNull();
  });

  it('削除した単語が出題に含まれるセッションを終了し、他の単語を維持する', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    const deleted = success(deleteWordFromData(data, 'deck-a', 'word-a'));
    expect(deleted.value).toBeUndefined();
    expect(deleted.data.words).toEqual(data.words.slice(1));
    expect(deleted.data.decks).toEqual(data.decks);
    expect(deleted.data.activeSession).toBeNull();
    expect(deleted.data.revision).toBe(data.revision);
    expect(data).toEqual(before);
  });

  it('セッションの出題に含まれない単語の削除ではセッションを維持する', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    for (const [deckId, wordId] of [
      ['deck-a', 'word-b'],
      ['deck-b', 'word-c'],
    ]) {
      const deleted = success(deleteWordFromData(data, deckId, wordId));
      expect(deleted.data.words).toEqual(data.words.filter((item) => item.id !== wordId));
      expect(deleted.data.activeSession).toEqual(data.activeSession);
    }
    expect(data).toEqual(before);
  });

  it('不正な入力で追加・編集しても単語と学習状態を変更しない', () => {
    const data = dataWithWords();
    const before = structuredClone(data);
    const invalidInput = { ...validInput, answer: '　 ' };
    expect(createWordInData(data, 'deck-a', invalidInput)).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(updateWordInData(data, 'deck-a', 'word-a', invalidInput)).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(data).toEqual(before);
  });
});
