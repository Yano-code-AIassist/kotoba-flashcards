import { describe, expect, it } from 'vitest';
import { parseRoute } from './navigation';

describe('単語管理のURL', () => {
  it('ホーム・単語帳選択・詳細・一覧・追加・編集を区別する', () => {
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('#/')).toEqual({ page: 'home' });
    expect(parseRoute('#/manage')).toEqual({ page: 'manage' });
    expect(parseRoute('#/settings')).toEqual({ page: 'settings' });
    expect(parseRoute('#/decks/deck-a')).toEqual({ page: 'deck', deckId: 'deck-a' });
    expect(parseRoute('#/decks/deck-a/study')).toEqual({ page: 'study', deckId: 'deck-a' });
    expect(parseRoute('#/decks/deck-a/words')).toEqual({ page: 'words', deckId: 'deck-a' });
    expect(parseRoute('#/decks/deck-a/words/new')).toEqual({ page: 'word-new', deckId: 'deck-a' });
    expect(parseRoute('#/decks/deck-a/words/word-a/edit')).toEqual({
      page: 'word-edit',
      deckId: 'deck-a',
      wordId: 'word-a',
    });
  });

  it('日本語や区切り文字を含むIDは、各要素として復号する', () => {
    expect(
      parseRoute('#/decks/%E5%9F%BA%E6%9C%AC%2F%E6%83%85%E5%A0%B1/words/word%2F1/edit'),
    ).toEqual({ page: 'word-edit', deckId: '基本/情報', wordId: 'word/1' });
    expect(parseRoute('#/decks/a/words/new/edit')).toEqual({
      page: 'word-edit',
      deckId: 'a',
      wordId: 'new',
    });
  });

  it('不正なURL・存在しない画面・復号できないIDを安全に扱う', () => {
    for (const hash of [
      '#/decks/',
      '#/decks/%/study',
      '#/decks/a/study/extra',
      '#/decks/a/words/',
      '#/decks/a/words/new/edit/extra',
      '#/settings/extra',
      '#/decks/%',
      '#/decks/a/words/%E0%A4/edit',
    ]) {
      expect(parseRoute(hash)).toEqual({ page: 'not-found' });
    }
  });
});
