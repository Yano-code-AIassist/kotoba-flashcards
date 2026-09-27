import { ArrowLeft, LoaderCircle, SearchX } from 'lucide-react';
import type { AppRoute } from '../../hooks/useNavigation';
import { useAppData } from '../../hooks/useAppData';
import type { Deck } from '../../types/domain';
import { calculateProgress } from '../../utils/progress';
import { HomePage } from '../../pages/HomePage';
import { DeckDetailPage } from '../../pages/DeckDetailPage';
import { WordManagerPage } from '../../pages/WordManagerPage';
import { WordEditorPage } from '../../pages/WordEditorPage';
import { StorageRecovery } from '../common/StorageRecovery';
import { StudyPage } from '../../pages/StudyPage';
import { SettingsPage } from '../../pages/SettingsPage';

interface PageRouterProps {
  route: AppRoute;
  routeKey: string;
  onCreateDeck: () => void;
  onRenameDeck: (deck: Deck) => void;
  onDeleteDeck: (deck: Deck) => void;
  onNotice: (message: string) => void;
}

function MissingPage({
  isWord = false,
  isRoute = false,
  deckId,
}: {
  isWord?: boolean;
  isRoute?: boolean;
  deckId?: string;
}) {
  return (
    <div className="not-found">
      <SearchX size={40} />
      <h1>
        {isRoute
          ? 'ページが見つかりません'
          : isWord
            ? '単語が見つかりません'
            : '単語帳が見つかりません'}
      </h1>
      <p>
        {isRoute
          ? 'URLを確認するか、ホームから目的の画面を開いてください。'
          : '削除されたか、このアカウントには保存されていないデータです。URLも確認してください。'}
      </p>
      <a
        href={deckId ? `#/decks/${encodeURIComponent(deckId)}/words` : '#/'}
        className="button button-secondary"
      >
        <ArrowLeft size={17} />
        {deckId ? '単語一覧に戻る' : 'ホームに戻る'}
      </a>
    </div>
  );
}

export function PageRouter({
  route,
  routeKey,
  onCreateDeck,
  onRenameDeck,
  onDeleteDeck,
  onNotice,
}: PageRouterProps) {
  const { data, isLoading, loadError } = useAppData();
  if (isLoading)
    return (
      <div className="loading-state" role="status">
        <LoaderCircle className="spin" size={26} />
        単語帳を読み込んでいます…
      </div>
    );
  if (loadError) return <StorageRecovery />;
  if (route.page === 'home')
    return (
      <HomePage
        data={data}
        onCreate={onCreateDeck}
        onRename={onRenameDeck}
        onDelete={onDeleteDeck}
      />
    );
  if (route.page === 'manage')
    return (
      <WordManagerPage key={routeKey} data={data} onCreateDeck={onCreateDeck} onNotice={onNotice} />
    );
  if (route.page === 'settings') return <SettingsPage key={routeKey} onNotice={onNotice} />;
  if (route.page === 'not-found') return <MissingPage isRoute />;

  const deck = data.decks.find((item) => item.id === route.deckId);
  if (!deck) return <MissingPage />;
  const folderId = 'folderId' in route ? (route.folderId ?? null) : null;
  if (
    folderId !== null &&
    !data.folders.some((folder) => folder.id === folderId && folder.deckId === deck.id)
  )
    return <MissingPage />;
  if (route.page === 'study') return <StudyPage key={routeKey} deck={deck} />;
  if (route.page === 'deck')
    return (
      <DeckDetailPage
        deck={deck}
        progress={calculateProgress(data.words.filter((word) => word.deckId === deck.id))}
        onRename={() => onRenameDeck(deck)}
        onDelete={() => onDeleteDeck(deck)}
      />
    );
  if (route.page === 'words')
    return (
      <WordManagerPage
        key={routeKey}
        data={data}
        deck={deck}
        folderId={folderId}
        onCreateDeck={onCreateDeck}
        onNotice={onNotice}
      />
    );
  if (route.page === 'word-new')
    return <WordEditorPage key={routeKey} deck={deck} folderId={folderId} onNotice={onNotice} />;

  // URLの単語IDだけでなく所属も確認し、別の単語帳の編集画面を開かない。
  const word = data.words.find((item) => item.id === route.wordId && item.deckId === deck.id);
  if (!word) return <MissingPage isWord deckId={deck.id} />;
  if (folderId !== null && (word.folderId ?? null) !== folderId)
    return <MissingPage isWord deckId={deck.id} />;
  return (
    <WordEditorPage
      key={routeKey}
      deck={deck}
      folderId={word.folderId ?? null}
      word={word}
      onNotice={onNotice}
    />
  );
}
