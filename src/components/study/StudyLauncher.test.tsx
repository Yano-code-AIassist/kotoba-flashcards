import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppContext, type AppContextValue } from '../../providers/appContext';
import { storedDataFixture } from '../../test/storedDataFixture';
import { StudyLauncher } from './StudyLauncher';

describe('StudyLauncher', () => {
  it('単語帳の直下と子フォルダーを複数選択できる出題範囲として表示する', () => {
    const data = storedDataFixture();
    const date = '2026-09-18T00:00:00.000Z';
    data.activeSession = null;
    data.folders = [
      {
        id: 'technology',
        deckId: 'deck-1',
        parentId: null,
        name: 'テクノロジ系',
        createdAt: date,
        updatedAt: date,
      },
      {
        id: 'management',
        deckId: 'deck-1',
        parentId: null,
        name: 'マネジメント系',
        createdAt: date,
        updatedAt: date,
      },
      {
        id: 'theory',
        deckId: 'deck-1',
        parentId: 'technology',
        name: '基礎理論',
        createdAt: date,
        updatedAt: date,
      },
    ];
    data.words = data.words.map((word, index) => ({
      ...word,
      folderId: index === 0 ? null : index === 1 ? 'theory' : 'management',
    }));
    const context = {
      data,
      isLoading: false,
      isSaving: false,
      loadError: null,
      recoveryData: null,
      hasExternalChanges: false,
      startStudy: vi.fn(),
    } as unknown as AppContextValue;

    const html = renderToStaticMarkup(
      <AppContext.Provider value={context}>
        <StudyLauncher deck={data.decks[0]} />
      </AppContext.Provider>,
    );

    expect(html).toContain('保存した単語で学習テスト');
    expect(html).toContain('<legend>出題範囲</legend>');
    expect(html).toContain('複数選択できます。子フォルダーは下の階層も含みます。');
    expect(html).toContain('単語帳直下');
    expect(html).toContain('テクノロジ系');
    expect(html).toContain('マネジメント系');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain('<legend>出題形式</legend>');
    expect(html).toContain('カード式');
    expect(html).toContain('4択問題');
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html).toContain('学習テストを始める');
  });
});
