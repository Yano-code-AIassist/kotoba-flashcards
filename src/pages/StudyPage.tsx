import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import type { Deck, StudyRating, StudySession, Word } from '../types/domain';
import { useAppData } from '../hooks/useAppData';
import { STUDY_MODES } from '../services/studyService';
import { FlashCard } from '../components/study/FlashCard';
import { StudyActions } from '../components/study/StudyActions';
import { StudyResult } from '../components/study/StudyResult';
import { StudySwipeControl } from '../components/study/StudySwipeControl';
import { MultipleChoiceCard } from '../components/study/MultipleChoiceCard';
import { FolderBreadcrumbs } from '../components/folders/FolderBreadcrumbs';
import { folderHref } from '../services/navigation';

function StudyQuestion({
  session,
  word,
  onBlockClick,
}: {
  session: StudySession;
  word: Word;
  onBlockClick: () => void;
}) {
  const { data, isSaving, hasExternalChanges, rateStudy } = useAppData();
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const format = session.format ?? 'flashcard';
  const poolWordIds = session.scopeWordIds ?? session.wordIds;
  const poolWords = data.words.filter(
    (item) => item.deckId === session.deckId && poolWordIds.includes(item.id),
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function rate(rating: StudyRating) {
    if ((format === 'flashcard' && !revealed) || pending.current || isSaving || hasExternalChanges)
      return;
    pending.current = true;
    setError(null);
    try {
      const result = await rateStudy(session.id, word.id, rating);
      if (!result.ok) setError(result.error.message);
      // 成功すると親の回答数が進み、keyの変更で次の問題面が新しく表示される。
    } finally {
      pending.current = false;
    }
  }
  return (
    <>
      <div className="study-question-progress">
        <span>
          {format === 'multiple-choice' ? '4択問題' : 'カード式'} ·{' '}
          {STUDY_MODES.find((mode) => mode.value === session.mode)?.label}
        </span>
        <p role="status" aria-live="polite">
          {session.answers.length + 1} <span>/ {session.wordIds.length}</span>
        </p>
        <progress
          max={session.wordIds.length}
          value={session.answers.length}
          aria-label={`${session.wordIds.length}問中${session.answers.length}問を回答済み`}
        />
      </div>
      {format === 'multiple-choice' ? (
        <MultipleChoiceCard
          word={word}
          poolWords={poolWords}
          busy={isSaving}
          blocked={hasExternalChanges}
          isLast={session.answers.length + 1 === session.wordIds.length}
          onSubmit={(rating) => void rate(rating)}
        />
      ) : (
        <>
          <FlashCard
            word={word}
            revealed={revealed}
            busy={isSaving}
            blocked={hasExternalChanges}
            swipeEnabled={data.settings.swipeEnabled}
            onReveal={() => setRevealed(true)}
            onSwipe={(rating) => void rate(rating)}
            onBlockClick={onBlockClick}
          />
          <p className="study-save-hint">
            回答するたびに保存します。途中で戻っても、続きから再開できます。
          </p>
        </>
      )}
      {error && (
        <p className="inline-error" ref={errorRef} tabIndex={-1} role="alert">
          {error}
        </p>
      )}
      {format === 'flashcard' && (
        <StudyActions
          revealed={revealed}
          busy={isSaving}
          blocked={hasExternalChanges}
          onRate={(rating) => void rate(rating)}
        />
      )}
    </>
  );
}

export function StudyPage({ deck }: { deck: Deck }) {
  const { data } = useAppData();
  const suppressClickUntil = useRef(0);
  const blockFollowingClick = useCallback(() => {
    suppressClickUntil.current = performance.now() + 700;
  }, []);
  const session = data.activeSession?.deckId === deck.id ? data.activeSession : null;
  const complete = session !== null && session.answers.length === session.wordIds.length;
  const word = session
    ? data.words.find(
        (item) => item.id === session.wordIds[session.answers.length] && item.deckId === deck.id,
      )
    : undefined;
  return (
    <div
      className="study-page"
      onPointerDownCapture={(event) => {
        if (event.isPrimary) suppressClickUntil.current = 0;
      }}
      onClickCapture={(event) => {
        // スワイプ直後の合成clickが、次のカードや結果のボタンを押さないようにする。
        // 新しいタップと、キーボード・支援技術のclick（detail=0）は通す。
        if (event.detail > 0 && performance.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <a
        className="back-link"
        href={
          session?.folderId
            ? folderHref(deck.id, session.folderId)
            : `#/decks/${encodeURIComponent(deck.id)}`
        }
      >
        <ArrowLeft size={17} />
        {session?.folderId ? 'フォルダーに戻る' : '単語帳に戻る'}
      </a>
      {session?.folderId && <FolderBreadcrumbs deck={deck} folderId={session.folderId} />}
      {session && complete ? (
        <StudyResult key={session.id} deck={deck} session={session} />
      ) : session && word ? (
        <>
          <header className="study-page-heading">
            <p className="eyebrow">ONE WORD AT A TIME</p>
            <h1>{deck.name}</h1>
          </header>
          {(session.format ?? 'flashcard') === 'flashcard' && <StudySwipeControl />}
          <StudyQuestion
            key={`${session.id}:${session.answers.length}`}
            session={session}
            word={word}
            onBlockClick={blockFollowingClick}
          />
        </>
      ) : (
        <section className="study-unavailable">
          <BookOpen size={38} />
          <h1>単語帳から学習を始めましょう</h1>
          <p>
            この単語帳には再開する学習がありません。学習中の単語を編集・削除した場合も、この回の学習は終了します。保存済みの学習状態は残ります。
          </p>
          <a className="button button-primary" href={`#/decks/${encodeURIComponent(deck.id)}`}>
            出題方法を選ぶ
          </a>
        </section>
      )}
    </div>
  );
}
