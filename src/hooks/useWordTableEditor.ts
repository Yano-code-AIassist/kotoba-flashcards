import { useEffect, useRef, useState } from 'react';
import type { Word, WordInput } from '../types/domain';
import { getWordInputErrors } from '../services/wordService';
import { useAppData } from './useAppData';
import { useUnsavedChanges } from './useUnsavedChanges';
import { useAccount } from '../providers/accountContext';
import { clearSessionDraft, readSessionDraft, saveSessionDraft } from '../services/sessionDrafts';
import { MAX_ANSWER_LENGTH, MAX_NOTE_LENGTH, MAX_QUESTION_LENGTH } from '../services/wordService';

interface EditingRow {
  word: Word | null;
  initial: WordInput;
  draft: WordInput;
  key: number;
}
interface StoredTableDraft {
  wordId: string | null;
  initial: WordInput;
  draft: WordInput;
}
type FieldErrors = Partial<Record<keyof WordInput, string>>;
export interface TableFieldFocus {
  field: keyof WordInput | 'error';
  sequence: number;
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

function isStoredTableDraft(value: unknown): value is StoredTableDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.wordId === null || typeof draft.wordId === 'string') &&
    isWordInputDraft(draft.initial) &&
    isWordInputDraft(draft.draft)
  );
}

function wordInput(word: Word | null): WordInput {
  return {
    question: word?.question ?? '',
    answer: word?.answer ?? '',
    note: word?.note ?? '',
  };
}

function sameInput(left: WordInput, right: WordInput): boolean {
  return (
    left.question === right.question && left.answer === right.answer && left.note === right.note
  );
}

export function useWordTableEditor(
  deckId: string,
  words: Word[],
  onNotice: (message: string) => void,
  folderId: string | null = null,
) {
  const { user } = useAccount();
  const { data, createWord, updateWord, isSaving, hasExternalChanges } = useAppData();
  const draftScope = `word-table:${deckId}:${folderId ?? 'root'}`;
  const [savedDraft] = useState(() => readSessionDraft(user.id, draftScope, isStoredTableDraft));
  const restoredWord = savedDraft?.wordId
    ? (words.find((word) => word.id === savedDraft.wordId) ?? null)
    : null;
  const canRestore =
    savedDraft !== null &&
    (savedDraft.wordId === null || restoredWord !== null) &&
    sameInput(savedDraft.initial, wordInput(restoredWord));
  const [editing, setEditing] = useState<EditingRow | null>(() =>
    canRestore
      ? {
          word: restoredWord,
          initial: savedDraft!.initial,
          draft: savedDraft!.draft,
          key: 1,
        }
      : null,
  );
  const [restored, setRestored] = useState(canRestore);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldFocus, setFieldFocus] = useState<TableFieldFocus>({ field: 'question', sequence: 0 });
  const [returnFocus, setReturnFocus] = useState<{
    wordId: string | null;
    sequence: number;
  } | null>(null);
  const pending = useRef(false);
  const nextKey = useRef(canRestore ? 1 : 0);
  const dirty =
    editing !== null &&
    (editing.draft.question !== editing.initial.question ||
      editing.draft.answer !== editing.initial.answer ||
      editing.draft.note !== editing.initial.note);
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));
  const blocked = isSaving || hasExternalChanges;

  useEffect(() => {
    if (dirty && editing)
      saveSessionDraft(user.id, draftScope, {
        wordId: editing.word?.id ?? null,
        initial: editing.initial,
        draft: editing.draft,
      });
    else clearSessionDraft(user.id, draftScope);
  }, [draftScope, dirty, editing, user.id]);

  function focusField(field: TableFieldFocus['field']) {
    setFieldFocus((previous) => ({ field, sequence: previous.sequence + 1 }));
  }

  function openRow(word: Word | null) {
    const draft = wordInput(word);
    setEditing({ word, initial: draft, draft, key: ++nextKey.current });
    setRestored(false);
    setErrors({});
    setSaveError(null);
    focusField('question');
  }

  function allowDiscard() {
    if (pending.current || isSaving) return false;
    if (dirty && !window.confirm('入力中の変更は保存されていません。変更を破棄しますか？'))
      return false;
    clearSessionDraft(user.id, draftScope);
    markSaved();
    setRestored(false);
    return true;
  }

  function start(word: Word | null) {
    if (blocked) return;
    if (editing && editing.word?.id === word?.id) {
      focusField('question');
      return;
    }
    if (allowDiscard()) openRow(word);
  }

  function close(wordId: string | null) {
    setEditing(null);
    setErrors({});
    setSaveError(null);
    setReturnFocus((previous) => ({ wordId, sequence: (previous?.sequence ?? 0) + 1 }));
  }

  function cancel() {
    if (allowDiscard()) close(editing?.word?.id ?? null);
  }

  function updateField(field: keyof WordInput, value: string) {
    if (pending.current || isSaving) return;
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, [field]: value } } : null,
    );
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
  }

  async function save(continueEditing: boolean) {
    if (!editing || pending.current || blocked) return;
    const nextErrors = getWordInputErrors(editing.draft);
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusField(nextErrors.question ? 'question' : nextErrors.answer ? 'answer' : 'note');
      return;
    }
    pending.current = true;
    try {
      const original = editing.word;
      const result = original
        ? await updateWord(deckId, original.id, editing.draft)
        : await createWord(deckId, editing.draft, folderId);
      if (!result.ok) {
        setSaveError(result.error.message);
        focusField('error');
        return;
      }
      // 保存成功後だけ次の行に進む。失敗時は同じ行と入力内容を維持する。
      clearSessionDraft(user.id, draftScope);
      markSaved();
      setRestored(false);
      const ended =
        original &&
        (data.activeSession?.wordIds.includes(original.id) ||
          data.activeSession?.scopeWordIds?.includes(original.id)) &&
        (original.question !== result.value.question ||
          original.answer !== result.value.answer ||
          original.note !== result.value.note);
      onNotice(
        ended
          ? '単語を変更しました。前の学習は終了しました。単語帳から新しく学習できます。'
          : original
            ? '単語を変更しました。'
            : '単語を追加しました。',
      );
      if (continueEditing) {
        // 末尾の次は空の追加行。keyも更新し、入力欄とIMEの一時状態を新しくする。
        const index = original ? words.findIndex((word) => word.id === original.id) : -1;
        openRow(original && index >= 0 ? (words[index + 1] ?? null) : null);
      } else {
        close(result.value.id);
      }
    } catch {
      setSaveError('保存できませんでした。入力内容は残っています。もう一度お試しください。');
      focusField('error');
    } finally {
      pending.current = false;
    }
  }

  return {
    editing,
    dirty,
    restored,
    errors,
    saveError,
    fieldFocus,
    returnFocus,
    blocked,
    isSaving,
    start,
    cancel,
    updateField,
    save,
  };
}
