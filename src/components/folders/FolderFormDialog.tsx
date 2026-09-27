import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog } from '../common/Dialog';
import { ErrorNotice } from '../common/ErrorNotice';
import { useAppData } from '../../hooks/useAppData';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { MAX_FOLDER_NAME_LENGTH } from '../../services/folderService';
import type { Folder } from '../../types/domain';
import { useAccount } from '../../providers/accountContext';
import {
  clearSessionDraft,
  readSessionDraft,
  saveSessionDraft,
} from '../../services/sessionDrafts';

export function FolderFormDialog({
  deckId,
  parentId,
  folder,
  locationName,
  onClose,
  onSaved,
}: {
  deckId: string;
  parentId: string | null;
  folder?: Folder;
  locationName: string;
  onClose: () => void;
  onSaved: (folder: Folder) => void;
}) {
  const { user } = useAccount();
  const { createFolder, renameFolder, isSaving, hasExternalChanges } = useAppData();
  const initialName = folder?.name || '';
  const draftScope = `folder-form:${deckId}:${folder?.id ?? `new:${parentId ?? 'root'}`}`;
  const [savedDraft] = useState(() =>
    readSessionDraft(
      user.id,
      draftScope,
      (value): value is { initial: string; name: string } =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).initial === 'string' &&
        typeof (value as Record<string, unknown>).name === 'string' &&
        ((value as Record<string, unknown>).name as string).length <= MAX_FOLDER_NAME_LENGTH,
    ),
  );
  const canRestore = savedDraft?.initial === initialName;
  const [name, setName] = useState(canRestore ? savedDraft!.name : initialName);
  const [restored, setRestored] = useState(canRestore && savedDraft!.name !== initialName);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const dirty = name !== initialName;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));
  const blocked = isSaving || hasExternalChanges;
  useEffect(() => {
    if (dirty) saveSessionDraft(user.id, draftScope, { initial: initialName, name });
    else clearSessionDraft(user.id, draftScope);
  }, [dirty, draftScope, initialName, name, user.id]);
  function close() {
    if (pending.current || isSaving) return;
    if (dirty && !window.confirm('フォルダー名の変更を破棄して閉じますか？')) return;
    clearSessionDraft(user.id, draftScope);
    markSaved();
    setRestored(false);
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || blocked) return;
    pending.current = true;
    setError(null);
    try {
      const result = folder
        ? await renameFolder(deckId, folder.id, name)
        : await createFolder(deckId, parentId, name);
      if (result.ok) {
        clearSessionDraft(user.id, draftScope);
        markSaved();
        setRestored(false);
        onSaved(result.value);
      } else {
        setError(result.error.message);
        inputRef.current?.focus();
      }
    } catch {
      setError('保存できませんでした。もう一度お試しください。');
    } finally {
      pending.current = false;
    }
  }
  return (
    <Dialog
      title={folder ? 'フォルダー名を変更' : '新しいフォルダーを作成'}
      description={`作成場所：${locationName}`}
      busy={isSaving}
      onClose={close}
    >
      <form onSubmit={submit} noValidate>
        {restored && (
          <p className="draft-recovery-notice" role="status">
            ログイン前に入力していたフォルダー名を復元しました。
          </p>
        )}
        <label className="field-label" htmlFor={id}>
          フォルダー名
        </label>
        <input
          id={id}
          ref={inputRef}
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_FOLDER_NAME_LENGTH}
          placeholder="例：テクノロジ系、基礎理論"
          readOnly={blocked}
          data-initial-focus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
              event.preventDefault();
          }}
        />
        <p className="input-hint">フォルダーの中に、さらにフォルダーや単語を作れます。</p>
        {error && <ErrorNotice message={error} />}
        {hasExternalChanges && (
          <ErrorNotice message="保存データが更新されています。入力を控えてから再読み込みしてください。" />
        )}
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={isSaving}
            onClick={close}
          >
            キャンセル
          </button>
          <button className="button button-primary" disabled={blocked} type="submit">
            {isSaving ? '保存中…' : folder ? '変更を保存' : 'フォルダーを作成'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
