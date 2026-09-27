import { describe, expect, it } from 'vitest';
import type { AppData, Deck, Word } from '../types/domain';
import { createInitialAppData } from './appRepository';
import {
  createDeckInData,
  deleteDeckFromData,
  renameDeckInData,
  validateDeckName,
} from './deckService';

const createdAt = '2026-01-01T00:00:00.000Z';
const deckA: Deck = { id: 'deck-a', name: '基本情報', createdAt, updatedAt: createdAt };
const deckB: Deck = { id: 'deck-b', name: '英単語', createdAt, updatedAt: createdAt };

function word(id: string, deckId: string): Word {
  return {
    id,
    deckId,
    question: 'RFP',
    answer: '提案依頼書',
    note: '',
    status: 'unlearned',
    lastStudiedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function dataWithDecks(): AppData {
  return {
    ...createInitialAppData(),
    decks: [{ ...deckA }, { ...deckB }],
    words: [word('word-a', deckA.id), word('word-b', deckB.id)],
    activeSession: {
      id: 'session-a',
      deckId: deckA.id,
      mode: 'all',
      wordIds: ['word-a'],
      answers: [],
      startedAt: createdAt,
      updatedAt: createdAt,
    },
  };
}

describe('単語帳の入力と変更', () => {
  it('前後の空白を除き、空欄と上限超過を拒否する', () => {
    expect(validateDeckName('　 基本情報 　')).toEqual({ ok: true, value: '基本情報' });
    expect(validateDeckName(' \n　')).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(validateDeckName('a'.repeat(80))).toMatchObject({ ok: true });
    expect(validateDeckName('a'.repeat(81))).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
  });

  it('同名でも別IDで作成し、元のデータを変更しない', () => {
    const data = dataWithDecks();
    const before = structuredClone(data);
    const result = createDeckInData(data, '  基本情報  ');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('作成に失敗しました');
    expect(result.value.value.name).toBe('基本情報');
    expect(result.value.value.id).not.toBe(deckA.id);
    expect(result.value.data.decks).toHaveLength(3);
    expect(result.value.data.revision).toBe(data.revision);
    expect(data).toEqual(before);
  });

  it('改名でID・作成日時・所属単語を維持し、入力エラーでは変更しない', () => {
    const data = dataWithDecks();
    const before = structuredClone(data);
    const renamed = renameDeckInData(data, deckA.id, ' IT用語 ');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error('改名に失敗しました');
    expect(renamed.value.value).toMatchObject({ id: deckA.id, name: 'IT用語', createdAt });
    expect(renamed.value.data.words).toEqual(data.words);
    expect(renameDeckInData(data, deckA.id, '   ')).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    expect(data).toEqual(before);
  });

  it('存在しない単語帳を改名・削除しようとするとエラーにする', () => {
    const data = dataWithDecks();
    expect(renameDeckInData(data, 'missing', 'IT用語')).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(deleteDeckFromData(data, 'missing')).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(data.decks).toHaveLength(2);
  });

  it('単語帳の削除で関連単語と対象セッションだけを削除する', () => {
    const data = dataWithDecks();
    const before = structuredClone(data);
    const result = deleteDeckFromData(data, deckA.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('削除に失敗しました');
    expect(result.value.data.decks).toEqual([deckB]);
    expect(result.value.data.words.map((item) => item.id)).toEqual(['word-b']);
    expect(result.value.data.activeSession).toBeNull();
    expect(data).toEqual(before);

    const otherResult = deleteDeckFromData(data, deckB.id);
    expect(otherResult.ok).toBe(true);
    if (!otherResult.ok) throw new Error('削除に失敗しました');
    expect(otherResult.value.data.activeSession).toEqual(data.activeSession);
  });
});
