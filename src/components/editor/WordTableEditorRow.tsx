import { useEffect, useId, useRef } from 'react';
import { Check, CornerDownRight, LoaderCircle, X } from 'lucide-react';
import type { Word, WordInput } from '../../types/domain';
import type { TableFieldFocus } from '../../hooks/useWordTableEditor';
import {
  MAX_QUESTION_LENGTH,
  MAX_ANSWER_LENGTH,
  MAX_NOTE_LENGTH,
} from '../../services/wordService';
import { StatusBadge } from '../common/StatusBadge';

const fields = [
  { key: 'question', label: '問題', max: MAX_QUESTION_LENGTH, required: true },
  { key: 'answer', label: '答え', max: MAX_ANSWER_LENGTH, required: true },
  { key: 'note', label: '補足説明', max: MAX_NOTE_LENGTH, required: false },
] as const;

interface WordTableEditorRowProps {
  word: Word | null;
  number: number;
  draft: WordInput;
  errors: Partial<Record<keyof WordInput, string>>;
  saveError: string | null;
  dirty: boolean;
  busy: boolean;
  blocked: boolean;
  fieldFocus: TableFieldFocus;
  onChange: (field: keyof WordInput, value: string) => void;
  onSaveNext: () => void;
  onCancel: () => void;
}

export function WordTableEditorRow({
  word,
  number,
  draft,
  errors,
  saveError,
  dirty,
  busy,
  blocked,
  fieldFocus,
  onChange,
  onSaveNext,
  onCancel,
}: WordTableEditorRowProps) {
  const id = useId();
  const refs = useRef<Partial<Record<keyof WordInput, HTMLTextAreaElement | null>>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const composing = useRef(false);
  useEffect(() => {
    if (fieldFocus.field === 'error') errorRef.current?.focus();
    else refs.current[fieldFocus.field]?.focus();
  }, [fieldFocus]);

  return (
    <>
      <tr
        className="word-table-edit-row"
        aria-label={word ? `単語${number}を編集中` : '新しい単語を入力中'}
      >
        <th scope="row" className="word-table-number">
          {word ? String(number).padStart(2, '0') : '新規'}
        </th>
        {fields.map(({ key, label, max, required }) => (
          <td key={key} className="word-table-field">
            <label htmlFor={`${id}-${key}`} className="word-table-field-label">
              {label}
              {required ? '（必須）' : '（任意）'}
            </label>
            <textarea
              ref={(element) => {
                refs.current[key] = element;
              }}
              id={`${id}-${key}`}
              className="text-input table-textarea"
              rows={3}
              value={draft[key]}
              readOnly={busy}
              required={required}
              aria-invalid={!!errors[key]}
              aria-describedby={`${id}-${key}-hint${errors[key] ? ` ${id}-${key}-error` : ''}`}
              onChange={(event) => onChange(key, event.target.value)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onKeyDown={(event) => {
                // 日本語変換のEnterと長押しは保存にしない。改行はShift+Enter。
                if (
                  event.key !== 'Enter' ||
                  event.shiftKey ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey ||
                  composing.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                )
                  return;
                event.preventDefault();
                if (!event.repeat) onSaveNext();
              }}
            />
            <span id={`${id}-${key}-hint`} className="table-field-hint">
              {draft[key].trim().length} / {max}文字
            </span>
            {errors[key] && (
              <p id={`${id}-${key}-error`} className="form-error" role="alert">
                {errors[key]}
              </p>
            )}
          </td>
        ))}
        <td className="word-table-status">
          <StatusBadge status={word?.status ?? 'unlearned'} />
        </td>
        <td className="word-table-edit-actions">
          <button type="submit" className="button button-primary" disabled={blocked}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
            {busy ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={blocked}
            onClick={onSaveNext}
          >
            <CornerDownRight size={15} />
            保存して次へ
          </button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={onCancel}>
            <X size={15} />
            キャンセル
          </button>
        </td>
      </tr>
      <tr className="word-table-edit-feedback">
        <td colSpan={6}>
          <p className="table-draft-indicator">
            {dirty
              ? '未保存の変更があります'
              : word
                ? '内容を編集できます'
                : '問題と答えを入力してください'}
            <span>学習状態はそのまま保持します。</span>
          </p>
          {saveError && (
            <p ref={errorRef} tabIndex={-1} className="inline-error" role="alert">
              {saveError}
            </p>
          )}
        </td>
      </tr>
    </>
  );
}
