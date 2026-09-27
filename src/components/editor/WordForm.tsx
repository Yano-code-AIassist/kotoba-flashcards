import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import type { Word, WordInput } from '../../types/domain';
import type { Result } from '../../types/storage';
import {
  getWordInputErrors,
  MAX_ANSWER_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUESTION_LENGTH,
} from '../../services/wordService';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { DeleteWordDialog } from './DeleteWordDialog';
import { ErrorNotice } from '../common/ErrorNotice';
import { useAccount } from '../../providers/accountContext';
import {
  clearSessionDraft,
  readSessionDraft,
  saveSessionDraft,
} from '../../services/sessionDrafts';

interface WordFormProps {
  word?: Word;
  busy: boolean;
  conflicted: boolean;
  onSave: (input: WordInput) => Promise<Result<Word>>;
  onSaved: (word: Word) => void;
  onCancel: () => void;
  onDelete: () => Promise<Result<void>>;
  onDeleted: () => void;
  draftScope: string;
}

interface StoredWordFormDraft {
  initial: WordInput;
  draft: WordInput;
}

function isWordInputDraft(value: unknown): value is WordInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.question === 'string' &&
    input.question.length <= MAX_QUESTION_LENGTH &&
    typeof input.answer === 'string' &&
    input.answer.length <= MAX_ANSWER_LENGTH &&
    typeof input.note === 'string' &&
    input.note.length <= MAX_NOTE_LENGTH
  );
}

function isStoredWordFormDraft(value: unknown): value is StoredWordFormDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    isWordInputDraft((value as Record<string, unknown>).initial) &&
    isWordInputDraft((value as Record<string, unknown>).draft)
  );
}

function sameInput(left: WordInput, right: WordInput): boolean {
  return (
    left.question === right.question && left.answer === right.answer && left.note === right.note
  );
}

export function WordForm({
  word,
  busy,
  conflicted,
  onSave,
  onSaved,
  onCancel,
  onDelete,
  onDeleted,
  draftScope,
}: WordFormProps) {
  const { user } = useAccount();
  const [initial] = useState<WordInput>(() => ({
    question: word?.question ?? '',
    answer: word?.answer ?? '',
    note: word?.note ?? '',
  }));
  const [savedDraft] = useState(() => readSessionDraft(user.id, draftScope, isStoredWordFormDraft));
  const canRestore = savedDraft !== null && sameInput(savedDraft.initial, initial);
  const [draft, setDraft] = useState<WordInput>(() => (canRestore ? savedDraft.draft : initial));
  const [restored, setRestored] = useState(canRestore && !sameInput(savedDraft!.draft, initial));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof WordInput, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submitting = useRef(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const dirty =
    draft.question !== initial.question ||
    draft.answer !== initial.answer ||
    draft.note !== initial.note;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));
  const blocked = busy || conflicted;

  useEffect(() => {
    if (dirty) saveSessionDraft(user.id, draftScope, { initial, draft });
    else clearSessionDraft(user.id, draftScope);
  }, [draft, draftScope, dirty, initial, user.id]);

  function updateField(field: keyof WordInput, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || blocked) return;
    const errors = getWordInputErrors(draft);
    setFieldErrors(errors);
    setSaveError(null);
    if (Object.keys(errors).length > 0) {
      // 検証はサービス層と共通にし、最初に修正が必要な欄へ戻す。
      const firstInvalid = errors.question ? questionRef : errors.answer ? answerRef : noteRef;
      firstInvalid.current?.focus();
      return;
    }
    submitting.current = true;
    try {
      const result = await onSave(draft);
      if (result.ok) {
        // 成功時だけ離脱確認を解除する。失敗時は入力内容をそのまま残す。
        clearSessionDraft(user.id, draftScope);
        markSaved();
        setRestored(false);
        onSaved(result.value);
      } else {
        setSaveError(result.error.message);
      }
    } catch {
      setSaveError('保存できませんでした。入力内容は残っています。もう一度お試しください。');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <>
      <form className="word-form" onSubmit={handleSubmit} noValidate>
        {restored && (
          <p className="draft-recovery-notice" role="status">
            ログイン前に入力していた内容を復元しました。内容を確認して保存してください。
          </p>
        )}
        <div className="word-form-panel">
          <div className="word-form-intro">
            <span className="form-step">01</span>
            <div>
              <h2>問題と答え</h2>
              <p>あとから見返したときに、思い出せる言葉で。</p>
            </div>
            <span className="required-legend">必須項目</span>
          </div>
          <div className="word-form-grid">
            <div className="word-form-field">
              <label className="field-label" htmlFor={`${id}-question`}>
                問題 <span>必須</span>
              </label>
              <textarea
                ref={questionRef}
                id={`${id}-question`}
                className="text-input word-textarea"
                rows={4}
                value={draft.question}
                readOnly={blocked}
                placeholder="例：RFPとは？"
                onChange={(event) => updateField('question', event.target.value)}
                aria-invalid={!!fieldErrors.question}
                aria-describedby={`${id}-question-hint${fieldErrors.question ? ` ${id}-question-error` : ''}`}
              />
              <div id={`${id}-question-hint`} className="input-hint">
                <span>思い出したい用語や問いを入力。</span>
                <span>
                  {draft.question.trim().length} / {MAX_QUESTION_LENGTH}
                </span>
              </div>
              {fieldErrors.question && (
                <p id={`${id}-question-error`} className="form-error" role="alert">
                  {fieldErrors.question}
                </p>
              )}
            </div>
            <div className="word-form-field">
              <label className="field-label" htmlFor={`${id}-answer`}>
                答え <span>必須</span>
              </label>
              <textarea
                ref={answerRef}
                id={`${id}-answer`}
                className="text-input word-textarea"
                rows={4}
                value={draft.answer}
                readOnly={blocked}
                placeholder="例：Request for Proposal（提案依頼書）"
                onChange={(event) => updateField('answer', event.target.value)}
                aria-invalid={!!fieldErrors.answer}
                aria-describedby={`${id}-answer-hint${fieldErrors.answer ? ` ${id}-answer-error` : ''}`}
              />
              <div id={`${id}-answer-hint`} className="input-hint">
                <span>改行を使って整理できます。</span>
                <span>
                  {draft.answer.trim().length} / {MAX_ANSWER_LENGTH}
                </span>
              </div>
              {fieldErrors.answer && (
                <p id={`${id}-answer-error`} className="form-error" role="alert">
                  {fieldErrors.answer}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="word-form-panel">
          <div className="word-form-intro">
            <span className="form-step">02</span>
            <div>
              <h2>理解を深めるメモ</h2>
              <p>具体例や、自分なりの覚え方を添えましょう。</p>
            </div>
          </div>
          <label className="field-label" htmlFor={`${id}-note`}>
            補足説明 <span>任意</span>
          </label>
          <textarea
            ref={noteRef}
            id={`${id}-note`}
            className="text-input word-textarea note-textarea"
            rows={3}
            value={draft.note}
            readOnly={blocked}
            placeholder="例：発注先に、システムの提案を依頼するための文書。"
            onChange={(event) => updateField('note', event.target.value)}
            aria-invalid={!!fieldErrors.note}
            aria-describedby={`${id}-note-hint${fieldErrors.note ? ` ${id}-note-error` : ''}`}
          />
          <div id={`${id}-note-hint`} className="input-hint">
            <span>空欄のままでも保存できます。</span>
            <span>
              {draft.note.trim().length} / {MAX_NOTE_LENGTH}
            </span>
          </div>
          {fieldErrors.note && (
            <p id={`${id}-note-error`} className="form-error" role="alert">
              {fieldErrors.note}
            </p>
          )}
        </div>
        <p className="word-form-note">
          文字数は前後の空白を除いて数えます。文中の改行はそのまま保存します。
        </p>
        {saveError && <ErrorNotice message={saveError} />}
        {word && (
          <div className="word-delete-row">
            <span>この単語を単語帳から取り除く</span>
            <button
              type="button"
              className="button button-quiet-danger"
              disabled={blocked}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
              この単語を削除
            </button>
          </div>
        )}
        <div className="word-form-actions">
          <span className="draft-indicator">
            {dirty
              ? '未保存の変更があります'
              : word
                ? '内容を編集できます'
                : '問題と答えを入力してください'}
          </span>
          <div>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                if (dirty && !window.confirm('入力中の変更を破棄して戻りますか？')) return;
                clearSessionDraft(user.id, draftScope);
                markSaved();
                setRestored(false);
                onCancel();
              }}
            >
              キャンセル
            </button>
            <button type="submit" className="button button-primary" disabled={blocked}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : word ? (
                <Check size={18} />
              ) : (
                <Plus size={18} />
              )}
              {busy ? '保存中…' : word ? '変更を保存' : '単語を保存'}
            </button>
          </div>
        </div>
      </form>
      {deleteOpen && word && (
        <DeleteWordDialog
          word={word}
          busy={busy}
          onClose={() => setDeleteOpen(false)}
          onDelete={onDelete}
          onDeleted={() => {
            clearSessionDraft(user.id, draftScope);
            markSaved();
            setRestored(false);
            onDeleted();
          }}
        />
      )}
    </>
  );
}
