import { useId, useState } from 'react';
import { ClipboardPlus, Download, Upload } from 'lucide-react';
import type { Deck, Word } from '../../types/domain';
import type { ImportFormat } from '../../services/wordImportService';
import { csvFileName, exportWordsCsv } from '../../services/csvService';
import { downloadTextFile } from '../../services/downloadFile';
import { WordImportDialog } from './WordImportDialog';
import { useAccount } from '../../providers/accountContext';
import { hasSessionDraft } from '../../services/sessionDrafts';

export function WordTransferControls({
  deck,
  folderId = null,
  words,
  visibleWords,
  disabled,
  onNotice,
  onImported,
}: {
  deck: Deck;
  folderId?: string | null;
  words: Word[];
  visibleWords: Word[];
  disabled: boolean;
  onNotice: (message: string) => void;
  onImported: () => void;
}) {
  const { user } = useAccount();
  const suffix = `${deck.id}:${folderId ?? 'root'}`;
  const [format, setFormat] = useState<ImportFormat | null>(() =>
    hasSessionDraft(user.id, `word-import:paste:${suffix}`)
      ? 'paste'
      : hasSessionDraft(user.id, `word-import:csv:${suffix}`)
        ? 'csv'
        : null,
  );
  const [scope, setScope] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const selected = scope === 'all' ? words : visibleWords;
  function download() {
    if (disabled || selected.length === 0) return;
    try {
      downloadTextFile(
        exportWordsCsv(selected),
        csvFileName(deck.name, scope === 'visible'),
        'text/csv;charset=utf-8',
      );
      setError(null);
      onNotice(`${selected.length}語のCSVダウンロードを開始しました。`);
    } catch {
      setError('CSVを出力できませんでした。もう一度お試しください。');
    }
  }
  return (
    <>
      <section className="word-transfer-controls" aria-label="単語の一括登録とCSV">
        <div className="word-transfer-buttons">
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={() => setFormat('paste')}
          >
            <ClipboardPlus size={16} />
            一括貼り付け
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={() => setFormat('csv')}
          >
            <Upload size={16} />
            CSV取込
          </button>
        </div>
        <div className="word-export-controls">
          <label htmlFor={`${id}-scope`}>CSV出力範囲</label>
          <select
            id={`${id}-scope`}
            value={scope}
            disabled={disabled}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="all">選択範囲すべて（{words.length}語）</option>
            <option value="visible">表示中の単語（{visibleWords.length}語）</option>
          </select>
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled || selected.length === 0}
            onClick={download}
          >
            <Download size={16} />
            CSV出力
          </button>
        </div>
        <p className="word-transfer-hint">
          CSVは問題・答え・補足の教材データです。学習状態と日時は含みません。UTF-8で出力します。
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {format && (
        <WordImportDialog
          deck={deck}
          folderId={folderId}
          words={words.filter((word) => (word.folderId ?? null) === folderId)}
          format={format}
          onClose={() => setFormat(null)}
          onImported={(outcome) => {
            setFormat(null);
            onImported();
            onNotice(
              `${outcome.created}語を追加しました。${outcome.skipped ? `重複${outcome.skipped}語は除外しました。` : ''}`,
            );
          }}
        />
      )}
    </>
  );
}
