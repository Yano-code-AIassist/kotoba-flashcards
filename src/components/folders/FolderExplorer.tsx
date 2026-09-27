import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { Deck, Folder } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { useNavigation } from '../../hooks/useNavigation';
import { canLeave, folderHref } from '../../services/navigation';
import {
  descendantFolderIds,
  folderPath,
  MAX_FOLDER_DEPTH,
  wordsInFolder,
} from '../../services/folderService';
import { FolderFormDialog } from './FolderFormDialog';
import { Dialog } from '../common/Dialog';
import { ErrorNotice } from '../common/ErrorNotice';
import { useAccount } from '../../providers/accountContext';
import { hasSessionDraft } from '../../services/sessionDrafts';

export function FolderExplorer({
  deck,
  folderId = null,
}: {
  deck: Deck;
  folderId?: string | null;
}) {
  const { user } = useAccount();
  const { data, isSaving, hasExternalChanges, deleteFolder } = useAppData();
  const { navigateWords } = useNavigation();
  const [form, setForm] = useState<{ folder?: Folder } | null>(null);
  const [remove, setRemove] = useState<Folder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const children = data.folders.filter(
    (folder) => folder.deckId === deck.id && folder.parentId === folderId,
  );
  const current = data.folders.find((folder) => folder.id === folderId);
  const path = folderPath(data.folders, folderId);
  const locationName = [deck.name, ...path.map((folder) => folder.name)].join(' / ');
  const blocked = isSaving || hasExternalChanges;
  const maxDepth = path.length >= MAX_FOLDER_DEPTH;
  useEffect(() => {
    if (form) return;
    let nextForm: { folder?: Folder } | null = null;
    if (hasSessionDraft(user.id, `folder-form:${deck.id}:new:${folderId ?? 'root'}`)) {
      nextForm = {};
    } else {
      const target = [current, ...children].find(
        (folder) => folder && hasSessionDraft(user.id, `folder-form:${deck.id}:${folder.id}`),
      );
      if (target) nextForm = { folder: target };
    }
    if (!nextForm) return;
    const timer = window.setTimeout(() => {
      setForm((value) => value ?? nextForm);
    });
    return () => window.clearTimeout(timer);
  }, [children, current, deck.id, folderId, form, user.id]);
  async function confirmDelete() {
    if (!remove || pending.current || blocked) return;
    if (remove.id === folderId && !canLeave()) return;
    pending.current = true;
    setError(null);
    try {
      const result = await deleteFolder(deck.id, remove.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRemove(null);
      setNotice('フォルダーと、その中の単語を削除しました。');
      if (remove.id === folderId) navigateWords(deck.id, remove.parentId);
    } catch {
      setError('削除できませんでした。もう一度お試しください。');
    } finally {
      pending.current = false;
    }
  }
  return (
    <section className="folder-explorer" aria-label="フォルダー一覧">
      <div className="folder-toolbar">
        <h2>
          {folderId ? '子フォルダー' : 'フォルダー'}
          <span className="count-badge">{children.length}</span>
        </h2>
        <div className="folder-actions">
          <button
            className="button button-secondary"
            disabled={blocked || maxDepth}
            onClick={() => setForm({})}
          >
            <FolderPlus size={18} />
            フォルダーを作成
          </button>
          {current && (
            <details className="folder-settings">
              <summary>フォルダー設定</summary>
              <div className="folder-settings-content">
                <p>
                  対象：<strong>{current.name}</strong>
                </p>
                <div className="folder-settings-buttons">
                  <button
                    className="button button-secondary"
                    aria-label="このフォルダーの名前を変更"
                    disabled={blocked}
                    onClick={() => setForm({ folder: current })}
                  >
                    <Pencil size={16} />
                    名前を変更
                  </button>
                  <button
                    className="button button-quiet-danger"
                    aria-label="このフォルダーを削除"
                    disabled={blocked}
                    onClick={() => {
                      setError(null);
                      setRemove(current);
                    }}
                  >
                    <Trash2 size={16} />
                    削除
                  </button>
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
      {maxDepth && (
        <p className="folder-hint">
          フォルダーは{MAX_FOLDER_DEPTH}階層までです。この場所には単語を追加できます。
        </p>
      )}
      {children.length ? (
        <ul className="folder-grid">
          {children.map((folder) => (
            <li key={folder.id} className="folder-card">
              <a href={folderHref(deck.id, folder.id)} className="folder-open">
                <span className="folder-icon">
                  <FolderIcon size={25} />
                </span>
                <span>
                  <strong>{folder.name}</strong>
                  <small>
                    {data.folders.filter((item) => item.parentId === folder.id).length}フォルダー ·{' '}
                    {wordsInFolder(data, deck.id, folder.id, true).length}語
                  </small>
                </span>
                <ChevronRight size={18} />
              </a>
              <div className="folder-card-actions">
                <button
                  className="icon-button"
                  aria-label={`${folder.name}の名前を変更`}
                  title="名前を変更"
                  disabled={blocked}
                  onClick={() => setForm({ folder })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button danger-hover"
                  aria-label={`${folder.name}を削除`}
                  title="削除"
                  disabled={blocked}
                  onClick={() => {
                    setError(null);
                    setRemove(folder);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="folder-empty">
          {folderId ? '子フォルダーはありません。' : 'フォルダーはありません。'}
        </p>
      )}
      {notice && (
        <p className="folder-hint" role="status">
          {notice}
        </p>
      )}
      {form && (
        <FolderFormDialog
          deckId={deck.id}
          parentId={folderId}
          folder={form.folder}
          locationName={
            form.folder
              ? [
                  deck.name,
                  ...folderPath(data.folders, form.folder.parentId).map((item) => item.name),
                ].join(' / ')
              : locationName
          }
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setNotice(form.folder ? 'フォルダー名を変更しました。' : 'フォルダーを作成しました。');
          }}
        />
      )}
      {remove && (
        <Dialog
          title="フォルダーを削除しますか？"
          description="下の階層と単語も削除します。この操作は取り消せません。"
          danger
          busy={isSaving}
          onClose={() => setRemove(null)}
        >
          <div className="delete-target">
            <FolderIcon size={25} />
            <div>
              <strong>{remove.name}</strong>
              <p>
                このフォルダー以下：{descendantFolderIds(data.folders, remove.id).size}フォルダー・
                {wordsInFolder(data, deck.id, remove.id, true).length}語
              </p>
            </div>
          </div>
          <p className="delete-description">
            必要な単語は、削除する前に別のフォルダーへ移動してください。
          </p>
          {error && <ErrorNotice message={error} />}
          {hasExternalChanges && (
            <ErrorNotice message="保存データが更新されています。閉じて再読み込みしてください。" />
          )}
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              disabled={isSaving}
              data-initial-focus
              onClick={() => setRemove(null)}
            >
              キャンセル
            </button>
            <button
              className="button button-danger"
              disabled={blocked}
              onClick={() => void confirmDelete()}
            >
              フォルダーと単語を削除
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
