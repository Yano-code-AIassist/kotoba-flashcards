import type { DeckProgress, Word } from '../types/domain';

export function calculateProgress(words: Word[]): DeckProgress {
  const progress: DeckProgress = {
    total: words.length,
    unlearned: 0,
    learning: 0,
    remembered: 0,
    percent: 0,
  };
  for (const word of words) {
    progress[word.status] += 1;
  }
  // 「まだ」と「未学習」は別集計とし、0語の場合のゼロ除算を避ける。
  progress.percent =
    progress.total === 0 ? 0 : Math.floor((progress.remembered / progress.total) * 100);
  return progress;
}
