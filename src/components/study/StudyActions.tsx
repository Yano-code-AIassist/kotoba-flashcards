import { Check, LoaderCircle, RotateCcw } from 'lucide-react';
import type { StudyRating } from '../../types/domain';

export function StudyActions({
  revealed,
  busy,
  blocked,
  onRate,
}: {
  revealed: boolean;
  busy: boolean;
  blocked: boolean;
  onRate: (rating: StudyRating) => void;
}) {
  return (
    <div className="study-actions">
      <div className="study-actions-inner">
        <p id="study-actions-hint">
          {busy
            ? '回答を保存しています…'
            : blocked
              ? '保存データの更新を確認してください'
              : revealed
                ? '自分の理解度を記録しましょう'
                : 'カードをタップして、答えを確認しましょう'}
        </p>
        <div className="study-rating-buttons" aria-describedby="study-actions-hint">
          <button
            type="button"
            className="study-rating learning-rating"
            disabled={!revealed || busy || blocked}
            onClick={() => onRate('learning')}
          >
            {busy ? <LoaderCircle className="spin" size={22} /> : <RotateCcw size={22} />}まだ
          </button>
          <button
            type="button"
            className="study-rating remembered-rating"
            disabled={!revealed || busy || blocked}
            onClick={() => onRate('remembered')}
          >
            {busy ? <LoaderCircle className="spin" size={22} /> : <Check size={24} />}覚えた
          </button>
        </div>
      </div>
    </div>
  );
}
