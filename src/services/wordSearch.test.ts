import { describe, expect, it } from 'vitest';
import { filterWords } from './wordSearch';
import { storedDataFixture } from '../test/storedDataFixture';

describe('単語の検索と絞り込み', () => {
  const words = storedDataFixture().words.map((word, index) => ({
    ...word,
    question: ['ＲＦＰ', 'RFI', 'DNS'][index],
    answer: ['Request for Proposal', 'Request for Information', '名前解決'][index],
    note: ['提案依頼書', '', 'ネットワークの基礎'][index],
  }));
  it.each([
    ['rfp', ['word-1']],
    ['ｒｆｉ', ['word-2']],
    ['proposal', ['word-1']],
    ['依頼書', ['word-1']],
    ['REQUEST 提案', ['word-1']],
    ['REQUEST DNS', []],
    ['　 ', ['word-1', 'word-2', 'word-3']],
  ])('問題・答え・補足から%sを検索する', (query, ids) => {
    expect(filterWords(words, query, 'all').map((word) => word.id)).toEqual(ids);
  });
  it('状態と検索をANDで組み合わせる', () => {
    expect(filterWords(words, 'request', 'learning').map((word) => word.id)).toEqual(['word-2']);
    expect(filterWords(words, 'request', 'unlearned')).toEqual([]);
    expect(filterWords(words, '', 'remembered').map((word) => word.id)).toEqual(['word-1']);
  });
  it('元の内容と順番を変えず、空の配列も扱う', () => {
    const before = structuredClone(words);
    filterWords(words, 'ｒｆｐ', 'all');
    expect(words).toEqual(before);
    expect(filterWords([], '', 'all')).toEqual([]);
  });
});
