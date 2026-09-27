import type {
  AppData,
  EntityId,
  StudyFormat,
  StudyMode,
  StudyRating,
  StudySession,
  Word,
} from '../types/domain';
import type { Result } from '../types/storage';
import type { DataChange } from './deckService';
import { createId } from '../utils/createId';
import { folderExists, wordsInFolder } from './folderService';

export const STUDY_MODES: { value: StudyMode; label: string; description: string }[] = [
  { value: 'all', label: 'すべて', description: '登録した順に、ひと通り' },
  { value: 'unlearned', label: '未学習のみ', description: 'まだ学習していない単語' },
  { value: 'learning', label: '「まだ」のみ', description: 'もう一度、覚え直したい単語' },
  { value: 'random', label: 'ランダム', description: 'すべての単語を、順番を変えて' },
];

export const STUDY_FORMATS: { value: StudyFormat; label: string; description: string }[] = [
  { value: 'flashcard', label: 'カード式', description: '答えを表示して、自分で理解度を記録' },
  { value: 'multiple-choice', label: '4択問題', description: '4つの答えから正解を1つ選択' },
];

function choiceKey(answer: string): string {
  return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getDistinctAnswerCount(words: Word[]): number {
  return new Set(words.map((word) => choiceKey(word.answer))).size;
}

export function getMultipleChoiceOptions(words: Word[], wordId: EntityId): string[] {
  const current = words.find((word) => word.id === wordId);
  if (!current) return [];
  const correctKey = choiceKey(current.answer);
  const uniqueAnswers = new Map<string, string>();
  for (const word of words) {
    const key = choiceKey(word.answer);
    if (key !== correctKey && !uniqueAnswers.has(key)) uniqueAnswers.set(key, word.answer);
  }
  const distractors = [...uniqueAnswers.entries()].sort(([left], [right]) => {
    const difference =
      stableHash(`${wordId}:distractor:${left}`) - stableHash(`${wordId}:distractor:${right}`);
    return difference || left.localeCompare(right);
  });
  if (distractors.length < 3) return [];
  return [current.answer, ...distractors.slice(0, 3).map(([, answer]) => answer)]
    .map((answer) => ({ answer, key: choiceKey(answer) }))
    .sort((left, right) => {
      const difference =
        stableHash(`${wordId}:position:${left.key}`) -
        stableHash(`${wordId}:position:${right.key}`);
      return difference || left.key.localeCompare(right.key);
    })
    .map(({ answer }) => answer);
}

export function getStudyCandidates(words: Word[], deckId: EntityId, mode: StudyMode): Word[] {
  return words
    .filter(
      (word) =>
        word.deckId === deckId && (mode === 'all' || mode === 'random' || word.status === mode),
    )
    .sort((a, b) =>
      a.createdAt < b.createdAt
        ? -1
        : a.createdAt > b.createdAt
          ? 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
    );
}

export function createStudyOrder(
  words: Word[],
  deckId: EntityId,
  mode: StudyMode,
  previous: StudySession | null,
  random: () => number = Math.random,
): EntityId[] {
  const ids = getStudyCandidates(words, deckId, mode).map((word) => word.id);
  if (mode === 'random') {
    // Fisher–Yatesで一度だけ並べ替える。回答するたびに抽選し直すと重複や抜けが起きる。
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
  }
  // 再学習の先頭だけ調整し、直前に回答した単語が続くことを避ける。
  if (ids.length > 1 && ids[0] === previous?.answers.at(-1)?.wordId) {
    [ids[0], ids[1]] = [ids[1], ids[0]];
  }
  return ids;
}

function staleSession(): Result<never> {
  return {
    ok: false,
    error: {
      code: 'validation',
      message: '学習の状態が変わりました。単語帳に戻って、現在の学習を確認してください。',
    },
  };
}

export function startStudyInData(
  data: AppData,
  deckId: EntityId,
  mode: StudyMode,
  expectedSessionId: EntityId | null,
  replaceUnfinished = false,
  folderId: EntityId | null = null,
  scopeWordIds?: EntityId[],
  format: StudyFormat = 'flashcard',
  targetWordIds?: EntityId[],
): Result<DataChange<StudySession>> {
  if (!folderExists(data, deckId, folderId)) {
    return {
      ok: false,
      error: { code: 'not-found', message: 'この単語帳は見つかりませんでした。' },
    };
  }
  if (!STUDY_MODES.some((item) => item.value === mode)) {
    return { ok: false, error: { code: 'validation', message: '出題方法を選んでください。' } };
  }
  if (!STUDY_FORMATS.some((item) => item.value === format)) {
    return { ok: false, error: { code: 'validation', message: '出題形式を選んでください。' } };
  }
  const previous = data.activeSession;
  if ((previous?.id ?? null) !== expectedSessionId) return staleSession();
  if (previous && previous.answers.length < previous.wordIds.length && !replaceUnfinished) {
    return {
      ok: false,
      error: {
        code: 'validation',
        message: '途中の学習があります。続けるか、新しい学習へ切り替えるかを選んでください。',
      },
    };
  }
  const availableWords = wordsInFolder(data, deckId, folderId, true);
  let scopedWords = availableWords;
  if (scopeWordIds !== undefined) {
    const allowed = new Set(availableWords.map((word) => word.id));
    const selected = new Set(scopeWordIds);
    if (
      selected.size !== scopeWordIds.length ||
      scopeWordIds.some((id) => typeof id !== 'string' || !allowed.has(id))
    )
      return {
        ok: false,
        error: { code: 'validation', message: '出題範囲を確認して、もう一度選んでください。' },
      };
    scopedWords = availableWords.filter((word) => selected.has(word.id));
  }
  let targetWords = scopedWords;
  if (targetWordIds !== undefined) {
    const allowed = new Set(scopedWords.map((word) => word.id));
    const selected = new Set(targetWordIds);
    if (
      selected.size !== targetWordIds.length ||
      targetWordIds.some((id) => typeof id !== 'string' || !allowed.has(id))
    )
      return {
        ok: false,
        error: { code: 'validation', message: '再テストする単語を確認してください。' },
      };
    targetWords = scopedWords.filter((word) => selected.has(word.id));
  }
  const wordIds = createStudyOrder(targetWords, deckId, mode, previous);
  if (wordIds.length === 0) {
    return {
      ok: false,
      error: {
        code: 'validation',
        message:
          'この出題方法で学習できる単語がありません。別の方法を選ぶか、単語を追加してください。',
      },
    };
  }
  if (format === 'multiple-choice' && getDistinctAnswerCount(scopedWords) < 4) {
    return {
      ok: false,
      error: {
        code: 'validation',
        message: '4択問題には、選択した範囲に異なる答えの単語が4語以上必要です。',
      },
    };
  }
  const now = new Date().toISOString();
  const session: StudySession = {
    id: createId('study'),
    deckId,
    folderId,
    mode,
    format,
    scopeWordIds: scopedWords.map((word) => word.id),
    wordIds,
    answers: [],
    startedAt: now,
    updatedAt: now,
  };
  return { ok: true, value: { data: { ...data, activeSession: session }, value: session } };
}

export function rateStudyInData(
  data: AppData,
  sessionId: EntityId,
  wordId: EntityId,
  rating: StudyRating,
): Result<DataChange<StudySession>> {
  const session = data.activeSession;
  if (!session || session.id !== sessionId || session.wordIds[session.answers.length] !== wordId)
    return staleSession();
  if (rating !== 'learning' && rating !== 'remembered') {
    return {
      ok: false,
      error: { code: 'validation', message: '「まだ」または「覚えた」を選んでください。' },
    };
  }
  const word = data.words.find((item) => item.id === wordId && item.deckId === session.deckId);
  if (!word) return staleSession();
  const now = new Date().toISOString();
  const nextSession: StudySession = {
    ...session,
    updatedAt: now,
    answers: [...session.answers, { wordId, rating, answeredAt: now }],
  };
  // 単語の状態と回答位置を同じデータにまとめ、一方だけが保存されることを防ぐ。
  const nextData: AppData = {
    ...data,
    activeSession: nextSession,
    words: data.words.map((item) =>
      item.id === wordId ? { ...item, status: rating, lastStudiedAt: now, updatedAt: now } : item,
    ),
  };
  return { ok: true, value: { data: nextData, value: nextSession } };
}

export function closeStudyInData(data: AppData, sessionId: EntityId): Result<DataChange<void>> {
  const session = data.activeSession;
  if (!session || session.id !== sessionId) return staleSession();
  // 途中の学習は「戻る」で保持する。明示的に閉じられるのは完了した結果だけ。
  if (session.answers.length !== session.wordIds.length) return staleSession();
  return { ok: true, value: { data: { ...data, activeSession: null }, value: undefined } };
}
