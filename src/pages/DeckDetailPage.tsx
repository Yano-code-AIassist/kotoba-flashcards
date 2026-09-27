import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleDashed,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Layers2,
} from 'lucide-react';
import type { Deck, DeckProgress } from '../types/domain';
import { StudyLauncher } from '../components/study/StudyLauncher';
import { FolderExplorer } from '../components/folders/FolderExplorer';

interface DeckDetailPageProps {
  deck: Deck;
  progress: DeckProgress;
  onRename: () => void;
  onDelete: () => void;
}

export function DeckDetailPage({ deck, progress, onRename, onDelete }: DeckDetailPageProps) {
  return (
    <>
      <a href="#/" className="back-link">
        <ArrowLeft size={17} />
        マイ単語帳に戻る
      </a>
      <div className="detail-heading">
        <div className="detail-title">
          <span className="deck-icon mint">
            <BookOpen size={27} />
          </span>
          <div>
            <p className="eyebrow">MY DECK</p>
            <h1>{deck.name}</h1>
            <p className="detail-word-count">
              登録した単語 <strong>{progress.total}</strong> 語
            </p>
          </div>
        </div>
        <div className="detail-actions">
          <button className="button button-secondary" onClick={onRename}>
            <Pencil size={16} />
            名前を変更
          </button>
          <button className="button button-quiet-danger" onClick={onDelete}>
            <Trash2 size={16} />
            削除
          </button>
        </div>
      </div>
      <FolderExplorer deck={deck} />
      <section className="detail-progress-panel" aria-labelledby="detail-progress-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="detail-progress-heading">学習の進み具合</h2>
          <strong className="detail-percent">
            {progress.percent}
            <span>%</span>
          </strong>
        </div>
        <progress
          className="deck-progress"
          max={100}
          value={progress.percent}
          aria-label={`学習進捗 ${progress.percent}%`}
        />
        <div className="detail-counts">
          <div>
            <span>
              <Check size={17} />
              覚えた
            </span>
            <strong>
              {progress.remembered}
              <small>語</small>
            </strong>
          </div>
          <div>
            <span>
              <RotateCcw size={16} />
              まだ
            </span>
            <strong>
              {progress.learning}
              <small>語</small>
            </strong>
          </div>
          <div>
            <span>
              <CircleDashed size={17} />
              未学習
            </span>
            <strong>
              {progress.unlearned}
              <small>語</small>
            </strong>
          </div>
        </div>
      </section>
      {progress.total > 0 && <StudyLauncher key={deck.id} deck={deck} />}
      <section className={`detail-empty${progress.total > 0 ? ' detail-manage-panel' : ''}`}>
        <span className="detail-empty-icon">
          <BookOpen size={32} strokeWidth={1.5} />
        </span>
        <h2>{progress.total === 0 ? '最初の単語を追加しよう' : 'ことばを集めて、知識にしよう'}</h2>
        <p>
          {progress.total === 0
            ? '問題と答えをセットにして、覚えたいことを登録できます。'
            : '登録した単語を見返したり、内容を編集したりできます。'}
        </p>
        <div className="detail-word-actions">
          <a
            className="button button-primary"
            href={`#/decks/${encodeURIComponent(deck.id)}/words/new`}
          >
            <Plus size={17} />
            単語を追加
          </a>
          <a
            className="button button-secondary"
            href={`#/decks/${encodeURIComponent(deck.id)}/words`}
          >
            <Layers2 size={17} />
            単語を管理
          </a>
        </div>
      </section>
    </>
  );
}
