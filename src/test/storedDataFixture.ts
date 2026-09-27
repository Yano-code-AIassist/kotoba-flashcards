import type { AppData } from '../types/domain';
import { createInitialAppData } from '../services/appRepository';

export function storedDataFixture(): AppData {
  const date = '2026-09-18T00:00:00.000Z';
  return {
    ...createInitialAppData(),
    revision: 7,
    decks: [{ id: 'deck-1', name: '基本情報技術者', createdAt: date, updatedAt: date }],
    words: ['remembered', 'learning', 'unlearned'].map((status, index) => ({
      id: `word-${index + 1}`,
      deckId: 'deck-1',
      question: `問題${index + 1}`,
      answer: '答え\n2行目',
      note: '補足\n  字下げ',
      status: status as AppData['words'][number]['status'],
      lastStudiedAt: index === 2 ? null : date,
      createdAt: date,
      updatedAt: date,
    })),
    settings: { defaultStudyMode: 'random', swipeEnabled: false },
    activeSession: {
      id: 'session-1',
      deckId: 'deck-1',
      mode: 'all',
      wordIds: ['word-1', 'word-2', 'word-3'],
      answers: [{ wordId: 'word-1', rating: 'remembered', answeredAt: date }],
      startedAt: date,
      updatedAt: date,
    },
  };
}
