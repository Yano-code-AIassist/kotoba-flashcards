import { useRef, useState } from 'react';
import { Trash2, LoaderCircle } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import type { Deck } from '../../types/domain';
import type { Result } from '../../types/storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { useAppData } from '../../hooks/useAppData';

interface DeleteDeckDialogProps {
  deck: Deck;
  wordCount: number;
  busy: boolean;
  onClose: () => void;
  onDelete: () => Promise<Result<void>>;
  onDeleted: () => void;
}

export function DeleteDeckDialog({
  deck,
  wordCount,
  busy,
  onClose,
  onDelete,
  onDeleted,
}: DeleteDeckDialogProps) {
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
      title="単語帳を削除しますか？"
      description="この操作は取り消せません。内容を確認してください。"
      busy={busy}
      onClose={onClose}
    >
      <div className="delete-target">
        <span className="delete-icon">
          <Trash2 size={23} />
        </span>
        <div>
          <strong>{deck.name}</strong>
          <p>登録されている単語：{wordCount}語</p>
        </div>
      </div>
      <p className="delete-description">
        単語帳と、その中の全フォルダー・単語・学習状態を削除します。
      </p>
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
