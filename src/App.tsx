import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { AppLayout } from './components/layout/AppLayout';
import { DeckFormDialog } from './components/deck/DeckFormDialog';
import { DeleteDeckDialog } from './components/deck/DeleteDeckDialog';
import { PageRouter } from './components/layout/PageRouter';
import { useAppData } from './hooks/useAppData';
import { useNavigation } from './hooks/useNavigation';
import type { Deck } from './types/domain';
import { useAccount } from './providers/accountContext';
import { hasSessionDraft } from './services/sessionDrafts';

type OpenDialog = { type: 'create' } | { type: 'rename' | 'delete'; deck: Deck } | null;

export function App() {
  const { user } = useAccount();
  const {
    data,
    isLoading,
    isSaving,
    hasExternalChanges,
    loadError,
    createDeck,
    renameDeck,
    deleteDeck,
  } = useAppData();
  const { route, routeKey, navigateHome, navigateDeck } = useNavigation();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [previousRouteKey, setPreviousRouteKey] = useState(routeKey);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const selectedDeck =
    'deckId' in route ? data.decks.find((deck) => deck.id === route.deckId) : undefined;
  const isManaging = ['manage', 'words', 'word-new', 'word-edit'].includes(route.page);

  if (previousRouteKey !== routeKey) {
    // 戻る操作などで画面を離れたら、前の画面のダイアログを残さない。
    setPreviousRouteKey(routeKey);
    setDialog(null);
  }

  useEffect(() => {
    const pageName = {
      home: 'ホーム',
      manage: '単語管理',
      settings: '設定',
      deck: '単語帳の詳細',
      study: '学習',
      words: '単語管理',
      'word-new': '単語を追加',
      'word-edit': '単語を編集',
      'not-found': 'ページが見つかりません',
    }[route.page];
    document.title = `${pageName}${selectedDeck ? ` — ${selectedDeck.name}` : ''} | kotoba`;
  }, [selectedDeck, route.page]);

  useEffect(() => {
    // 画面移動後は本文へフォーカスを戻し、キーボードでも続けて操作できる。
    document.getElementById('main-content')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [routeKey]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (isLoading || dialog) return;
    let nextDialog: OpenDialog = null;
    if (hasSessionDraft(user.id, 'deck-form:new')) {
      nextDialog = { type: 'create' };
    } else {
      const deck = data.decks.find((item) => hasSessionDraft(user.id, `deck-form:${item.id}`));
      if (deck) nextDialog = { type: 'rename', deck };
    }
    if (!nextDialog) return;
    const timer = window.setTimeout(() => {
      setDialog((current) => current ?? nextDialog);
    });
    return () => window.clearTimeout(timer);
  }, [data.decks, dialog, isLoading, user.id]);

  function showNotice(text: string) {
    setNotice({ text, id: Date.now() });
  }

  return (
    <AppLayout
      isDetail={route.page === 'deck'}
      isHome={route.page === 'home'}
      isManaging={isManaging}
      isSettings={route.page === 'settings'}
      isStudying={route.page === 'study'}
    >
      {hasExternalChanges && !loadError && (
        <div className="storage-conflict" role="alert">
          <div>
            <strong>別のタブなどで保存データが変わりました。</strong>
            <p>
              古い内容で上書きしないよう保存を停止しています。入力中の内容を控えてから、再読み込みしてください。
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.location.reload()}
          >
            ページを再読み込み
          </button>
        </div>
      )}
      <PageRouter
        route={route}
        routeKey={routeKey}
        onCreateDeck={() => setDialog({ type: 'create' })}
        onRenameDeck={(deck) => setDialog({ type: 'rename', deck })}
        onDeleteDeck={(deck) => setDialog({ type: 'delete', deck })}
        onNotice={showNotice}
      />

      {dialog?.type === 'create' && (
        <DeckFormDialog
          busy={isSaving}
          onClose={() => setDialog(null)}
          onSave={createDeck}
          onSaved={(deck) => {
            setDialog(null);
            navigateDeck(deck.id);
            showNotice('新しい単語帳を作成しました。');
          }}
        />
      )}
      {dialog?.type === 'rename' && (
        <DeckFormDialog
          key={dialog.deck.id}
          deck={dialog.deck}
          busy={isSaving}
          onClose={() => setDialog(null)}
          onSave={(name) => renameDeck(dialog.deck.id, name)}
          onSaved={() => {
            setDialog(null);
            showNotice('単語帳の名前を変更しました。');
          }}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteDeckDialog
          deck={dialog.deck}
          wordCount={data.words.filter((word) => word.deckId === dialog.deck.id).length}
          busy={isSaving}
          onClose={() => setDialog(null)}
          onDelete={() => deleteDeck(dialog.deck.id)}
          onDeleted={() => {
            if (selectedDeck?.id === dialog.deck.id) navigateHome();
            setDialog(null);
            showNotice('単語帳を削除しました。');
            requestAnimationFrame(() =>
              document.getElementById('main-content')?.focus({ preventScroll: true }),
            );
          }}
        />
      )}
      <div
        className={`toast-region${route.page === 'word-new' || route.page === 'word-edit' ? ' editor-toast-region' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {notice && route.page !== 'study' && (
          <div className="toast" key={notice.id}>
            <CheckCircle2 size={20} />
            <span>{notice.text}</span>
            <button
              className="icon-button"
              aria-label="通知を閉じる"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
