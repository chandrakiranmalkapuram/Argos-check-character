import { useState, useEffect, useCallback } from 'react';
import type { HistoryItem, CheckMode } from '../logic/types.ts';

const STORAGE_KEY = 'check_character_by_chandra_history_v1';
const MAX_HISTORY_ITEMS = 15;

export function useSearchHistory() {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load search history from localStorage', e);
    }
    return [];
  });

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save search history to localStorage', e);
    }
  }, [history]);

  const addSearch = useCallback((query: string, resultSummary: string, spokenSummary: string, mode: CheckMode) => {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed || resultSummary === 'NULL' || resultSummary === 'N/A') {
      return;
    }

    setHistory(prev => {
      // Remove any existing entry with the same query to put fresh one on top
      const filtered = prev.filter(item => item.query !== trimmed);
      const newItem: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        query: trimmed,
        timestamp: Date.now(),
        resultSummary,
        spokenSummary,
        mode
      };
      return [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    });
  }, []);

  const removeSearch = useCallback((id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addSearch,
    removeSearch,
    clearHistory
  };
}
