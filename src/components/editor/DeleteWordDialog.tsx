import { useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import type { Word } from '../../types/domain';
import type { Result } from '../../types/storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { useAppData } from '../../hooks/useAppData';

interface DeleteWordDialogProps {
  word: Word;
  busy: boolean;
  onClose: () => void;
  onDelete: () => Promise<Result<void>>;
  onDeleted: () => void;
}

export function DeleteWordDialog({
  word,
  busy,
  onClose,
  onDelete,
  onDeleted,
}: DeleteWordDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { hasExternalChanges } = useAppData();

  async function confirmDelete() {
    if (submitting.current || busy || hasExternalChanges) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await onDelete();
      if (result.ok) onDeleted();
      else setError(result.error.message);
    } catch {
      setError('削除できませんでした。もう一度お試しください。');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      danger
      title="この単語を削除しますか？"
      description="この操作は取り消せません。削除する問題を確認してください。"
      busy={busy}
      onClose={onClose}
    >
      <div className="delete-target">
        <span className="delete-icon">
          <Trash2 size={23} />
        </span>
        <div>
          <span className="delete-word-label">問題</span>
          <strong className="delete-word-question">{word.question}</strong>
        </div>
      </div>
      <p className="delete-description">問題・答え・補足と、この単語の学習状態を削除します。</p>
      {hasExternalChanges && (
        <p className="inline-error" role="alert">
          別のタブで保存データが変わりました。閉じてページを再読み込みし、削除対象を確認してください。
        </p>
      )}
      {error && <ErrorNotice message={error} />}
      <div className="dialog-actions">
        <button
          type="button"
          className="button button-secondary"
          data-initial-focus
          disabled={busy}
          onClick={onClose}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="button button-danger"
          disabled={busy || hasExternalChanges}
          onClick={() => void confirmDelete()}
        >
          {busy ? <LoaderCircle size={18} className="spin" /> : <Trash2 size={18} />}
          {busy ? '削除中…' : '削除する'}
        </button>
      </div>
    </Dialog>
  );
}
