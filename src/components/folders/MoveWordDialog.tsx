import { useId, useRef, useState } from 'react';
import type { Word } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { folderPath } from '../../services/folderService';
import { Dialog } from '../common/Dialog';
import { ErrorNotice } from '../common/ErrorNotice';

export function MoveWordDialog({
  word,
  onClose,
  onMoved,
}: {
  word: Word;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { data, isSaving, hasExternalChanges, moveWord } = useAppData();
  const [destination, setDestination] = useState(word.folderId || '');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const id = useId();
  const folders = data.folders
    .filter((folder) => folder.deckId === word.deckId)
    .map((folder) => ({
      id: folder.id,
      path: folderPath(data.folders, folder.id)
        .map((item) => item.name)
        .join(' / '),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ja'));
  async function submit() {
    if (pending.current || isSaving || hasExternalChanges) return;
    pending.current = true;
    setError(null);
    try {
      const result = await moveWord(word.deckId, word.id, destination || null);
      if (result.ok) onMoved();
      else setError(result.error.message);
    } catch {
      setError('移動できませんでした。再試行してください。');
    } finally {
      pending.current = false;
    }
  }
  return (
    <Dialog
      title="単語を移動"
      description={`「${word.question.slice(0, 70)}」の移動先を選んでください。学習状態は引き継ぎます。`}
      busy={isSaving}
      onClose={onClose}
    >
      <label className="field-label" htmlFor={id}>
        移動先フォルダー
      </label>
      <select
        id={id}
        className="text-input"
        value={destination}
        disabled={isSaving || hasExternalChanges}
        data-initial-focus
        onChange={(event) => setDestination(event.target.value)}
      >
        <option value="">単語帳の直下</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.path}
          </option>
        ))}
      </select>
      {error && <ErrorNotice message={error} />}
      {hasExternalChanges && (
        <ErrorNotice message="保存データが更新されています。閉じて再読み込みしてください。" />
      )}
      <div className="dialog-actions">
        <button className="button button-secondary" disabled={isSaving} onClick={onClose}>
          キャンセル
        </button>
        <button
          className="button button-primary"
          disabled={isSaving || hasExternalChanges || destination === (word.folderId || '')}
          onClick={() => void submit()}
        >
          {isSaving ? '移動中…' : '移動する'}
        </button>
      </div>
    </Dialog>
  );
}
