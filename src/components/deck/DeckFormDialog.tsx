import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { BookOpen, LoaderCircle, Plus, Check } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import type { Deck } from '../../types/domain';
import type { Result } from '../../types/storage';
import { MAX_DECK_NAME_LENGTH } from '../../services/deckService';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAppData } from '../../hooks/useAppData';
import { useAccount } from '../../providers/accountContext';
import {
  clearSessionDraft,
  readSessionDraft,
  saveSessionDraft,
} from '../../services/sessionDrafts';

interface DeckFormDialogProps {
  deck?: Deck;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<Result<Deck>>;
  onSaved: (deck: Deck) => void;
}

export function DeckFormDialog({ deck, busy, onClose, onSave, onSaved }: DeckFormDialogProps) {
  const { user } = useAccount();
  const initialName = deck?.name ?? '';
  const draftScope = `deck-form:${deck?.id ?? 'new'}`;
  const [savedDraft] = useState(() =>
    readSessionDraft(
      user.id,
      draftScope,
      (value): value is { initial: string; name: string } =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).initial === 'string' &&
        typeof (value as Record<string, unknown>).name === 'string' &&
        ((value as Record<string, unknown>).name as string).length <= MAX_DECK_NAME_LENGTH,
    ),
  );
  const canRestore = savedDraft?.initial === initialName;
  const [name, setName] = useState(canRestore ? savedDraft.name : initialName);
  const [restored, setRestored] = useState(canRestore && savedDraft.name !== initialName);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const { hasExternalChanges } = useAppData();
  const blocked = busy || hasExternalChanges;
  const dirty = name !== initialName;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));

  useEffect(() => {
    if (dirty) saveSessionDraft(user.id, draftScope, { initial: initialName, name });
    else clearSessionDraft(user.id, draftScope);
  }, [dirty, draftScope, initialName, name, user.id]);

  function close() {
    if (submitting.current || busy) return;
    if (dirty && !window.confirm('単語帳の名前は保存されていません。入力を破棄して閉じますか？'))
      return;
    clearSessionDraft(user.id, draftScope);
    markSaved();
    setRestored(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || blocked) return;
    if (!name.trim()) {
      setError('単語帳の名前を入力してください。');
      inputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setError(null);
    try {
      const result = await onSave(name);
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
      setError('保存できませんでした。入力内容を確認して、もう一度お試しください。');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      title={deck ? '単語帳の名前を変更' : '新しい単語帳をつくる'}
      description={
        deck ? '自分にとって、見つけやすい名前に。' : '学びたいテーマに、名前をつけましょう。'
      }
      busy={busy}
      onClose={close}
    >
      <div className="dialog-book">
        <BookOpen size={27} />
      </div>
      <form onSubmit={handleSubmit} noValidate>
        {restored && (
          <p className="draft-recovery-notice" role="status">
            ログイン前に入力していた単語帳名を復元しました。
          </p>
        )}
        <label htmlFor={inputId} className="field-label">
          単語帳の名前 <span>必須</span>
        </label>
        <input
          ref={inputRef}
          id={inputId}
          data-initial-focus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          placeholder="例：基本情報技術者、英単語"
          maxLength={MAX_DECK_NAME_LENGTH}
          autoComplete="off"
          readOnly={blocked}
          aria-invalid={!!error}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
          className="text-input"
          onKeyDown={(event) => {
            // 日本語の変換を確定するEnterで、意図せず保存しないようにする。
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
              event.preventDefault();
          }}
        />
        <div id={hintId} className="input-hint">
          <span>あとから名前を変更できます。</span>
          <span>
            {name.length} / {MAX_DECK_NAME_LENGTH}
          </span>
        </div>
        {error && (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        )}
        {hasExternalChanges && (
          <p className="inline-error" role="alert">
            別のタブで保存データが変わりました。名前を控えてから閉じ、ページを再読み込みしてください。
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={close} disabled={busy}>
            キャンセル
          </button>
          <button type="submit" className="button button-primary" disabled={blocked}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : deck ? (
              <Check size={18} />
            ) : (
              <Plus size={18} />
            )}
            {busy ? '保存中…' : deck ? '変更を保存' : '単語帳を作成'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
