import { ArrowUpRight, BookOpen, Pencil, Trash2 } from 'lucide-react';
import type { Deck, DeckProgress } from '../../types/domain';
import { ProgressSummary } from './ProgressSummary';

interface DeckCardProps {
  deck: Deck;
  progress: DeckProgress;
  index: number;
  onRename: () => void;
  onDelete: () => void;
}

export function DeckCard({ deck, progress, index, onRename, onDelete }: DeckCardProps) {
  const colors = ['mint', 'lavender', 'sand'];
  return (
    <article className="deck-card">
      <div className="deck-card-top">
        <span className={`deck-icon ${colors[index % colors.length]}`}>
          <BookOpen size={23} />
        </span>
        <div className="deck-actions">
          <button
            className="icon-button"
            aria-label={`${deck.name}の名前を変更`}
            title="名前を変更"
            onClick={onRename}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button danger-hover"
            aria-label={`${deck.name}を削除`}
            title="単語帳を削除"
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <h3>
        <a href={`#/decks/${encodeURIComponent(deck.id)}`}>{deck.name}</a>
      </h3>
      <p className="deck-word-count">
        {progress.total}
        <span>語の単語</span>
      </p>
      <ProgressSummary progress={progress} />
      <a className="deck-open" href={`#/decks/${encodeURIComponent(deck.id)}`}>
        単語帳を開く
        <ArrowUpRight size={17} />
      </a>
    </article>
  );
}
