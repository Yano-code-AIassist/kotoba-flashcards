import type { LearningStatus, Word } from '../types/domain';

export type WordStatusFilter = LearningStatus | 'all';
export const WORD_STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'unlearned', label: '未学習' },
  { value: 'remembered', label: '覚えた' },
  { value: 'learning', label: 'まだ' },
] as const;

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase();
}

export function filterWords(words: Word[], query: string, status: WordStatusFilter): Word[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return words.filter((word) => {
    if (status !== 'all' && word.status !== status) return false;
    const fields = [word.question, word.answer, word.note].map(normalize);
    // 複数の検索語はAND条件。検索用の変換は保存データには反映しない。
    return terms.every((term) => fields.some((field) => field.includes(term)));
  });
}
