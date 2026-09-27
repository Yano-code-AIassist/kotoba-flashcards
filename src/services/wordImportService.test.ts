import { describe, expect, it } from 'vitest';
import { importWordsInData, previewWordImport } from './wordImportService';
import { storedDataFixture } from '../test/storedDataFixture';
import { validateAppData } from './validateAppData';
import type { Result } from '../types/storage';
function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
const input = { question: 'RFP', answer: 'Request for Proposal', note: '提案依頼書' };

describe('取り込みプレビュー', () => {
  it('貼り付けの2・3項目と空行を扱い、前後の空白を取り除く', () => {
    const preview = previewWordImport(' \n RFP | A | N \nRFI|B\n', 'paste', false, []);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((row) => [row.line, row.input])).toEqual([
      [2, { question: 'RFP', answer: 'A', note: 'N' }],
      [3, { question: 'RFI', answer: 'B', note: '' }],
    ]);
  });
  it('既存とファイル内の完全重複を検出し、別の答えは区別する', () => {
    const existing = [{ ...storedDataFixture().words[0], ...input }];
    const result = previewWordImport(
      'RFP|Request for Proposal|提案依頼書\nQ|A\nQ|A\nQ|B',
      'paste',
      false,
      existing,
    );
    expect(result.rows.map((row) => row.duplicate)).toEqual([true, false, true, false]);
  });
  it.each(['問題,答え,補足説明\nQ,A,N', 'question,answer,note\nQ,A,N', '問題,答え\nQ,A'])(
    'CSV見出しを明示して読む：%s',
    (text) => {
      const preview = previewWordImport(text, 'csv', true, []);
      expect(preview.errors).toEqual([]);
      expect(preview.rows[0].input.question).toBe('Q');
    },
  );
  it('見出しなしは先頭の単語を捨てず、間違った見出しや列順は拒否する', () => {
    expect(previewWordImport('問題,答え\nQ,A', 'csv', false, []).rows.length).toBe(2);
    expect(previewWordImport('Q,A', 'csv', true, []).errors.length).toBe(1);
    expect(previewWordImport('answer,question\nA,Q', 'csv', true, []).errors.length).toBe(1);
  });
  it.each([
    'Q|',
    'Q',
    'Q|A|N|余分',
    `${'Q'.repeat(2001)}|A`,
    `Q|${'A'.repeat(2001)}`,
    `Q|A|${'N'.repeat(5001)}`,
  ])('項目不足・列過多・上限超過を行エラーにする', (text) => {
    expect(previewWordImport(text, 'paste', false, []).rows[0].errors.length).toBeGreaterThan(0);
  });
  it('CSVの列数を見出しと照合する', () => {
    expect(previewWordImport('問題,答え,補足説明\nQ,A', 'csv', true, []).rows[0].errors).toContain(
      '見出しと同じ3列にしてください。',
    );
  });
  it('空入力・見出しだけ・501件・NUL文字を拒否する', () => {
    for (const text of ['', ' ', 'Q|A\n'.repeat(501), 'Q|A\0'])
      expect(previewWordImport(text, 'paste', false, []).errors.length).toBeGreaterThan(0);
    expect(previewWordImport('問題,答え', 'csv', true, []).errors.length).toBe(1);
    expect(previewWordImport('Q|A\n'.repeat(500), 'paste', false, []).rows.length).toBe(500);
  });
});

describe('一括登録のデータ変更', () => {
  it('全件を新しい未学習として追加し、既存内容・別単語帳・出題順・設定を保持する', () => {
    const data = storedDataFixture();
    data.decks.push({ ...data.decks[0], id: 'd2' });
    data.words.push({ ...data.words[0], id: 'other', deckId: 'd2', ...input });
    const before = structuredClone(data);
    const result = ok(
      importWordsInData(
        data,
        'deck-1',
        [input, { ...input, question: 'RFI' }],
        true,
        data.revision,
      ),
    );
    expect(result.value).toEqual({ created: 2, skipped: 0 });
    expect(result.data.words.slice(0, data.words.length)).toEqual(data.words);
    expect(result.data.activeSession).toEqual(data.activeSession);
    expect(result.data.settings).toEqual(data.settings);
    const added = result.data.words.slice(data.words.length);
    expect(new Set(added.map((word) => word.id)).size).toBe(2);
    expect(
      added.every(
        (word) =>
          word.status === 'unlearned' && word.lastStudiedAt === null && word.deckId === 'deck-1',
      ),
    ).toBe(true);
    expect(validateAppData(result.data).ok).toBe(true);
    expect(data).toEqual(before);
  });
  it('重複除外を保存直前にも行い、解除した場合は別IDで登録する', () => {
    const data = storedDataFixture();
    const duplicate = data.words[0];
    expect(
      ok(importWordsInData(data, 'deck-1', [duplicate, input, input], true, data.revision)).value,
    ).toEqual({ created: 1, skipped: 2 });
    expect(
      ok(importWordsInData(data, 'deck-1', [duplicate, input, input], false, data.revision)).value,
    ).toEqual({ created: 3, skipped: 0 });
    expect(importWordsInData(data, 'deck-1', [duplicate], true, data.revision).ok).toBe(false);
  });
  it('一部不正・存在しない単語帳・古いプレビュー・件数違反では変更しない', () => {
    const data = storedDataFixture();
    const before = structuredClone(data);
    expect(
      importWordsInData(data, 'deck-1', [input, { ...input, answer: '' }], false, data.revision).ok,
    ).toBe(false);
    expect(importWordsInData(data, 'missing', [input], true, data.revision).ok).toBe(false);
    expect(importWordsInData(data, 'deck-1', [input], true, data.revision - 1).ok).toBe(false);
    expect(importWordsInData(data, 'deck-1', [], true, data.revision).ok).toBe(false);
    expect(
      importWordsInData(
        data,
        'deck-1',
        Array.from({ length: 501 }, () => input),
        true,
        data.revision,
      ).ok,
    ).toBe(false);
    expect(data).toEqual(before);
  });
});
