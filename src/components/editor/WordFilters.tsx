import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { WORD_STATUS_FILTERS } from '../../services/wordSearch';
import type { WordStatusFilter } from '../../services/wordSearch';

interface WordFiltersProps {
  query: string;
  status: WordStatusFilter;
  count: number;
  total: number;
  disabled: boolean;
  editing: boolean;
  onQuery: (query: string) => void;
  onStatus: (status: WordStatusFilter) => void;
  onClear: () => void;
}
export function WordFilters({
  query,
  status,
  count,
  total,
  disabled,
  editing,
  onQuery,
  onStatus,
  onClear,
}: WordFiltersProps) {
  const id = useId();
  return (
    <section className="word-filters" aria-label="単語の検索と絞り込み">
      <div className="word-filter-fields">
        <div className="word-search-field">
          <label htmlFor={`${id}-search`}>
            <Search size={15} />
            単語を検索
          </label>
          <input
            id={`${id}-search`}
            data-word-search
            type="search"
            className="text-input"
            placeholder="問題・答え・補足から検索"
            value={query}
            disabled={disabled}
            onChange={(event) => onQuery(event.target.value)}
            aria-describedby={`${id}-hint`}
          />
        </div>
        <div className="word-status-field">
          <label htmlFor={`${id}-status`}>学習状態で絞り込み</label>
          <select
            id={`${id}-status`}
            value={status}
            disabled={disabled}
            onChange={(event) => onStatus(event.target.value as WordStatusFilter)}
          >
            {WORD_STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={onClear}
          disabled={disabled || (!query && status === 'all')}
        >
          <X size={15} />
          条件をクリア
        </button>
      </div>
      <div className="word-filter-summary">
        <p id={`${id}-hint`}>
          {editing
            ? '条件を変える前に、編集中の行を保存またはキャンセルしてください。'
            : 'スペースで複数条件。英字の大文字・小文字、全角・半角を区別しません。'}
        </p>
        <p role="status" aria-live="polite">
          表示 <strong>{count}</strong> / 全{total}語
        </p>
      </div>
    </section>
  );
}
