import { useEffect, useId, useRef, useState } from 'react';
import { Check, Eye, LoaderCircle } from 'lucide-react';
import type { Deck, Word } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { decodeCsv } from '../../services/csvService';
import { MAX_IMPORT_FILE_BYTES } from '../../services/importLimits';
import { previewWordImport } from '../../services/wordImportService';
import type { ImportFormat, ImportOutcome, ImportPreview } from '../../services/wordImportService';
import { Dialog } from '../common/Dialog';
import { ImportPreviewTable } from './ImportPreviewTable';
import { folderPath } from '../../services/folderService';
import { useAccount } from '../../providers/accountContext';
import {
  clearSessionDraft,
  readSessionDraft,
  saveSessionDraft,
} from '../../services/sessionDrafts';

interface WordImportDialogProps {
  deck: Deck;
  folderId?: string | null;
  words: Word[];
  format: ImportFormat;
  onClose: () => void;
  onImported: (outcome: ImportOutcome) => void;
}
interface StoredImportDraft {
  text: string;
  fileName: string | null;
  encoding: 'utf-8' | 'shift_jis';
  hasHeader: boolean;
  skipDuplicates: boolean;
  hadPreview: boolean;
}

function isStoredImportDraft(value: unknown): value is StoredImportDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.text === 'string' &&
    draft.text.length <= MAX_IMPORT_FILE_BYTES &&
    (draft.fileName === null || typeof draft.fileName === 'string') &&
    (draft.encoding === 'utf-8' || draft.encoding === 'shift_jis') &&
    typeof draft.hasHeader === 'boolean' &&
    typeof draft.skipDuplicates === 'boolean' &&
    typeof draft.hadPreview === 'boolean'
  );
}

export function WordImportDialog({
  deck,
  folderId = null,
  words,
  format,
  onClose,
  onImported,
}: WordImportDialogProps) {
  const { user } = useAccount();
  const { data, isSaving, hasExternalChanges, importWords } = useAppData();
  const draftScope = `word-import:${format}:${deck.id}:${folderId ?? 'root'}`;
  const [savedDraft] = useState(() => readSessionDraft(user.id, draftScope, isStoredImportDraft));
  const [text, setText] = useState(savedDraft?.text ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(savedDraft?.fileName ?? null);
  const [encoding, setEncoding] = useState<'utf-8' | 'shift_jis'>(savedDraft?.encoding ?? 'utf-8');
  const [hasHeader, setHasHeader] = useState(savedDraft?.hasHeader ?? true);
  const [skipDuplicates, setSkipDuplicates] = useState(savedDraft?.skipDuplicates ?? true);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{
    value: ImportPreview;
    revision: number;
    key: number;
  } | null>(() =>
    savedDraft?.hadPreview && savedDraft.text.trim()
      ? {
          value: previewWordImport(savedDraft.text, format, savedDraft.hasHeader, words),
          revision: data.revision,
          key: 1,
        }
      : null,
  );
  const [restored, setRestored] = useState(savedDraft !== null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const requestId = useRef(0);
  const previewId = useRef(preview ? 1 : 0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const dirty = text.length > 0 || file !== null || fileName !== null;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));
  const busy = reading || isSaving;
  const blocked = busy || hasExternalChanges;
  const invalidCount = preview?.value.rows.filter((row) => row.errors.length).length ?? 0;
  const duplicateCount = preview?.value.rows.filter((row) => row.duplicate).length ?? 0;
  const addCount =
    (preview?.value.rows.length ?? 0) - invalidCount - (skipDuplicates ? duplicateCount : 0);
  const outdated = preview !== null && preview.revision !== data.revision;
  const canImport =
    preview !== null &&
    !outdated &&
    !preview.value.errors.length &&
    invalidCount === 0 &&
    addCount > 0 &&
    !blocked;

  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (preview) summaryRef.current?.focus();
  }, [preview]);
  useEffect(() => {
    if (dirty)
      saveSessionDraft(user.id, draftScope, {
        text,
        fileName,
        encoding,
        hasHeader,
        skipDuplicates,
        hadPreview: preview !== null,
      });
    else clearSessionDraft(user.id, draftScope);
  }, [dirty, draftScope, encoding, fileName, hasHeader, preview, skipDuplicates, text, user.id]);

  function close() {
    if (busy || pending.current) return;
    if (dirty && !window.confirm('取り込み内容は登録されていません。破棄して閉じますか？')) return;
    clearSessionDraft(user.id, draftScope);
    markSaved();
    setRestored(false);
    onClose();
  }

  async function readFile(selected: File, charset: 'utf-8' | 'shift_jis') {
    const request = ++requestId.current;
    setFile(selected);
    setFileName(selected.name);
    setPreview(null);
    setError(null);
    setText('');
    setReading(false);
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      setFile(null);
      setFileName(null);
      setError('CSVファイルは2MB以下に分けてください。');
      return;
    }
    setReading(true);
    try {
      const bytes = await selected.arrayBuffer();
      if (request !== requestId.current) return;
      const result = decodeCsv(bytes, charset);
      if (result.ok) setText(result.value);
      else setError(result.error.message);
    } catch {
      if (request === requestId.current)
        setError('ファイルを読み込めませんでした。もう一度選択してください。');
    } finally {
      if (request === requestId.current) setReading(false);
    }
  }

  function showPreview() {
    if (blocked) return;
    setError(null);
    setPreview({
      value: previewWordImport(text, format, hasHeader, words),
      revision: data.revision,
      key: ++previewId.current,
    });
  }

  async function submit() {
    if (!canImport || pending.current || !preview) return;
    pending.current = true;
    setError(null);
    try {
      const result = await importWords(
        deck.id,
        preview.value.rows.map((row) => row.input),
        skipDuplicates,
        preview.revision,
        folderId,
      );
      if (!result.ok) setError(result.error.message);
      else {
        clearSessionDraft(user.id, draftScope);
        markSaved();
        setRestored(false);
        onImported(result.value);
      }
    } finally {
      pending.current = false;
    }
  }

  return (
    <Dialog
      wide
      title={format === 'paste' ? '単語を一括登録' : 'CSVから単語を取り込む'}
      description={`追加先：${[deck.name, ...folderPath(data.folders, folderId).map((folder) => folder.name)].join(' / ')}。問題・答え・補足を、新しい未学習の単語として追加します。既存の単語は上書きしません。`}
      busy={busy}
      onClose={close}
    >
      <div className="word-import-form">
        {restored && (
          <p className="draft-recovery-notice" role="status">
            {format === 'csv' && fileName
              ? `「${fileName}」から読み取った内容を復元しました。元のファイル本体は保存していません。`
              : 'ログイン前に入力していた一括登録内容を復元しました。'}
          </p>
        )}
        {format === 'paste' ? (
          <>
            <label className="field-label" htmlFor={`${id}-paste`}>
              登録する単語
            </label>
            <p className="import-help" id={`${id}-paste-hint`}>
              1行に「問題 | 答え |
              補足説明」。補足は省略できます。1回500語まで。項目内に「|」や改行を含める場合はCSVを使ってください。
            </p>
            <textarea
              data-initial-focus
              id={`${id}-paste`}
              className="text-input import-paste"
              rows={7}
              value={text}
              readOnly={blocked}
              aria-describedby={`${id}-paste-hint`}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
                setError(null);
              }}
              placeholder={
                'RFP | Request for Proposal | 提案依頼書\nRFI | Request for Information | 情報提供依頼書'
              }
            />
          </>
        ) : (
          <>
            <div className="import-file-fields">
              <div>
                <label className="field-label" htmlFor={`${id}-file`}>
                  CSVファイル（2MB以下・500語まで）
                </label>
                <input
                  data-initial-focus
                  id={`${id}-file`}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={blocked}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    event.target.value = '';
                    if (selected) void readFile(selected, encoding);
                  }}
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-encoding`}>
                  文字コード
                </label>
                <select
                  id={`${id}-encoding`}
                  value={encoding}
                  disabled={blocked}
                  onChange={(event) => {
                    const charset = event.target.value as 'utf-8' | 'shift_jis';
                    setEncoding(charset);
                    setPreview(null);
                    if (file) void readFile(file, charset);
                  }}
                >
                  <option value="utf-8">UTF-8（標準）</option>
                  <option value="shift_jis">Shift_JIS</option>
                </select>
              </div>
            </div>
            <p className="import-file-name" role="status">
              {reading
                ? 'ファイルを読み込み中…'
                : file
                  ? `選択中：${file.name}`
                  : fileName
                    ? `読み取り内容を復元：${fileName}`
                    : 'ファイルを選んだあと、プレビューで内容を確認してください。'}
            </p>
            <label className="import-checkbox">
              <input
                type="checkbox"
                checked={hasHeader}
                disabled={blocked}
                onChange={(event) => {
                  setHasHeader(event.target.checked);
                  setPreview(null);
                }}
              />
              先頭行は見出し
            </label>
            <p className="import-help">
              列の順序は「問題,答え,補足説明」（英語名はquestion,answer,note）。補足列は省略できます。文字化けする場合は文字コードを選び直してください。CSVに学習状態・日時は含めません。
            </p>
          </>
        )}
        <label className="import-checkbox">
          <input
            type="checkbox"
            checked={skipDuplicates}
            disabled={blocked}
            onChange={(event) => setSkipDuplicates(event.target.checked)}
          />
          同じ問題・答え・補足の重複を除外する
        </label>
        <button
          type="button"
          className="button button-secondary"
          disabled={blocked || !text.trim()}
          onClick={showPreview}
        >
          <Eye size={17} />
          プレビューを表示
        </button>
        {hasExternalChanges && (
          <p className="inline-error" role="alert">
            別のタブで保存データが変わりました。登録を停止しています。入力を控えてから閉じ、ページを再読み込みしてください。
          </p>
        )}
        {preview && (
          <>
            <div className="import-preview-summary" ref={summaryRef} tabIndex={-1}>
              <h3>登録前の確認</h3>
              <p>
                追加 <strong>{addCount}</strong>語 · 重複除外 {skipDuplicates ? duplicateCount : 0}
                語 · エラー {invalidCount}行
              </p>
              {preview.value.errors.map((message) => (
                <p className="form-error" role="alert" key={message}>
                  {message}
                </p>
              ))}
              {invalidCount > 0 && (
                <p className="form-error" role="alert">
                  エラーのある行を修正して、もう一度プレビューしてください。修正が完了するまで登録しません。
                </p>
              )}
              {outdated && (
                <p className="form-error" role="alert">
                  保存データが変わりました。もう一度プレビューしてください。
                </p>
              )}
              {addCount === 0 && !preview.value.errors.length && invalidCount === 0 && (
                <p>重複を除くと追加する単語がありません。</p>
              )}
            </div>
            {preview.value.rows.length > 0 && (
              <ImportPreviewTable
                key={preview.key}
                preview={preview.value}
                skipDuplicates={skipDuplicates}
              />
            )}
          </>
        )}
        {error && (
          <p className="inline-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </p>
        )}
        <div className="dialog-actions import-dialog-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={close}>
            キャンセル
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!canImport}
            onClick={() => void submit()}
          >
            {isSaving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {isSaving ? '登録中…' : `${addCount}語を登録する`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
