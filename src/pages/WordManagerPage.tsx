import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Plus } from 'lucide-react';
import type { AppData, Deck, Word } from '../types/domain';
import { WordTable } from '../components/editor/WordTable';
import { DeleteWordDialog } from '../components/editor/DeleteWordDialog';
import { useAppData } from '../hooks/useAppData';
import { useNavigation } from '../hooks/useNavigation';
import { FolderExplorer } from '../components/folders/FolderExplorer';
import { FolderBreadcrumbs } from '../components/folders/FolderBreadcrumbs';
import { MoveWordDialog } from '../components/folders/MoveWordDialog';
import { StudyLauncher } from '../components/study/StudyLauncher';
import { wordsInFolder } from '../services/folderService';
import { canLeave, folderHref } from '../services/navigation';

interface WordManagerPageProps {
  data: AppData;
  deck?: Deck;
  folderId?: string | null;
  onCreateDeck: () => void;
  onNotice: (message: string) => void;
}

export function WordManagerPage({
  data,
  deck,
  folderId = null,
  onCreateDeck,
  onNotice,
}: WordManagerPageProps) {
  const { deleteWord, isSaving } = useAppData();
  const { navigateWords } = useNavigation();
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);
  const [lastDeletedId, setLastDeletedId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<Word | null>(null);
  const [recursive, setRecursive] = useState(false);
  const folder = data.folders.find((item) => item.id === folderId);
  const words = deck ? wordsInFolder(data, deck.id, folderId, recursive) : [];
  const hasChildren = data.folders.some(
    (item) => item.deckId === deck?.id && item.parentId === folderId,
  );
  const studyWordCount = deck ? wordsInFolder(data, deck.id, folderId, true).length : 0;

  useEffect(() => {
    // 削除で起動ボタンが消えるため、ダイアログの後片付け後に本文へ戻す。
    if (lastDeletedId) document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [lastDeletedId]);

  return (
    <>
      {deck && (
        <div className="manager-location">
          <a
            className="back-link"
            href={
              folder
                ? folderHref(deck.id, folder.parentId)
                : `#/decks/${encodeURIComponent(deck.id)}`
            }
          >
            <ArrowLeft size={17} />
            {folder ? '上の階層へ' : '単語帳の詳細に戻る'}
          </a>
          <FolderBreadcrumbs deck={deck} folderId={folderId} />
        </div>
      )}
      <div className="manager-heading">
        <div>
          <h1>{folder?.name ?? '単語を管理'}</h1>
          {!deck && <p>編集する単語帳を選んでください。</p>}
        </div>
      </div>
      {!deck ? (
        data.decks.length === 0 ? (
          <section className="detail-empty">
            <span className="detail-empty-icon">
              <BookOpen size={32} />
            </span>
            <h2>まずは単語帳をつくろう</h2>
            <p>単語帳を作成すると、単語を追加できます。</p>
            <button className="button button-primary" onClick={onCreateDeck}>
              <Plus size={18} />
              単語帳を作成
            </button>
          </section>
        ) : (
          <div className="deck-chooser">
            {data.decks.map((item) => (
              <a
                key={item.id}
                className="deck-choice"
                href={`#/decks/${encodeURIComponent(item.id)}/words`}
              >
                <span className="deck-icon mint">
                  <BookOpen size={22} />
                </span>
                <div>
                  <h2>{item.name}</h2>
                  <p>{data.words.filter((word) => word.deckId === item.id).length}語の単語</p>
                </div>
                <ArrowRight size={18} />
              </a>
            ))}
          </div>
        )
      ) : (
        <>
          <FolderExplorer key={folderId ?? 'root'} deck={deck} folderId={folderId} />
          {folder && studyWordCount > 0 && (
            <details className="folder-study">
              <summary>このフォルダーで学習テスト（{studyWordCount}語）</summary>
              {hasChildren && (
                <p className="study-scope-hint">出題する子フォルダーを複数選択できます。</p>
              )}
              <StudyLauncher key={folder.id} deck={deck} folderId={folder.id} />
            </details>
          )}
          {!folder && data.decks.length > 1 && (
            <div className="word-list-toolbar">
              <div className="deck-select-field">
                <label htmlFor="managed-deck">
                  <BookOpen size={16} />
                  単語帳
                </label>
                <select
                  id="managed-deck"
                  value={deck.id}
                  onChange={(event) => navigateWords(event.target.value)}
                >
                  {data.decks.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <WordTable
            key={`${folderId}:${recursive}`}
            deck={deck}
            folderId={folderId}
            words={words}
            onDelete={setDeleteTarget}
            onMove={setMoveTarget}
            onNotice={onNotice}
            scopeControl={
              (hasChildren || recursive) && (
                <div className="word-scope-select">
                  <label className="sr-only" htmlFor="folder-word-scope">
                    単語の表示範囲
                  </label>
                  <select
                    id="folder-word-scope"
                    value={recursive ? 'all' : 'direct'}
                    disabled={isSaving}
                    onChange={(event) => {
                      if (canLeave()) setRecursive(event.target.value === 'all');
                    }}
                  >
                    <option value="direct">この場所の単語</option>
                    <option value="all">下の階層も含める</option>
                  </select>
                </div>
              )
            }
          />
        </>
      )}
      {moveTarget && (
        <MoveWordDialog
          word={moveTarget}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            setMoveTarget(null);
            onNotice(
              data.activeSession?.wordIds.includes(moveTarget.id) ||
                data.activeSession?.scopeWordIds?.includes(moveTarget.id)
                ? '単語を移動しました。前の学習は終了しました。学習状態は引き継がれます。'
                : '単語を移動しました。学習状態は引き継がれます。',
            );
          }}
        />
      )}
      {deleteTarget && (
        <DeleteWordDialog
          word={deleteTarget}
          busy={isSaving}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => deleteWord(deleteTarget.deckId, deleteTarget.id)}
          onDeleted={() => {
            setLastDeletedId(deleteTarget.id);
            setDeleteTarget(null);
            onNotice(
              data.activeSession?.wordIds.includes(deleteTarget.id) ||
                data.activeSession?.scopeWordIds?.includes(deleteTarget.id)
                ? '単語を削除しました。前の学習は終了しました。単語帳から新しく学習できます。'
                : '単語を削除しました。',
            );
          }}
        />
      )}
    </>
  );
}
