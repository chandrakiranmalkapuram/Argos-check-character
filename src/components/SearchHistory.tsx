import React from 'react';
import type { HistoryItem } from '../logic/types.ts';

interface SearchHistoryProps {
  history: HistoryItem[];
  onSelectQuery: (query: string) => void;
  onRemoveItem: (id: string) => void;
  onClearHistory: () => void;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({
  history,
  onSelectQuery,
  onRemoveItem,
  onClearHistory
}) => {
  if (history.length === 0) {
    return null;
  }

  return (
    <section className="history-section fade-in" aria-label="Recent Searches">
      <div className="history-header">
        <span className="history-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Recent Searches
        </span>

        <button
          type="button"
          className="clear-history-btn"
          onClick={onClearHistory}
        >
          Clear History
        </button>
      </div>

      <ul className="history-list">
        {history.map(item => (
          <li key={item.id} className="history-chip">
            <button
              type="button"
              className="history-query-btn"
              onClick={() => onSelectQuery(item.query)}
              title={`Recalculate ${item.query}`}
            >
              {item.query}
            </button>
            <span className="history-arrow">→</span>
            <span className="history-result-badge">{item.resultSummary}</span>
            <button
              type="button"
              className="history-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveItem(item.id);
              }}
              title="Remove from history"
              aria-label={`Remove ${item.query} from history`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
