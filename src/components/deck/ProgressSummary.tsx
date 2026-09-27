import { BookOpen, Check, CircleDashed, RotateCcw } from 'lucide-react';
import type { DeckProgress } from '../../types/domain';

export function ProgressSummary({ progress }: { progress: DeckProgress }) {
  return (
    <div className="progress-summary">
      <div className="progress-counts">
        <span>
          <Check size={14} />
          覚えた <b>{progress.remembered}</b>
        </span>
        <span>
          <RotateCcw size={13} />
          まだ <b>{progress.learning}</b>
        </span>
        <span>
          <CircleDashed size={14} />
          未学習 <b>{progress.unlearned}</b>
        </span>
      </div>
      <div className="progress-label">
        <span>学習進捗</span>
        <strong>
          {progress.percent}
          <small>%</small>
        </strong>
      </div>
      <progress
        className="deck-progress"
        max={100}
        value={progress.percent}
        aria-label={`学習進捗 ${progress.percent}%`}
      />
    </div>
  );
}

export function OverviewStats({
  deckCount,
  progress,
}: {
  deckCount: number;
  progress: DeckProgress;
}) {
  return (
    <div className="overview-stats">
      <div className="stat-item">
        <span className="stat-icon mint">
          <BookOpen size={22} />
        </span>
        <div>
          <p>単語帳</p>
          <strong>
            {deckCount}
            <span>冊</span>
          </strong>
        </div>
      </div>
      <div className="stat-item">
        <span className="stat-icon lavender">
          <CircleDashed size={23} />
        </span>
        <div>
          <p>登録した単語</p>
          <strong>
            {progress.total}
            <span>語</span>
          </strong>
        </div>
      </div>
      <div className="stat-item">
        <span className="stat-icon sand">
          <Check size={23} />
        </span>
        <div>
          <p>覚えた単語</p>
          <strong>
            {progress.remembered}
            <span>語</span>
          </strong>
        </div>
        <span className="stat-percent">{progress.percent}%</span>
      </div>
    </div>
  );
}
