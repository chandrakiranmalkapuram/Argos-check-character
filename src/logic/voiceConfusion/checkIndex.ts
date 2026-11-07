import { calculateStoreCheckChar } from '../storeCalculator.ts';
import { NATO_PHONETIC_ALPHABET } from '../constants.ts';
import {
  enumeratePatternLocations,
  type SupportedStorePattern
} from './grammar.ts';

export interface PatternCheckDistribution {
  pattern: SupportedStorePattern;
  totalCodes: number;
  perWordCounts: Record<string, number>;
}

export interface CheckIndexStats {
  buildTimeMs: number;
  totalCodes: number;
  perPattern: Record<SupportedStorePattern, PatternCheckDistribution>;
  totalPerWordCounts: Record<string, number>;
  crossPatternCollisionsCount: number;
}

export interface CheckIndex {
  getLocationsForCheckChar(checkChar: string): string[];
  getStats(): CheckIndexStats;
}

let cachedCheckIndex: {
  index: Map<string, string[]>;
  stats: CheckIndexStats;
} | null = null;

/**
 * Builds and memoizes the complete Store check-character index across all 86,520
 * supported grammar location codes.
 *
 * Strict Compliance:
 * - INVARIANT I1: Calls calculateStoreCheckChar for every single code. No second formula.
 * - INVARIANT I2: Every code in a check-word bucket has calculateStoreCheckChar(code).checkChar === word.
 */
export function buildStoreCheckIndex(): {
  index: Map<string, string[]>;
  stats: CheckIndexStats;
} {
  if (cachedCheckIndex) {
    return cachedCheckIndex;
  }

  const startTime = performance.now();

  const index = new Map<string, string[]>();
  for (const word of NATO_PHONETIC_ALPHABET) {
    index.set(word, []);
  }

  const patterns: SupportedStorePattern[] = [
    'standard',
    'jewellery_security',
    'linbin_bulk',
    'cash_office_collection_point'
  ];

  const perPatternStats: Record<SupportedStorePattern, PatternCheckDistribution> = {
    standard: { pattern: 'standard', totalCodes: 0, perWordCounts: {} },
    jewellery_security: { pattern: 'jewellery_security', totalCodes: 0, perWordCounts: {} },
    linbin_bulk: { pattern: 'linbin_bulk', totalCodes: 0, perWordCounts: {} },
    cash_office_collection_point: { pattern: 'cash_office_collection_point', totalCodes: 0, perWordCounts: {} }
  };

  for (const p of patterns) {
    for (const word of NATO_PHONETIC_ALPHABET) {
      perPatternStats[p].perWordCounts[word] = 0;
    }
  }

  let totalCount = 0;

  for (const pattern of patterns) {
    const codes = enumeratePatternLocations(pattern);
    perPatternStats[pattern].totalCodes = codes.length;

    for (const code of codes) {
      // INVARIANT I1: calculateStoreCheckChar is the SINGLE source of truth
      const result = calculateStoreCheckChar(code);
      const checkWord = result.checkChar;

      const list = index.get(checkWord);
      if (list) {
        list.push(code);
      }

      perPatternStats[pattern].perWordCounts[checkWord] =
        (perPatternStats[pattern].perWordCounts[checkWord] || 0) + 1;

      totalCount++;
    }
  }

  const totalPerWordCounts: Record<string, number> = {};
  for (const word of NATO_PHONETIC_ALPHABET) {
    totalPerWordCounts[word] = (index.get(word) || []).length;
  }

  // Count cross-pattern collisions (locations from non-standard patterns sharing check characters with standard codes)
  let crossPatternCollisions = 0;
  for (const word of NATO_PHONETIC_ALPHABET) {
    const stdCount = perPatternStats.standard.perWordCounts[word] || 0;
    const nonStdCount =
      (perPatternStats.jewellery_security.perWordCounts[word] || 0) +
      (perPatternStats.linbin_bulk.perWordCounts[word] || 0) +
      (perPatternStats.cash_office_collection_point.perWordCounts[word] || 0);

    if (stdCount > 0 && nonStdCount > 0) {
      crossPatternCollisions += nonStdCount;
    }
  }

  const endTime = performance.now();
  const buildTimeMs = Number((endTime - startTime).toFixed(2));

  const stats: CheckIndexStats = {
    buildTimeMs,
    totalCodes: totalCount,
    perPattern: perPatternStats,
    totalPerWordCounts,
    crossPatternCollisionsCount: crossPatternCollisions
  };

  cachedCheckIndex = { index, stats };
  return cachedCheckIndex;
}

/**
 * Returns all valid Store grammar locations that share the specified check character word.
 */
export function getSameCheckStoreLocations(checkChar: string): string[] {
  const normalized = checkChar.trim().toUpperCase();
  const { index } = buildStoreCheckIndex();
  return index.get(normalized) || [];
}

/**
 * Returns benchmark statistics and distribution metadata for the check index.
 */
export function getStoreCheckIndexStats(): CheckIndexStats {
  const { stats } = buildStoreCheckIndex();
  return stats;
}

/**
 * Clears the cached check index (useful for benchmarking fresh build times in tests).
 */
export function resetStoreCheckIndexCache(): void {
  cachedCheckIndex = null;
}
