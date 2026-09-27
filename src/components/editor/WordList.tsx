import { FolderInput, Pencil, Trash2 } from 'lucide-react';
import type { Word } from '../../types/domain';
import { StatusBadge } from '../common/StatusBadge';
import { locationBase } from '../../services/navigation';

interface WordListProps {
  words: Word[];
  busy: boolean;
  onDelete: (word: Word) => void;
  onMove: (word: Word) => void;
}

export function WordList({ words, busy, onDelete, onMove }: WordListProps) {
  return (
    <ol className="word-list" aria-label="登録した単語">
      {words.map((word, index) => (
        <li key={word.id} className="word-card" data-word-id={word.id}>
          <div className="word-card-heading">
            <span className="word-number">{String(index + 1).padStart(2, '0')}</span>
            <StatusBadge status={word.status} />
            <div className="word-card-actions">
              <a
                className="icon-button"
                data-word-edit={word.id}
                href={`${locationBase(word.deckId, word.folderId ?? null)}/words/${encodeURIComponent(word.id)}/edit`}
                aria-label={`単語${index + 1}を編集`}
                title="単語を編集"
              >
                <Pencil size={17} />
              </a>
              <button
                className="icon-button"
                aria-label={`単語${index + 1}を移動`}
                title="フォルダーへ移動"
                disabled={busy}
                onClick={() => onMove(word)}
              >
                <FolderInput size={17} />
              </button>
              <button
                className="icon-button danger-hover"
                aria-label={`単語${index + 1}を削除`}
                title="単語を削除"
                disabled={busy}
                onClick={() => onDelete(word)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
          <dl className="word-fields">
            <div>
              <dt>
                <span>Q</span>問題
              </dt>
              <dd className="word-question">{word.question}</dd>
            </div>
            <div>
              <dt>
                <span>A</span>答え
              </dt>
              <dd>{word.answer}</dd>
            </div>
            {word.note && (
              <div className="word-note">
                <dt>補足説明</dt>
                <dd>{word.note}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}
