import { describe, expect, it } from 'vitest';
import type { AppData, Folder } from '../types/domain';
import type { Result } from '../types/storage';
import { storedDataFixture } from '../test/storedDataFixture';
import {
  createFolderInData,
  deleteFolderFromData,
  folderPath,
  MAX_FOLDER_DEPTH,
  moveWordInData,
  renameFolderInData,
  wordsInFolder,
} from './folderService';
import { createWordInData, updateWordInData } from './wordService';
import { deleteDeckFromData, type DataChange } from './deckService';
import { importWordsInData } from './wordImportService';
import { startStudyInData } from './studyService';
import { validateAppData } from './validateAppData';
import { createLocalStorageRepository, STORAGE_KEY } from './localStorageRepository';
import { folderHref, locationBase, parseRoute } from './navigation';

function success<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
const date = '2026-09-22T00:00:00.000Z';
function folder(id: string, parentId: string | null, deckId = 'deck-1'): Folder {
  return { id, deckId, parentId, name: id, createdAt: date, updatedAt: date };
}
function fixture(): AppData {
  const data = storedDataFixture();
  data.decks.push({ ...data.decks[0], id: 'deck-2' });
  data.folders = [
    folder('technology', null),
    folder('theory', 'technology'),
    folder('math', 'theory'),
    folder('management', null),
    folder('other', null, 'deck-2'),
  ];
  data.words[0].folderId = 'theory';
  data.words[1].folderId = 'math';
  data.activeSession = null;
  return data;
}
const input = { question: '2進数', answer: '0と1で数を表す', note: '' };

describe('フォルダーの階層と保存形式', () => {
  it('親フォルダーを指定して作成・改名し、単語や学習状態を維持する', () => {
    const data = fixture();
    const before = structuredClone(data);
    const added = success(createFolderInData(data, 'deck-1', 'theory', '  論理演算  '));
    expect(added.value).toMatchObject({ deckId: 'deck-1', parentId: 'theory', name: '論理演算' });
    const renamed = success(renameFolderInData(added.data, 'deck-1', added.value.id, '論理回路'));
    expect(renamed.value.name).toBe('論理回路');
    expect(renamed.data.words).toEqual(data.words);
    expect(data).toEqual(before);
    expect(validateAppData(renamed.data).ok).toBe(true);
  });
  it('単語帳の直下・フォルダー直下・下層を含む範囲を区別する', () => {
    const data = fixture();
    expect(wordsInFolder(data, 'deck-1', null).map((w) => w.id)).toEqual(['word-3']);
    expect(wordsInFolder(data, 'deck-1', null, true)).toHaveLength(3);
    expect(wordsInFolder(data, 'deck-1', 'technology')).toHaveLength(0);
    expect(wordsInFolder(data, 'deck-1', 'theory').map((w) => w.id)).toEqual(['word-1']);
    expect(wordsInFolder(data, 'deck-1', 'technology', true).map((w) => w.id)).toEqual([
      'word-1',
      'word-2',
    ]);
    expect(folderPath(data.folders, 'math').map((f) => f.id)).toEqual([
      'technology',
      'theory',
      'math',
    ]);
  });
  it('別単語帳の親・移動先や存在しないフォルダーへの操作を拒否する', () => {
    const data = fixture();
    expect(createFolderInData(data, 'deck-1', 'other', '不正').ok).toBe(false);
    expect(createFolderInData(data, 'missing', null, '不正').ok).toBe(false);
    expect(createWordInData(data, 'deck-1', input, 'other').ok).toBe(false);
    expect(moveWordInData(data, 'deck-1', 'word-1', 'other').ok).toBe(false);
    expect(deleteFolderFromData(data, 'deck-2', 'theory').ok).toBe(false);
    expect(renameFolderInData(data, 'deck-1', 'missing', '不正').ok).toBe(false);
    expect(importWordsInData(data, 'deck-1', [input], true, data.revision, 'missing').ok).toBe(
      false,
    );
  });
  it.each(['', '　 ', 'a'.repeat(81)])('不正なフォルダー名 %j を拒否する', (name) => {
    expect(createFolderInData(fixture(), 'deck-1', null, name).ok).toBe(false);
  });
  it('20階層までは作れ、上限を超える追加は拒否する', () => {
    let data = fixture();
    let parent: string | null = null;
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) {
      const added: DataChange<Folder> = success(
        createFolderInData(data, 'deck-1', parent, String(i)),
      );
      data = added.data;
      parent = added.value.id;
    }
    expect(validateAppData(data).ok).toBe(true);
    expect(createFolderInData(data, 'deck-1', parent, '上限超過').ok).toBe(false);
  });
  it('親を削除すると子孫とその単語だけを削除し、出題中なら学習も終了する', () => {
    const data = success(
      startStudyInData(fixture(), 'deck-1', 'all', null, false, 'technology'),
    ).data;
    const removed = success(deleteFolderFromData(data, 'deck-1', 'technology')).data;
    expect(removed.folders.map((f) => f.id)).toEqual(['management', 'other']);
    expect(removed.words.map((w) => w.id)).toEqual(['word-3']);
    expect(removed.activeSession).toBeNull();
    expect(validateAppData(removed).ok).toBe(true);
    expect(success(deleteDeckFromData(data, 'deck-1')).data.folders.map((f) => f.id)).toEqual([
      'other',
    ]);
  });
  it('関係のないフォルダーの削除で途中の学習を失わない', () => {
    const data = success(startStudyInData(fixture(), 'deck-1', 'all', null, false, 'theory')).data;
    expect(success(deleteFolderFromData(data, 'deck-1', 'management')).data.activeSession).toEqual(
      data.activeSession,
    );
  });
  it('単語を移動しても内容・学習状態・日時を保持し、出題中の回だけ終了する', () => {
    const data = success(startStudyInData(fixture(), 'deck-1', 'all', null, false, 'theory')).data;
    const result = success(moveWordInData(data, 'deck-1', 'word-1', 'management'));
    expect(result.value).toMatchObject({
      ...data.words[0],
      folderId: 'management',
      updatedAt: expect.any(String),
    });
    expect(result.data.activeSession).toBeNull();
    expect(success(moveWordInData(data, 'deck-1', 'word-1', 'theory')).data.activeSession).toEqual(
      data.activeSession,
    );
    expect(
      success(moveWordInData(result.data, 'deck-1', 'word-1', null)).value.folderId,
    ).toBeNull();
  });
  it('単語追加・内容編集・一括取込が保存先フォルダーを維持する', () => {
    const added = success(createWordInData(fixture(), 'deck-1', input, 'theory'));
    expect(added.value.folderId).toBe('theory');
    const edited = success(
      updateWordInData(added.data, 'deck-1', added.value.id, { ...input, answer: '編集後' }),
    );
    expect(edited.value.folderId).toBe('theory');
    const imported = success(
      importWordsInData(added.data, 'deck-1', [input], true, added.data.revision, 'management'),
    );
    expect(imported.data.words.at(-1)?.folderId).toBe('management');
    expect(
      importWordsInData(added.data, 'deck-1', [input], true, added.data.revision, 'theory').ok,
    ).toBe(false);
  });
  it('フォルダー単位の学習は子孫を含み、兄弟や単語帳直下を含まない', () => {
    const data = fixture();
    const session = success(startStudyInData(data, 'deck-1', 'all', null, false, 'theory')).value;
    expect(session.folderId).toBe('theory');
    expect(session.wordIds).toEqual(['word-1', 'word-2']);
    expect(success(startStudyInData(data, 'deck-1', 'all', null)).value.wordIds).toHaveLength(3);
    expect(startStudyInData(data, 'deck-1', 'all', null, false, 'management').ok).toBe(false);
    expect(startStudyInData(data, 'deck-1', 'all', null, false, 'other').ok).toBe(false);
  });
  it('親階層で選んだ複数の子フォルダーに含まれる単語だけを出題できる', () => {
    const data = fixture();
    data.words.push({ ...data.words[2], id: 'management-word', folderId: 'management' });
    const selected = [
      ...wordsInFolder(data, 'deck-1', 'technology', true),
      ...wordsInFolder(data, 'deck-1', 'management', true),
    ].map((word) => word.id);
    const session = success(
      startStudyInData(data, 'deck-1', 'all', null, false, null, selected),
    ).value;
    expect(session.wordIds).toEqual(['management-word', 'word-1', 'word-2']);
    expect(session.wordIds).not.toContain('word-3');
    expect(startStudyInData(data, 'deck-1', 'all', null, false, 'theory', ['word-3']).ok).toBe(
      false,
    );
  });
  it.each([
    'cycle',
    'missing',
    'other-deck',
    'duplicate',
    'word-orphan',
    'session-outside',
  ] as const)('破損した階層 %s を保存させない', (kind) => {
    const data = fixture();
    if (kind === 'cycle') data.folders[0].parentId = 'theory';
    if (kind === 'missing') data.folders[1].parentId = 'missing';
    if (kind === 'other-deck') data.folders[1].parentId = 'other';
    if (kind === 'duplicate') data.folders.push(data.folders[0]);
    if (kind === 'word-orphan') data.words[0].folderId = 'missing';
    if (kind === 'session-outside')
      data.activeSession = { ...storedDataFixture().activeSession!, folderId: 'theory' };
    expect(validateAppData(data).ok).toBe(false);
  });
  it('旧版を読み取る際は元データを変更せず、最初の保存で新形式へ移行する', async () => {
    const current = storedDataFixture();
    const { folders: _folders, ...rest } = current;
    void _folders;
    const legacy = { ...rest, version: 1 };
    let stored = JSON.stringify(legacy);
    const original = stored;
    const repo = createLocalStorageRepository(() => ({
      getItem: (key) => (key === STORAGE_KEY ? stored : null),
      setItem: (_key, value) => {
        stored = value;
      },
      removeItem: () => {},
    }));
    expect(success(await repo.load())).toEqual(current);
    expect(stored).toBe(original);
    const saved = success(await repo.save(current, current.revision));
    expect(saved.version).toBe(2);
    expect(saved.revision).toBe(current.revision + 1);
    expect(JSON.parse(stored).words).toEqual(legacy.words);
  });
  it('フォルダーURLと日本語・区切り文字を含むIDを正しく解決する', () => {
    const url = folderHref('基本/情報', '基礎/理論');
    expect(parseRoute(url)).toEqual({ page: 'words', deckId: '基本/情報', folderId: '基礎/理論' });
    expect(parseRoute(locationBase('d', 'f') + '/words/new')).toEqual({
      page: 'word-new',
      deckId: 'd',
      folderId: 'f',
    });
    expect(parseRoute(locationBase('d', 'f') + '/words/w/edit')).toEqual({
      page: 'word-edit',
      deckId: 'd',
      folderId: 'f',
      wordId: 'w',
    });
    expect(parseRoute('#/decks/d/folders/%')).toEqual({ page: 'not-found' });
  });
});
