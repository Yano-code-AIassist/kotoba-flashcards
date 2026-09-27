import { describe, expect, it } from 'vitest';
import type { LearningStatus, Word } from '../types/domain';
import { calculateProgress } from './progress';

function wordsWithStatuses(statuses: LearningStatus[]): Word[] {
  return statuses.map((status, index) => ({
    id: `word-${index}`,
    deckId: 'deck-a',
    question: 'RFP',
    answer: '提案依頼書',
    note: '',
    status,
    lastStudiedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

describe('進捗の表示値', () => {
  it('0語の単語帳は件数・進捗とも0にする', () => {
    expect(calculateProgress([])).toEqual({
      total: 0,
      unlearned: 0,
      learning: 0,
      remembered: 0,
      percent: 0,
    });
  });

  it('未学習と「まだ」を分けて集計し、覚えた割合の小数点以下を切り捨てる', () => {
    const words = wordsWithStatuses(['remembered', 'learning', 'unlearned']);
    const before = structuredClone(words);
    expect(calculateProgress(words)).toEqual({
      total: 3,
      unlearned: 1,
      learning: 1,
      remembered: 1,
      percent: 33,
    });
    expect(words).toEqual(before);
  });

  it('全語を覚えた場合は100％にする', () => {
    expect(calculateProgress(wordsWithStatuses(['remembered', 'remembered']))).toEqual({
      total: 2,
      unlearned: 0,
      learning: 0,
      remembered: 2,
      percent: 100,
    });
  });
});
