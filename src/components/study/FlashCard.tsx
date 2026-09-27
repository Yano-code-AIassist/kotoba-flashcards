import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Lightbulb, RefreshCw } from 'lucide-react';
import type { StudyRating, Word } from '../../types/domain';
import { useCardSwipe } from '../../hooks/useCardSwipe';
import { getSwipeRating } from '../../utils/swipeGesture';

export function FlashCard({
  word,
  revealed,
  busy,
  blocked,
  swipeEnabled,
  onReveal,
  onSwipe,
  onBlockClick,
}: {
  word: Word;
  revealed: boolean;
  busy: boolean;
  blocked: boolean;
  swipeEnabled: boolean;
  onReveal: () => void;
  onSwipe: (rating: StudyRating) => void;
  onBlockClick: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const hintId = useId();
  const swipeReady = revealed && swipeEnabled && !busy && !blocked;
  const { preview, handlers } = useCardSwipe({
    enabled: swipeReady,
    onSwipe,
    onTap: onReveal,
    onBlockClick,
  });
  const previewLabel = preview && (preview.dx < 0 ? 'まだ' : '覚えた');
  const readyToRate = preview && getSwipeRating(preview) !== null;
  useEffect(() => {
    // 次の問題は問題面に戻し、キーボードの操作位置もカードへ戻す。
    cardRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="flashcard-area">
      {swipeEnabled && (
        <div className="study-swipe-directions" aria-hidden="true">
          <span>
            <ArrowLeft size={15} /> まだ
          </span>
          <span>答えを見てからスワイプ</span>
          <span>
            覚えた <ArrowRight size={15} />
          </span>
        </div>
      )}
      <button
        ref={cardRef}
        type="button"
        className={`flashcard${revealed ? ' revealed' : ''}${swipeReady ? ' swipe-enabled' : ''}${preview ? (preview.dx < 0 ? ' swiping-learning' : ' swiping-remembered') : ''}`}
        aria-label={revealed ? '答えを表示中' : 'カードをめくって答えを見る'}
        aria-describedby={`${contentId} ${hintId}`}
        aria-expanded={revealed}
        disabled={busy}
        onClick={onReveal}
        {...handlers}
      >
        <span className="flashcard-label">{revealed ? 'ANSWER' : 'QUESTION'}</span>
        {revealed && <span className="flashcard-question-context">{word.question}</span>}
        <span
          id={contentId}
          className="flashcard-content"
          aria-live="polite"
          style={
            preview
              ? { transform: `translateX(${Math.max(-16, Math.min(16, preview.dx / 6))}px)` }
              : undefined
          }
        >
          {revealed ? word.answer : word.question}
        </span>
        <span id={hintId} className="flashcard-hint">
          {preview ? (
            preview.dx < 0 ? (
              <ArrowLeft size={15} />
            ) : (
              <ArrowRight size={15} />
            )
          ) : (
            <RefreshCw size={15} />
          )}
          {preview
            ? readyToRate
              ? `指を離すと「${previewLabel}」`
              : `もう少し横へ動かすと「${previewLabel}」`
            : !revealed
              ? 'タップして答えを見る'
              : swipeEnabled
                ? '左へ「まだ」・右へ「覚えた」／下のボタンでも回答'
                : '思い出せたか、下のボタンで記録'}
        </span>
      </button>
      {revealed && word.note && (
        <div className="study-note">
          <button
            type="button"
            aria-expanded={noteOpen}
            aria-controls="study-note-content"
            onClick={() => setNoteOpen((open) => !open)}
          >
            <Lightbulb size={18} />
            <span>補足説明</span>
            {noteOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {noteOpen && <p id="study-note-content">{word.note}</p>}
        </div>
      )}
    </div>
  );
}
