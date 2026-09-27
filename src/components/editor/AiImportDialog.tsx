import { useEffect, useId, useRef, useState } from 'react';
import { Check, FileText, Link, LoaderCircle, Sparkles, Type } from 'lucide-react';
import { useAppData } from '../../hooks/useAppData';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAccount } from '../../providers/accountContext';
import { generateAiWords, getAiConfig, readAiFile } from '../../services/aiClient';
import { folderPath } from '../../services/folderService';
import {
  getWordInputErrors,
  MAX_ANSWER_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUESTION_LENGTH,
} from '../../services/wordService';
import { wordContentKey, type ImportOutcome } from '../../services/wordImportService';
import {
  clearSessionDraft,
  readSessionDraft,
  saveSessionDraft,
} from '../../services/sessionDrafts';
import {
  AI_FILE_ACCEPT,
  AI_MAX_FILE_BYTES,
  AI_MAX_TEXT_LENGTH,
  AI_MAX_WORDS,
  type AiConfig,
  type AiGenerateResult,
  type AiSource,
} from '../../types/ai';
import type { Deck, WordInput } from '../../types/domain';
import { Dialog } from '../common/Dialog';

interface AiImportDialogProps {
  deck: Deck;
  folderId?: string | null;
  onClose: () => void;
  onImported: (outcome: ImportOutcome) => void;
}
interface Preview {
  rows: { input: WordInput; selected: boolean }[];
  source: AiGenerateResult['source'];
  warnings: string[];
  revision: number;
}
interface StoredAiDraft {
  kind: AiSource['kind'];
  fileName: string | null;
  url: string;
  text: string;
  count: number;
  preview: Preview | null;
  skipDuplicates: boolean;
}
const sourceOptions = [
  { kind: 'file', label: 'ファイル', icon: FileText },
  { kind: 'url', label: 'URL', icon: Link },
  { kind: 'text', label: 'テキスト', icon: Type },
] as const;
const fieldLabels: Record<keyof WordInput, string> = {
  question: '問題',
  answer: '答え',
  note: '補足説明',
};

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

function isPreview(value: unknown): value is Preview {
  if (typeof value !== 'object' || value === null) return false;
  const preview = value as Record<string, unknown>;
  if (
    !Array.isArray(preview.rows) ||
    preview.rows.length > AI_MAX_WORDS ||
    !Array.isArray(preview.warnings) ||
    !preview.warnings.every((warning) => typeof warning === 'string') ||
    typeof preview.revision !== 'number' ||
    !Number.isSafeInteger(preview.revision) ||
    preview.revision < 0 ||
    typeof preview.source !== 'object' ||
    preview.source === null ||
    typeof (preview.source as Record<string, unknown>).label !== 'string' ||
    ((preview.source as Record<string, unknown>).url !== undefined &&
      typeof (preview.source as Record<string, unknown>).url !== 'string')
  )
    return false;
  return preview.rows.every(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as Record<string, unknown>).selected === 'boolean' &&
      isWordInputDraft((row as Record<string, unknown>).input),
  );
}

function isStoredAiDraft(value: unknown): value is StoredAiDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.kind === 'file' || draft.kind === 'url' || draft.kind === 'text') &&
    (draft.fileName === null || typeof draft.fileName === 'string') &&
    typeof draft.url === 'string' &&
    draft.url.length <= 2048 &&
    typeof draft.text === 'string' &&
    draft.text.length <= AI_MAX_TEXT_LENGTH &&
    typeof draft.count === 'number' &&
    [5, 10, 20, 30].includes(draft.count) &&
    (draft.preview === null || isPreview(draft.preview)) &&
    typeof draft.skipDuplicates === 'boolean'
  );
}

function sourceLink(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function AiImportDialog({
  deck,
  folderId = null,
  onClose,
  onImported,
}: AiImportDialogProps) {
  const { data, isSaving, hasExternalChanges, importWords } = useAppData();
  const { user } = useAccount();
  const draftScope = `ai-import:${deck.id}:${folderId ?? 'root'}`;
  const [savedDraft] = useState(() => readSessionDraft(user.id, draftScope, isStoredAiDraft));
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [kind, setKind] = useState<AiSource['kind']>(savedDraft?.kind ?? 'file');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(savedDraft?.fileName ?? null);
  const [url, setUrl] = useState(savedDraft?.url ?? '');
  const [text, setText] = useState(savedDraft?.text ?? '');
  const [count, setCount] = useState(savedDraft?.count ?? 10);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(savedDraft?.preview ?? null);
  const [skipDuplicates, setSkipDuplicates] = useState(savedDraft?.skipDuplicates ?? true);
  const [restored, setRestored] = useState(savedDraft !== null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const pendingSave = useRef(false);
  const revisionRef = useRef(data.revision);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const dirty =
    file !== null || fileName !== null || text.length > 0 || url.length > 0 || preview !== null;
  const { markSaved } = useUnsavedChanges(dirty, () => clearSessionDraft(user.id, draftScope));
  const busy = generating || isSaving;
  const blocked = busy || hasExternalChanges;
  const outdated = preview !== null && preview.revision !== data.revision;
  const existing = new Set(
    data.words
      .filter((word) => word.deckId === deck.id && (word.folderId ?? null) === folderId)
      .map(wordContentKey),
  );
  const rows = (preview?.rows ?? []).map((row) => {
    const errors = getWordInputErrors(row.input);
    const valid = Object.keys(errors).length === 0;
    const key = wordContentKey(row.input);
    const duplicate = row.selected && valid && existing.has(key);
    if (row.selected && valid) existing.add(key);
    return { ...row, errors, valid, duplicate };
  });
  const selectedCount = rows.filter((row) => row.selected).length;
  const invalidCount = rows.filter((row) => row.selected && !row.valid).length;
  const duplicateCount = skipDuplicates ? rows.filter((row) => row.duplicate).length : 0;
  const addCount = selectedCount - invalidCount - duplicateCount;
  const canSave = preview !== null && !blocked && !outdated && invalidCount === 0 && addCount > 0;
  const hasSource = kind === 'file' ? file !== null : kind === 'url' ? !!url.trim() : !!text.trim();
  const originalUrl = sourceLink(preview?.source.url);

  useEffect(() => {
    revisionRef.current = data.revision;
  }, [data.revision]);
  useEffect(() => {
    const controller = new AbortController();
    void getAiConfig(user.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setConfigError(
            cause instanceof Error ? cause.message : 'AIの設定を読み込めませんでした。',
          );
      });
    return () => controller.abort();
  }, [user.id, configAttempt]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const hasPreview = preview !== null;
  useEffect(() => {
    if (hasPreview) previewRef.current?.focus();
  }, [hasPreview]);
  useEffect(() => {
    if (dirty)
      saveSessionDraft(user.id, draftScope, {
        kind,
        fileName,
        url,
        text,
        count,
        preview,
        skipDuplicates,
      });
    else clearSessionDraft(user.id, draftScope);
  }, [count, dirty, draftScope, fileName, kind, preview, skipDuplicates, text, url, user.id]);

  function close() {
    if (busy || pendingSave.current) return;
    if (dirty && !window.confirm('資料と生成内容は登録されていません。破棄して閉じますか？'))
      return;
    clearSessionDraft(user.id, draftScope);
    markSaved();
    setRestored(false);
    onClose();
  }

  function selectFile(selected: File) {
    setError(null);
    setStatus('');
    if (selected.size === 0 || selected.size > AI_MAX_FILE_BYTES) {
      setFile(null);
      setFileName(null);
      setError('空ではない、5MB以下のファイルを選んでください。');
      return;
    }
    if (!/\.(pdf|txt|md|csv)$/i.test(selected.name)) {
      setFile(null);
      setFileName(null);
      setError('PDF・テキスト・Markdown・CSVのファイルを選んでください。');
      return;
    }
    setFile(selected);
    setFileName(selected.name);
  }

  async function generate() {
    if (blocked || !config?.enabled || !hasSource || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setGenerating(true);
    setError(null);
    setStatus('資料を読み取り、単語を生成しています。しばらくお待ちください。');
    try {
      let source: AiSource;
      if (kind === 'file' && file) source = await readAiFile(file, controller.signal);
      else if (kind === 'url') {
        let parsed: URL;
        try {
          parsed = new URL(url.trim());
        } catch {
          throw new Error('https:// または http:// で始まるURLを入力してください。');
        }
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
          throw new Error('公開されているWebページのURLを入力してください。');
        source = { kind: 'url', url: parsed.href };
      } else {
        if (text.trim().length < 20 || text.length > AI_MAX_TEXT_LENGTH)
          throw new Error('資料のテキストは20〜50,000文字で入力してください。');
        source = { kind: 'text', text };
      }
      const result = await generateAiWords(user.id, { source, count }, controller.signal);
      if (controller.signal.aborted) return;
      setPreview({
        rows: result.words.map((input) => ({ input, selected: true })),
        source: result.source,
        warnings: result.warnings,
        revision: revisionRef.current,
      });
      setStatus('生成が完了しました。内容を確認し、登録する単語を選んでください。');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : '生成できませんでした。もう一度お試しください。',
        );
        setStatus('');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setGenerating(false);
      }
    }
  }

  function cancelGeneration() {
    requestRef.current?.abort();
    requestRef.current = null;
    setGenerating(false);
    setStatus('生成を中止しました。資料を変えて、もう一度生成できます。');
  }

  function updateRow(index: number, field: keyof WordInput, value: string) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row, rowIndex) =>
              rowIndex === index ? { ...row, input: { ...row.input, [field]: value } } : row,
            ),
          }
        : current,
    );
  }

  async function submit() {
    if (!canSave || !preview || pendingSave.current) return;
    pendingSave.current = true;
    setError(null);
    try {
      const result = await importWords(
        deck.id,
        preview.rows.filter((row) => row.selected).map((row) => row.input),
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
    } catch {
      setError('保存できませんでした。内容を確認して、もう一度登録してください。');
    } finally {
      pendingSave.current = false;
    }
  }

  return (
    <Dialog
      wide
      title="AIで単語を生成"
      description={`追加先：${[deck.name, ...folderPath(data.folders, folderId).map((folder) => folder.name)].join(' / ')}`}
      busy={busy}
      onClose={close}
    >
      <div className="ai-import">
        {restored && (
          <p className="draft-recovery-notice" role="status">
            {preview
              ? 'ログイン前に確認していたAI候補を復元しました。内容を確認して登録してください。'
              : kind === 'file' && fileName
                ? `入力状態を復元しました。「${fileName}」は安全のため保存していません。もう一度選択してください。`
                : 'ログイン前に入力していた資料を復元しました。'}
          </p>
        )}
        {!config && !configError && <p role="status">AIの設定を確認しています…</p>}
        {configError && (
          <div className="ai-import-unavailable">
            <p className="inline-error" role="alert">
              {configError}
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setConfigError(null);
                setConfigAttempt((attempt) => attempt + 1);
              }}
            >
              もう一度確認
            </button>
          </div>
        )}
        {config && !config.enabled && (
          <div className="ai-import-unavailable">
            <Sparkles size={26} aria-hidden="true" />
            <h3>AI機能の準備が必要です</h3>
            <p>サーバーのAI設定が完了すると、ファイルやURLから単語を生成できます。</p>
            <p>設定については、このアプリの管理者に確認してください。</p>
          </div>
        )}
        {config?.enabled && (
          <>
            {!preview ? (
              <>
                <div className="ai-source-tabs" role="tablist" aria-label="資料の入力方法">
                  {sourceOptions.map((option, index) => (
                    <button
                      key={option.kind}
                      type="button"
                      role="tab"
                      id={`${id}-tab-${option.kind}`}
                      aria-selected={kind === option.kind}
                      aria-controls={`${id}-source`}
                      tabIndex={kind === option.kind ? 0 : -1}
                      disabled={blocked}
                      onClick={() => {
                        setKind(option.kind);
                        setError(null);
                        setStatus('');
                      }}
                      onKeyDown={(event) => {
                        const next =
                          event.key === 'ArrowRight'
                            ? (index + 1) % 3
                            : event.key === 'ArrowLeft'
                              ? (index + 2) % 3
                              : event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? 2
                                  : -1;
                        if (next < 0) return;
                        event.preventDefault();
                        setKind(sourceOptions[next].kind);
                        setError(null);
                        document.getElementById(`${id}-tab-${sourceOptions[next].kind}`)?.focus();
                      }}
                    >
                      <option.icon size={17} aria-hidden="true" />
                      {option.label}
                    </button>
                  ))}
                </div>
                <div
                  className="ai-source-panel"
                  id={`${id}-source`}
                  role="tabpanel"
                  aria-labelledby={`${id}-tab-${kind}`}
                >
                  {kind === 'file' && (
                    <>
                      <label className="field-label" htmlFor={`${id}-file`}>
                        資料ファイル
                      </label>
                      <input
                        id={`${id}-file`}
                        type="file"
                        accept={AI_FILE_ACCEPT}
                        disabled={blocked}
                        aria-describedby={`${id}-file-help`}
                        onChange={(event) => {
                          const selected = event.target.files?.[0];
                          event.target.value = '';
                          if (selected) selectFile(selected);
                        }}
                      />
                      <p className="ai-import-help" id={`${id}-file-help`}>
                        PDF・TXT・MD・CSV。5MBまで。Word・PowerPointはPDFに書き出して選んでください。
                      </p>
                      <p className="ai-source-name">
                        {file
                          ? `選択中：${file.name}`
                          : fileName
                            ? `再選択が必要：${fileName}`
                            : '対応形式の資料を選んでください。'}
                      </p>
                    </>
                  )}
                  {kind === 'url' && (
                    <>
                      <label className="field-label" htmlFor={`${id}-url`}>
                        WebページのURL
                      </label>
                      <input
                        id={`${id}-url`}
                        className="text-input"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={url}
                        readOnly={blocked}
                        maxLength={2048}
                        placeholder="https://example.com/article"
                        aria-describedby={`${id}-url-help`}
                        onChange={(event) => {
                          setUrl(event.target.value);
                          setError(null);
                        }}
                      />
                      <p className="ai-import-help" id={`${id}-url-help`}>
                        公開されている解説ページなどを指定できます。ログインが必要なページや動画は、資料のテキストを貼り付けてください。
                      </p>
                    </>
                  )}
                  {kind === 'text' && (
                    <>
                      <label className="field-label" htmlFor={`${id}-text`}>
                        資料のテキスト
                      </label>
                      <textarea
                        id={`${id}-text`}
                        className="text-input"
                        rows={7}
                        value={text}
                        readOnly={blocked}
                        maxLength={AI_MAX_TEXT_LENGTH}
                        placeholder="授業のノートや資料の文章を貼り付けてください。"
                        aria-describedby={`${id}-text-help`}
                        onChange={(event) => {
                          setText(event.target.value);
                          setError(null);
                        }}
                      />
                      <p className="ai-import-help" id={`${id}-text-help`}>
                        {text.length.toLocaleString()}文字（20〜50,000文字）
                      </p>
                    </>
                  )}
                </div>
                <div className="ai-generate-options">
                  <label htmlFor={`${id}-count`}>生成する語数（目安）</label>
                  <select
                    id={`${id}-count`}
                    value={count}
                    disabled={blocked}
                    onChange={(event) => setCount(Number(event.target.value))}
                  >
                    {[5, 10, 20, 30].map((amount) => (
                      <option key={amount} value={amount}>
                        {amount}語
                      </option>
                    ))}
                  </select>
                </div>
                <p className="ai-disclosure">
                  資料の内容を{config.provider || 'AIサービス'}
                  へ送信します。生成内容を確認してから登録してください。
                </p>
                {config.provider.includes('Gemini') && (
                  <p className="ai-disclosure">
                    無料枠では送信した内容がGoogleの製品改善に利用される場合があります。個人情報・機密情報を含む資料は送信しないでください。
                  </p>
                )}
                <div className="ai-generate-action">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={blocked || !hasSource}
                    onClick={() => void generate()}
                  >
                    {generating ? (
                      <LoaderCircle className="spin" size={17} aria-hidden="true" />
                    ) : (
                      <Sparkles size={17} aria-hidden="true" />
                    )}
                    {generating ? '生成中…' : '単語を生成する'}
                  </button>
                  {generating && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={cancelGeneration}
                    >
                      生成を中止
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="ai-preview-heading">
                  <div>
                    <h3 ref={previewRef} tabIndex={-1}>
                      生成内容を確認
                    </h3>
                    <p className="ai-source-name">資料：{preview.source.label}</p>
                    {originalUrl && (
                      <a
                        className="ai-source-link"
                        href={originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        元のWebページを開く
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={blocked}
                    onClick={() => {
                      if (!window.confirm('生成内容を破棄して、資料の入力に戻りますか？')) return;
                      setPreview(null);
                      setError(null);
                      setStatus('');
                    }}
                  >
                    資料を変更
                  </button>
                </div>
                <p className="ai-import-help">
                  問題・答え・補足を編集できます。不要な単語はチェックを外してください。AIの内容には誤りが含まれることがあるため、元の資料と確認してください。
                </p>
                {preview.warnings.length > 0 && (
                  <ul className="ai-preview-warnings">
                    {preview.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}
                {outdated && (
                  <div className="ai-preview-stale" role="alert">
                    <p>
                      保存データが変わりました。生成内容を残したまま、現在のデータで重複を再確認してください。
                    </p>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={blocked}
                      onClick={() => {
                        setPreview((current) =>
                          current ? { ...current, revision: data.revision } : current,
                        );
                        setError(null);
                      }}
                    >
                      現在のデータで再確認
                    </button>
                  </div>
                )}
                <div className="ai-preview-selection">
                  <p>
                    <strong>{addCount}語</strong>を追加
                    {duplicateCount > 0 ? `・重複 ${duplicateCount}語を除外` : ''}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={blocked || selectedCount === rows.length}
                      onClick={() =>
                        setPreview({
                          ...preview,
                          rows: preview.rows.map((row) => ({ ...row, selected: true })),
                        })
                      }
                    >
                      すべて選択
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={blocked || selectedCount === 0}
                      onClick={() =>
                        setPreview({
                          ...preview,
                          rows: preview.rows.map((row) => ({ ...row, selected: false })),
                        })
                      }
                    >
                      選択を解除
                    </button>
                  </div>
                </div>
                <label className="ai-import-checkbox">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    disabled={blocked}
                    onChange={(event) => setSkipDuplicates(event.target.checked)}
                  />
                  同じ問題・答え・補足の重複を除外する
                </label>
                {invalidCount > 0 && (
                  <p className="inline-error" role="alert">
                    選択した{invalidCount}
                    語に入力エラーがあります。修正するか、チェックを外してください。
                  </p>
                )}
                <div className="ai-preview-cards">
                  {rows.map((row, index) => (
                    <section
                      className={`ai-preview-card${!row.selected ? ' ai-preview-card-excluded' : ''}`}
                      key={index}
                      aria-label={`${index + 1}語目`}
                    >
                      <div className="ai-preview-card-heading">
                        <label className="ai-import-checkbox">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={blocked}
                            onChange={(event) => {
                              const selected = event.target.checked;
                              setPreview((current) =>
                                current
                                  ? {
                                      ...current,
                                      rows: current.rows.map((item, rowIndex) =>
                                        rowIndex === index ? { ...item, selected } : item,
                                      ),
                                    }
                                  : current,
                              );
                            }}
                          />
                          {index + 1}語目を登録
                        </label>
                        {row.duplicate && skipDuplicates && (
                          <span className="ai-duplicate-tag">重複のため除外</span>
                        )}
                      </div>
                      <div className="ai-preview-fields">
                        {(['question', 'answer', 'note'] as const).map((field) => (
                          <div className={`ai-preview-field ai-preview-${field}`} key={field}>
                            <label className="field-label" htmlFor={`${id}-${index}-${field}`}>
                              {fieldLabels[field]}
                              {field === 'note' && <span>（任意）</span>}
                            </label>
                            <textarea
                              id={`${id}-${index}-${field}`}
                              className="text-input"
                              rows={field === 'note' ? 2 : 3}
                              value={row.input[field]}
                              readOnly={blocked}
                              aria-invalid={row.selected && !!row.errors[field]}
                              aria-describedby={
                                row.selected && row.errors[field]
                                  ? `${id}-${index}-${field}-error`
                                  : undefined
                              }
                              onChange={(event) => updateRow(index, field, event.target.value)}
                            />
                            {row.selected && row.errors[field] && (
                              <p className="form-error" id={`${id}-${index}-${field}-error`}>
                                {row.errors[field]}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {status && (
          <p className="ai-import-status" role="status">
            {status}
          </p>
        )}
        {hasExternalChanges && (
          <p className="inline-error" role="alert">
            別のタブで保存データが変わりました。登録を停止しています。必要な内容を控えてから閉じ、ページを再読み込みしてください。
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert" ref={errorRef} tabIndex={-1}>
            {error}
          </p>
        )}
        <div className="dialog-actions ai-import-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={close}>
            閉じる
          </button>
          {preview && (
            <button
              type="button"
              className="button button-primary"
              disabled={!canSave}
              onClick={() => void submit()}
            >
              {isSaving ? (
                <LoaderCircle className="spin" size={17} aria-hidden="true" />
              ) : (
                <Check size={17} aria-hidden="true" />
              )}
              {isSaving ? '登録中…' : `${addCount}語を登録する`}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
