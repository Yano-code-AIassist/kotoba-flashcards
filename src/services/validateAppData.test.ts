import { describe, expect, it } from 'vitest';
import { storedDataFixture } from '../test/storedDataFixture';
import { createInitialAppData } from './appRepository';
import { parseStoredData, validateAppData } from './validateAppData';

describe('保存データの検証', () => {
  it('初回の空データと、学習状態・設定・途中セッションを復元できる', () => {
    expect(validateAppData(createInitialAppData()).ok).toBe(true);
    const sample = storedDataFixture();
    expect(parseStoredData(JSON.stringify(sample))).toEqual({ ok: true, value: sample });
  });

  it.each(['', '{', 'null', '[]', '42', '"text"'])(
    '不正な保存文字列 %j を初回扱いしない',
    (raw) => {
      expect(parseStoredData(raw)).toMatchObject({ ok: false, error: { code: 'corrupted' } });
    },
  );

  it('未知の形式番号を破損と区別し、移行を勝手に行わない', () => {
    expect(validateAppData({ version: 3 })).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
    expect(validateAppData({ ...createInitialAppData(), version: '1' })).toMatchObject({
      ok: false,
      error: { code: 'corrupted' },
    });
  });

  const invalidCases: [string, (data: ReturnType<typeof storedDataFixture>) => unknown][] = [
    ['負のrevision', (d) => ({ ...d, revision: -1 })],
    ['小数のrevision', (d) => ({ ...d, revision: 1.5 })],
    ['精度外のrevision', (d) => ({ ...d, revision: Number.MAX_SAFE_INTEGER + 1 })],
    ['単語帳配列の欠落', (d) => ({ ...d, decks: undefined })],
    ['重複した単語帳ID', (d) => ({ ...d, decks: [...d.decks, d.decks[0]] })],
    ['空の単語帳名', (d) => ({ ...d, decks: [{ ...d.decks[0], name: '  ' }] })],
    ['長すぎる単語帳名', (d) => ({ ...d, decks: [{ ...d.decks[0], name: 'a'.repeat(81) }] })],
    ['重複した単語ID', (d) => ({ ...d, words: [...d.words, d.words[0]] })],
    ['存在しない所属先', (d) => ({ ...d, words: [{ ...d.words[0], deckId: 'missing' }] })],
    ['問題が空白だけ', (d) => ({ ...d, words: [{ ...d.words[0], question: '\n ' }] })],
    ['答えが長すぎる', (d) => ({ ...d, words: [{ ...d.words[0], answer: 'a'.repeat(2001) }] })],
    ['補足が長すぎる', (d) => ({ ...d, words: [{ ...d.words[0], note: 'a'.repeat(5001) }] })],
    ['問題が長すぎる', (d) => ({ ...d, words: [{ ...d.words[0], question: 'a'.repeat(2001) }] })],
    ['未知の学習状態', (d) => ({ ...d, words: [{ ...d.words[0], status: 'unknown' }] })],
    ['状態の型違い', (d) => ({ ...d, words: [{ ...d.words[0], status: ['remembered'] }] })],
    [
      '存在しない日付',
      (d) => ({ ...d, words: [{ ...d.words[0], createdAt: '2026-02-30T00:00:00.000Z' }] }),
    ],
    ['不正な学習日時', (d) => ({ ...d, words: [{ ...d.words[0], lastStudiedAt: 'yesterday' }] })],
    ['設定がない', (d) => ({ ...d, settings: null })],
    [
      '不正な標準出題モード',
      (d) => ({ ...d, settings: { ...d.settings, defaultStudyMode: 'other' } }),
    ],
    ['スワイプ設定の型違い', (d) => ({ ...d, settings: { ...d.settings, swipeEnabled: 'true' } })],
    ['セッション項目がない', (d) => ({ ...d, activeSession: undefined })],
    [
      'セッションの所属先がない',
      (d) => ({ ...d, activeSession: { ...d.activeSession, deckId: 'missing' } }),
    ],
    ['空の出題順', (d) => ({ ...d, activeSession: { ...d.activeSession, wordIds: [] } })],
    ['不正な出題形式', (d) => ({ ...d, activeSession: { ...d.activeSession, format: 'other' } })],
    [
      '重複する選択範囲',
      (d) => ({
        ...d,
        activeSession: { ...d.activeSession, scopeWordIds: ['word-1', 'word-1'] },
      }),
    ],
    [
      '選択範囲外の出題単語',
      (d) => ({
        ...d,
        activeSession: { ...d.activeSession, scopeWordIds: ['word-1', 'word-2'] },
      }),
    ],
    [
      '選択肢が不足する4択セッション',
      (d) => ({
        ...d,
        activeSession: {
          ...d.activeSession,
          format: 'multiple-choice',
          scopeWordIds: ['word-1', 'word-2', 'word-3'],
        },
      }),
    ],
    [
      '存在しない出題単語',
      (d) => ({ ...d, activeSession: { ...d.activeSession, wordIds: ['missing'] } }),
    ],
    [
      '重複する出題単語',
      (d) => ({ ...d, activeSession: { ...d.activeSession, wordIds: ['word-1', 'word-1'] } }),
    ],
    [
      '回答順の不一致',
      (d) => ({
        ...d,
        activeSession: {
          ...d.activeSession,
          answers: [{ ...d.activeSession!.answers[0], wordId: 'word-2' }],
        },
      }),
    ],
    [
      '回答済みに未学習を指定',
      (d) => ({
        ...d,
        activeSession: {
          ...d.activeSession,
          answers: [{ ...d.activeSession!.answers[0], rating: 'unlearned' }],
        },
      }),
    ],
    [
      '別単語帳の単語を出題',
      (d) => ({
        ...d,
        decks: [...d.decks, { ...d.decks[0], id: 'deck-2' }],
        words: d.words.map((w) => (w.id === 'word-2' ? { ...w, deckId: 'deck-2' } : w)),
      }),
    ],
  ];
  it.each(invalidCases)('%s を拒否する', (_, change) => {
    expect(validateAppData(change(storedDataFixture()))).toMatchObject({
      ok: false,
      error: { code: 'corrupted' },
    });
  });

  it('学習日時なしの学習済み単語と完了セッションを許可する', () => {
    const sample = storedDataFixture();
    sample.words[0].lastStudiedAt = null;
    sample.activeSession!.answers = sample.activeSession!.wordIds.map((wordId) => ({
      wordId,
      rating: 'remembered',
      answeredAt: '2026-09-18T00:00:00.000Z',
    }));
    expect(validateAppData(sample).ok).toBe(true);
  });

  it('異なる答え4つを持つ4択セッションを復元できる', () => {
    const sample = storedDataFixture();
    sample.words = sample.words.map((word, index) => ({ ...word, answer: `答え${index + 1}` }));
    sample.words.push({ ...sample.words[0], id: 'word-4', answer: '答え4' });
    sample.activeSession = {
      ...sample.activeSession!,
      format: 'multiple-choice',
      scopeWordIds: ['word-1', 'word-2', 'word-3', 'word-4'],
    };
    expect(validateAppData(sample).ok).toBe(true);
  });
});
