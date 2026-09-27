import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  FileInput,
  FolderInput,
  Layers2,
  Pencil,
  Plus,
  Search,
  SearchX,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Deck, Word } from '../../types/domain';
import { useAppData } from '../../hooks/useAppData';
import { useDesktopLayout } from '../../hooks/useDesktopLayout';
import { useWordTableEditor } from '../../hooks/useWordTableEditor';
import { StatusBadge } from '../common/StatusBadge';
import { WordList } from './WordList';
import { WordTableEditorRow } from './WordTableEditorRow';
import { filterWords } from '../../services/wordSearch';
import type { WordStatusFilter } from '../../services/wordSearch';
import { WordFilters } from './WordFilters';
import { WordTransferControls } from './WordTransferControls';
import { AiImportDialog } from './AiImportDialog';
import { locationBase } from '../../services/navigation';
import { useAccount } from '../../providers/accountContext';
import { hasSessionDraft } from '../../services/sessionDrafts';

interface WordTableProps {
  deck: Deck;
  words: Word[];
  folderId?: string | null;
  scopeControl?: ReactNode;
  onMove: (word: Word) => void;
  onDelete: (word: Word) => void;
  onNotice: (message: string) => void;
}

export function WordTable({
  deck,
  words,
  folderId = null,
  scopeControl,
  onDelete,
  onMove,
  onNotice,
}: WordTableProps) {
  const isDesktop = useDesktopLayout();
  const { user } = useAccount();
  const { isSaving, hasExternalChanges } = useAppData();
  const draftSuffix = `${deck.id}:${folderId ?? 'root'}`;
  const hasImportDraft =
    hasSessionDraft(user.id, `word-import:paste:${draftSuffix}`) ||
    hasSessionDraft(user.id, `word-import:csv:${draftSuffix}`);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<WordStatusFilter>('all');
  const [toolPanel, setToolPanel] = useState<'filters' | 'transfer' | null>(() =>
    hasImportDraft ? 'transfer' : null,
  );
  const [aiOpen, setAiOpen] = useState(() => hasSessionDraft(user.id, `ai-import:${draftSuffix}`));
  const id = useId();
  const filtersActive = query.trim() !== '' || status !== 'all';
  const visibleWords = useMemo(() => filterWords(words, query, status), [words, query, status]);
  const editor = useWordTableEditor(deck.id, visibleWords, onNotice, folderId);
  const rootRef = useRef<HTMLDivElement>(null);
  const { editing, returnFocus } = editor;
  const hasEditingRow = editing !== null;
  useEffect(() => {
    // 幅を縮めたとき、同じ入力欄を維持したまま操作位置が見えるようにする。
    const active = document.activeElement;
    if (
      !isDesktop &&
      hasEditingRow &&
      active instanceof HTMLTextAreaElement &&
      rootRef.current?.contains(active)
    ) {
      active.scrollIntoView({ block: 'center' });
    }
  }, [isDesktop, hasEditingRow]);
  useEffect(() => {
    if (!returnFocus) return;
    const selector = returnFocus.wordId
      ? `[data-word-edit="${CSS.escape(returnFocus.wordId)}"]`
      : '[data-add-row]';
    const target = rootRef.current?.querySelector<HTMLElement>(selector);
    (
      target ??
      rootRef.current?.querySelector<HTMLElement>('[data-add-row], .manager-form-add') ??
      document.getElementById('main-content')
    )?.focus({ preventScroll: true });
  }, [returnFocus]);

  const showTable = isDesktop || editing !== null;
  function clearFilters() {
    setQuery('');
    setStatus('all');
  }
  function editRow(word: Word | null, number: number) {
    if (!editing) return null;
    return (
      <WordTableEditorRow
        key={`editor:${editing.key}`}
        word={word}
        number={number}
        draft={editing.draft}
        errors={editor.errors}
        saveError={editor.saveError}
        dirty={editor.dirty}
        busy={editor.isSaving}
        blocked={editor.blocked}
        fieldFocus={editor.fieldFocus}
        onChange={editor.updateField}
        onSaveNext={() => void editor.save(true)}
        onCancel={editor.cancel}
      />
    );
  }

  return (
    <div ref={rootRef} className="word-manager-content">
      <div className="word-section-heading">
        <h2>
          単語 <span className="count-badge">{words.length}</span>
        </h2>
        {isDesktop || editing ? (
          <button
            type="button"
            className="button button-primary"
            data-add-row
            disabled={editor.blocked}
            onClick={() => editor.start(null)}
          >
            <Plus size={17} />
            単語を追加
          </button>
        ) : (
          <a
            className="button button-primary manager-form-add"
            href={`${locationBase(deck.id, folderId)}/words/new`}
          >
            <Plus size={17} />
            単語を追加
          </a>
        )}
      </div>
      <div className="word-tools">
        {scopeControl}
        <button
          type="button"
          className="button button-quiet"
          disabled={hasEditingRow || isSaving || hasExternalChanges}
          onClick={() => setAiOpen(true)}
        >
          <Sparkles size={16} />
          資料からAIで生成
        </button>
        {(words.length > 0 || filtersActive) && (
          <button
            type="button"
            className="button button-quiet word-tool-toggle"
            aria-expanded={toolPanel === 'filters'}
            aria-controls={`${id}-filters`}
            onClick={() => setToolPanel(toolPanel === 'filters' ? null : 'filters')}
          >
            <Search size={16} />
            検索・絞り込み{filtersActive ? '（適用中）' : ''}
            <ChevronDown size={14} />
          </button>
        )}
        <button
          type="button"
          className="button button-quiet word-tool-toggle"
          aria-expanded={toolPanel === 'transfer'}
          aria-controls={`${id}-transfer`}
          onClick={() => setToolPanel(toolPanel === 'transfer' ? null : 'transfer')}
        >
          <FileInput size={16} />
          まとめて追加・CSV
          <ChevronDown size={14} />
        </button>
      </div>
      {aiOpen && (
        <AiImportDialog
          deck={deck}
          folderId={folderId}
          onClose={() => setAiOpen(false)}
          onImported={(outcome) => {
            setAiOpen(false);
            clearFilters();
            onNotice(
              `${outcome.created}語を登録しました。${outcome.skipped ? `重複${outcome.skipped}語は除外しました。` : ''}`,
            );
          }}
        />
      )}
      {editor.restored && (
        <p className="draft-recovery-notice" role="status">
          ログイン前に入力していた行を復元しました。内容を確認して保存してください。
        </p>
      )}
      <div id={`${id}-filters`} hidden={toolPanel !== 'filters'}>
        <WordFilters
          query={query}
          status={status}
          count={visibleWords.length}
          total={words.length}
          disabled={hasEditingRow || isSaving}
          editing={hasEditingRow}
          onQuery={setQuery}
          onStatus={setStatus}
          onClear={clearFilters}
        />
      </div>
      <div id={`${id}-transfer`} className="word-transfer-panel" hidden={toolPanel !== 'transfer'}>
        <WordTransferControls
          deck={deck}
          folderId={folderId}
          words={words}
          visibleWords={visibleWords}
          disabled={hasEditingRow || isSaving || hasExternalChanges}
          onNotice={onNotice}
          onImported={clearFilters}
        />
      </div>
      {filtersActive && toolPanel !== 'filters' && (
        <div className="word-active-filters" role="status">
          <span>
            絞り込み中：{visibleWords.length} / {words.length}語
          </span>
          <button
            type="button"
            className="button button-quiet"
            disabled={hasEditingRow || isSaving}
            onClick={clearFilters}
          >
            条件をクリア
          </button>
        </div>
      )}
      {words.length === 0 && !editing ? (
        <section className="word-location-empty">
          <Layers2 size={28} strokeWidth={1.5} />
          <h3>この場所にはまだ単語がありません</h3>
          <p>「単語を追加」から、問題と答えを登録できます。</p>
        </section>
      ) : words.length > 0 && visibleWords.length === 0 && !editing ? (
        <section className="word-filter-empty">
          <SearchX size={32} />
          <h2>該当する単語がありません</h2>
          <p>検索語や学習状態の条件を変えてみてください。</p>
          <button type="button" className="button button-secondary" onClick={clearFilters}>
            すべての単語を表示
          </button>
        </section>
      ) : showTable ? (
        <section
          className={`word-table-section${!isDesktop ? ' table-edit-compact' : ''}`}
          aria-label="単語のテーブル編集"
        >
          <div className="word-table-tools">
            <details className="word-input-help">
              <summary>入力方法・ショートカット</summary>
              <p id="word-table-keys">
                <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd> 欄を移動
                <br />
                <kbd>Enter</kbd> 保存して次の行へ · <kbd>Shift + Enter</kbd> 改行
                <br />
                保存は行ごとです。最後の行で「保存して次へ」を押すと、新しい入力行を開きます。
              </p>
            </details>
            <a
              className="button button-quiet manager-form-add"
              href={`${locationBase(deck.id, folderId)}/words/new`}
            >
              フォームで追加
            </a>
          </div>
          {!isDesktop && (
            <p className="table-resize-notice" role="status">
              入力中の内容を保持しています。「保存」か「キャンセル」でカード一覧へ戻ります。
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void editor.save(false);
            }}
            noValidate
            aria-label="単語の一覧編集"
            aria-describedby="word-table-keys"
          >
            <div className="word-table-scroll">
              <table className="word-table">
                <caption className="sr-only">
                  {deck.name}の単語。追加した順に表示。編集ボタンで1行ずつ編集できます。
                </caption>
                <colgroup>
                  <col className="table-col-number" />
                  <col className="table-col-question" />
                  <col className="table-col-answer" />
                  <col />
                  <col className="table-col-status" />
                  <col className="table-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">No.</th>
                    <th scope="col">問題</th>
                    <th scope="col">答え</th>
                    <th scope="col">補足説明</th>
                    <th scope="col">状態</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWords.map((word, index) =>
                    editing?.word?.id === word.id ? (
                      editRow(word, index + 1)
                    ) : (
                      <tr
                        key={`word:${word.id}`}
                        className="word-table-read-row"
                        data-word-id={word.id}
                      >
                        <th scope="row" className="word-table-number">
                          {String(index + 1).padStart(2, '0')}
                        </th>
                        <td className="table-word-question">{word.question}</td>
                        <td>{word.answer}</td>
                        <td className="table-word-note">
                          {word.note || (
                            <span className="table-empty-note" aria-label="補足説明なし">
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={word.status} />
                        </td>
                        <td>
                          <div className="word-table-row-actions">
                            <button
                              type="button"
                              className="button button-secondary"
                              data-word-edit={word.id}
                              aria-label={`単語${index + 1}を編集`}
                              disabled={editor.blocked}
                              onClick={() => editor.start(word)}
                            >
                              <Pencil size={15} />
                              編集
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`単語${index + 1}を移動`}
                              title="フォルダーへ移動"
                              disabled={editor.blocked || editing !== null}
                              onClick={() => onMove(word)}
                            >
                              <FolderInput size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger-hover"
                              aria-label={`単語${index + 1}を削除`}
                              title="単語を削除"
                              disabled={editor.blocked || editing !== null}
                              onClick={() => onDelete(word)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                  {editing && !editing.word && editRow(null, visibleWords.length + 1)}
                </tbody>
              </table>
            </div>
          </form>
        </section>
      ) : (
        <WordList
          words={visibleWords}
          busy={isSaving || hasExternalChanges}
          onDelete={onDelete}
          onMove={onMove}
        />
      )}
    </div>
  );
}
