import { useState } from 'react';
import type { ImportPreview } from '../../services/wordImportService';

const PAGE_SIZE = 20;
export function ImportPreviewTable({
  preview,
  skipDuplicates,
}: {
  preview: ImportPreview;
  skipDuplicates: boolean;
}) {
  const [page, setPage] = useState(0);
  const from = page * PAGE_SIZE;
  return (
    <div className="import-preview">
      <p className="import-preview-scroll-hint">
        表を左右にスクロールすると、補足説明と確認結果も読めます。
      </p>
      <div
        className="import-preview-scroll"
        tabIndex={0}
        role="region"
        aria-label="取り込み内容の表（横にスクロールできます）"
      >
        <table>
          <caption className="sr-only">登録前のプレビュー</caption>
          <thead>
            <tr>
              <th scope="col">元の行</th>
              <th scope="col">問題</th>
              <th scope="col">答え</th>
              <th scope="col">補足説明</th>
              <th scope="col">確認結果</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(from, from + PAGE_SIZE).map((row) => (
              <tr
                key={row.line}
                className={
                  row.errors.length
                    ? 'import-invalid-row'
                    : row.duplicate && skipDuplicates
                      ? 'import-skipped-row'
                      : ''
                }
              >
                <th scope="row">{row.line}</th>
                <td>
                  <div>{row.input.question || '（空欄）'}</div>
                </td>
                <td>
                  <div>{row.input.answer || '（空欄）'}</div>
                </td>
                <td>
                  <div>{row.input.note || '—'}</div>
                </td>
                <td>
                  {row.errors.length
                    ? row.errors.join(' ')
                    : row.duplicate
                      ? skipDuplicates
                        ? '重複のため除外'
                        : '重複あり・追加'
                      : '追加'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.rows.length > PAGE_SIZE && (
        <div className="import-preview-pages">
          <button
            type="button"
            className="button button-secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            前の20行
          </button>
          <span aria-live="polite">
            {from + 1}–{Math.min(from + PAGE_SIZE, preview.rows.length)} / {preview.rows.length}行
          </span>
          <button
            type="button"
            className="button button-secondary"
            disabled={from + PAGE_SIZE >= preview.rows.length}
            onClick={() => setPage(page + 1)}
          >
            次の20行
          </button>
        </div>
      )}
    </div>
  );
}
