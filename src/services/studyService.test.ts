import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppData, StudyFormat, StudyMode, StudyRating } from '../types/domain';
import type { Result } from '../types/storage';
import { storedDataFixture } from '../test/storedDataFixture';
import {
  createStudyOrder,
  getDistinctAnswerCount,
  getMultipleChoiceOptions,
  getStudyCandidates,
  startStudyInData,
  rateStudyInData,
  closeStudyInData,
} from './studyService';
import { createLocalStorageRepository } from './localStorageRepository';
import { validateAppData } from './validateAppData';
import { createWordInData, updateWordInData, deleteWordFromData } from './wordService';
import { deleteDeckFromData } from './deckService';

function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
function sample(): AppData {
  const data = storedDataFixture();
  data.activeSession = null;
  data.decks.push({ ...data.decks[0], id: 'deck-2', name: '別の単語帳' });
  data.words.push({ ...data.words[0], id: 'other-word', deckId: 'deck-2' });
  return data;
}
function choiceSample(): AppData {
  const data = sample();
  data.words = data.words.map((word, index) =>
    word.deckId === 'deck-1' ? { ...word, answer: `答え${index + 1}` } : word,
  );
  data.words.push({
    ...data.words[0],
    id: 'word-4',
    answer: '答え4',
    status: 'remembered',
  });
  return data;
}
afterEach(() => vi.useRealTimers());

describe('出題順', () => {
  it.each<[StudyMode, string[]]>([
    ['all', ['word-1', 'word-2', 'word-3']],
    ['unlearned', ['word-3']],
    ['learning', ['word-2']],
    ['random', ['word-1', 'word-2', 'word-3']],
  ])('%sの対象だけを、別単語帳を混ぜず抽出する', (mode, ids) => {
    expect(getStudyCandidates(sample().words, 'deck-1', mode).map((w) => w.id)).toEqual(ids);
  });
  it('作成日時・IDの順を使い、元の配列を並べ替えない', () => {
    const data = sample();
    data.words.reverse();
    data.words.find((w) => w.id === 'word-3')!.createdAt = '2026-01-01T00:00:00.000Z';
    const before = structuredClone(data.words);
    expect(getStudyCandidates(data.words, 'deck-1', 'all').map((w) => w.id)).toEqual([
      'word-3',
      'word-1',
      'word-2',
    ]);
    expect(data.words).toEqual(before);
  });
  it('ランダムでも各単語を一度ずつ含み、元データを変更しない', () => {
    const data = sample();
    const before = structuredClone(data);
    const order = createStudyOrder(data.words, 'deck-1', 'random', null, () => 0);
    expect(order).toEqual(['word-2', 'word-3', 'word-1']);
    expect(new Set(order).size).toBe(3);
    expect(data).toEqual(before);
  });
  it('前回最後の回答と先頭が同じなら2番目と交換し、1語ならそのまま出す', () => {
    const data = storedDataFixture();
    expect(createStudyOrder(data.words, 'deck-1', 'all', data.activeSession)).toEqual([
      'word-2',
      'word-1',
      'word-3',
    ]);
    expect(createStudyOrder([data.words[0]], 'deck-1', 'all', data.activeSession)).toEqual([
      'word-1',
    ]);
  });
});

describe('4択問題', () => {
  it('正解1つと重複しない誤答3つを、再開しても変わらない順番で作る', () => {
    const data = choiceSample();
    const pool = data.words.filter((word) => word.deckId === 'deck-1');
    const first = getMultipleChoiceOptions(pool, 'word-1');
    expect(first).toHaveLength(4);
    expect(first).toContain('答え1');
    expect(new Set(first).size).toBe(4);
    expect(getMultipleChoiceOptions(pool, 'word-1')).toEqual(first);
  });

  it('表記だけが異なる同じ答えを別の選択肢として数えない', () => {
    const data = choiceSample();
    data.words[1].answer = ' ＡＢＣ　ＤＥＦ ';
    data.words[2].answer = 'abc def';
    expect(getDistinctAnswerCount(data.words.filter((word) => word.deckId === 'deck-1'))).toBe(3);
  });

  it('選択範囲を誤答候補として保存し、対象が1語でも4択を開始できる', () => {
    const data = choiceSample();
    const change = ok(
      startStudyInData(
        data,
        'deck-1',
        'unlearned',
        null,
        false,
        null,
        undefined,
        'multiple-choice',
      ),
    );
    expect(change.value).toMatchObject({
      format: 'multiple-choice',
      wordIds: ['word-3'],
      scopeWordIds: ['word-1', 'word-2', 'word-3', 'word-4'],
    });
    expect(validateAppData(change.data).ok).toBe(true);
    const retry = ok(
      startStudyInData(
        data,
        'deck-1',
        'learning',
        null,
        false,
        null,
        undefined,
        'multiple-choice',
        ['word-2'],
      ),
    );
    expect(retry.value.wordIds).toEqual(['word-2']);
    expect(retry.value.scopeWordIds).toEqual(['word-1', 'word-2', 'word-3', 'word-4']);
  });

  it('異なる答えが4つ未満の場合と不正な形式を拒否する', () => {
    expect(
      startStudyInData(sample(), 'deck-1', 'all', null, false, null, undefined, 'multiple-choice')
        .ok,
    ).toBe(false);
    expect(
      startStudyInData(
        choiceSample(),
        'deck-1',
        'all',
        null,
        false,
        null,
        undefined,
        'other' as StudyFormat,
      ).ok,
    ).toBe(false);
    expect(
      startStudyInData(
        choiceSample(),
        'deck-1',
        'all',
        null,
        false,
        null,
        undefined,
        'multiple-choice',
        ['other-word'],
      ).ok,
    ).toBe(false);
  });
});

describe('学習の開始・回答・完了', () => {
  it('開始時に順序と空の回答を確定し、学習状態は変更しない', () => {
    const data = sample();
    const before = structuredClone(data);
    const change = ok(startStudyInData(data, 'deck-1', 'all', null));
    expect(change.value).toMatchObject({
      deckId: 'deck-1',
      mode: 'all',
      wordIds: ['word-1', 'word-2', 'word-3'],
      answers: [],
    });
    expect(change.data.words).toEqual(data.words);
    expect(validateAppData(change.data).ok).toBe(true);
    expect(data).toEqual(before);
  });
  it('画面で複数選択した範囲の単語だけを出題し、不正な範囲は拒否する', () => {
    const data = sample();
    const change = ok(
      startStudyInData(data, 'deck-1', 'all', null, false, null, ['word-1', 'word-3']),
    );
    expect(change.value.wordIds).toEqual(['word-1', 'word-3']);
    expect(change.value.folderId).toBeNull();
    expect(
      startStudyInData(data, 'deck-1', 'all', null, false, null, ['word-1', 'word-1']).ok,
    ).toBe(false);
    expect(startStudyInData(data, 'deck-1', 'all', null, false, null, ['other-word']).ok).toBe(
      false,
    );
    expect(startStudyInData(data, 'deck-1', 'all', null, false, null, []).ok).toBe(false);
  });
  it('選択範囲のテスト結果から「まだ」だけを再テストする', () => {
    const data = sample();
    const started = ok(
      startStudyInData(data, 'deck-1', 'all', null, false, null, ['word-1', 'word-2']),
    );
    const first = ok(rateStudyInData(started.data, started.value.id, 'word-1', 'learning'));
    const completed = ok(rateStudyInData(first.data, first.value.id, 'word-2', 'remembered'));
    const retry = ok(
      startStudyInData(
        completed.data,
        'deck-1',
        'learning',
        completed.value.id,
        false,
        null,
        completed.value.wordIds,
      ),
    );
    expect(retry.value.wordIds).toEqual(['word-1']);
  });
  it('対象0件・不正な出題方法・存在しない単語帳では既存データを維持する', () => {
    const data = sample();
    const before = structuredClone(data);
    expect(startStudyInData(data, 'deck-2', 'learning', null).ok).toBe(false);
    expect(startStudyInData(data, 'deck-1', 'other' as StudyMode, null).ok).toBe(false);
    expect(startStudyInData(data, 'missing', 'all', null).ok).toBe(false);
    expect(data).toEqual(before);
  });
  it('途中の学習は確認なしで置き換えず、確認したIDが一致した場合のみ切り替える', () => {
    const data = storedDataFixture();
    expect(startStudyInData(data, 'deck-1', 'all', data.activeSession!.id).ok).toBe(false);
    expect(startStudyInData(data, 'deck-1', 'all', 'old-session', true).ok).toBe(false);
    const change = ok(startStudyInData(data, 'deck-1', 'all', data.activeSession!.id, true));
    expect(change.value.id).not.toBe(data.activeSession!.id);
    expect(change.data.words).toEqual(data.words);
    expect(change.value.answers).toEqual([]);
  });
  it('別単語帳へ切り替えても回答済みの状態を残す', () => {
    const data = sample();
    data.activeSession = storedDataFixture().activeSession;
    const change = ok(startStudyInData(data, 'deck-2', 'all', data.activeSession!.id, true));
    expect(change.value.wordIds).toEqual(['other-word']);
    expect(change.data.words).toEqual(data.words);
  });
  it('回答時に状態・学習日時・更新日時・回答位置をまとめて更新する', () => {
    vi.useFakeTimers();
    const now = '2026-09-19T01:02:03.000Z';
    vi.setSystemTime(new Date(now));
    const data = storedDataFixture();
    const before = structuredClone(data);
    const change = ok(rateStudyInData(data, data.activeSession!.id, 'word-2', 'remembered'));
    expect(change.value.answers.at(-1)).toEqual({
      wordId: 'word-2',
      rating: 'remembered',
      answeredAt: now,
    });
    expect(change.data.words[1]).toEqual({
      ...data.words[1],
      status: 'remembered',
      lastStudiedAt: now,
      updatedAt: now,
    });
    expect(change.value.updatedAt).toBe(now);
    expect(change.value.wordIds).toEqual(data.activeSession!.wordIds);
    expect(validateAppData(change.data).ok).toBe(true);
    expect(data).toEqual(before);
  });
  it('同じ回答の再送・違う問題・古いセッション・不正な状態を拒否する', () => {
    const data = storedDataFixture();
    const change = ok(rateStudyInData(data, data.activeSession!.id, 'word-2', 'learning'));
    expect(rateStudyInData(change.data, change.value.id, 'word-2', 'learning').ok).toBe(false);
    expect(rateStudyInData(data, data.activeSession!.id, 'word-3', 'learning').ok).toBe(false);
    expect(rateStudyInData(data, 'old', 'word-2', 'learning').ok).toBe(false);
    expect(
      rateStudyInData(data, data.activeSession!.id, 'word-2', 'unlearned' as StudyRating).ok,
    ).toBe(false);
  });
  it('未学習のみの学習中に回答・追加しても、固定した順序を変えない', () => {
    const data = sample();
    data.words = data.words.map((w) => ({ ...w, status: 'unlearned' }));
    const started = ok(startStudyInData(data, 'deck-1', 'unlearned', null));
    const answered = ok(rateStudyInData(started.data, started.value.id, 'word-1', 'remembered'));
    const added = ok(
      createWordInData(answered.data, 'deck-1', { question: '追加', answer: '答え', note: '' }),
    );
    expect(added.data.activeSession!.wordIds).toEqual(['word-1', 'word-2', 'word-3']);
    expect(added.data.activeSession!.wordIds[added.data.activeSession!.answers.length]).toBe(
      'word-2',
    );
  });
  it('全問回答後も結果を保存し、閉じたときだけセッションを消す', () => {
    const started = ok(startStudyInData(sample(), 'deck-1', 'unlearned', null));
    expect(closeStudyInData(started.data, started.value.id).ok).toBe(false);
    const answered = ok(rateStudyInData(started.data, started.value.id, 'word-3', 'learning'));
    expect(answered.value.answers.length).toBe(answered.value.wordIds.length);
    expect(rateStudyInData(answered.data, answered.value.id, 'word-3', 'remembered').ok).toBe(
      false,
    );
    const closed = ok(closeStudyInData(answered.data, answered.value.id));
    expect(closed.data.activeSession).toBeNull();
    expect(closed.data.words).toEqual(answered.data.words);
    expect(validateAppData(closed.data).ok).toBe(true);
  });
  it('「まだ」の復習では最新の状態を選び、前の結果を回答に混ぜない', () => {
    const started = ok(startStudyInData(sample(), 'deck-1', 'unlearned', null));
    const answered = ok(rateStudyInData(started.data, started.value.id, 'word-3', 'learning'));
    const retry = ok(startStudyInData(answered.data, 'deck-1', 'learning', answered.value.id));
    expect(retry.value.wordIds).toEqual(['word-2', 'word-3']);
    expect(retry.value.answers).toEqual([]);
  });
  it('出題対象の編集・削除と単語帳削除でセッションを終了する', () => {
    const data = storedDataFixture();
    expect(
      ok(updateWordInData(data, 'deck-1', 'word-2', { question: '修正', answer: '答え', note: '' }))
        .data.activeSession,
    ).toBeNull();
    expect(ok(deleteWordFromData(data, 'deck-1', 'word-2')).data.activeSession).toBeNull();
    expect(ok(deleteDeckFromData(data, 'deck-1')).data.activeSession).toBeNull();
    expect(data.activeSession).not.toBeNull();
  });
  it('保存先を作り直しても、同じ出題順と未回答位置から再開できる', async () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        raw = value;
      },
      removeItem: () => {
        raw = null;
      },
    };
    const repository = createLocalStorageRepository(() => storage);
    const data = { ...sample(), revision: 0 };
    const started = ok(startStudyInData(data, 'deck-1', 'random', null));
    const saved = ok(await repository.save(started.data, 0));
    const firstId = started.value.wordIds[0];
    const answer = ok(rateStudyInData(saved, started.value.id, firstId, 'learning'));
    const savedAnswer = ok(await repository.save(answer.data, saved.revision));
    const reopened = createLocalStorageRepository(() => storage);
    const restored = ok(await reopened.load())!;
    expect(restored).toEqual(savedAnswer);
    expect(restored.activeSession!.wordIds).toEqual(started.value.wordIds);
    expect(restored.activeSession!.wordIds[restored.activeSession!.answers.length]).toBe(
      started.value.wordIds[1],
    );
    expect(restored.words.find((w) => w.id === firstId)!.status).toBe('learning');
  });
});
