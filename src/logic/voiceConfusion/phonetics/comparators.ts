import { getFastTokenDistance } from './tokenDistanceTable.ts';
import type { SpokenToken } from '../tokenizer.ts';

/**
 * Token gap cost (insertion/deletion penalty) for phonetic comparators.
 *
 * Decision D12: Fixed at 0.90.
 * At this setting, gapped alignment equals fixed-position for equal-length codes
 * (crossover is about 0.84 for 08MN/20AN). Gapped alignment matters only for unequal
 * token counts (e.g. 3-token Cash Office vs 4-token standard codes). Lowering the gap cost
 * does not surface the shift seeds (such as 08MN/20AN or 81ZE/50ER) because they have 3-4
 * differing tokens and are capped out of phonetic tiers.
 */
export const TOKEN_GAP_COST = 0.9;

export interface TokenAlignmentPair {
  tokenA: string | null;
  tokenB: string | null;
  distance: number;
}

export interface ComparisonResult {
  comparatorName: 'fixed_position' | 'gapped_alignment';
  totalDistance: number;
  meanDistance: number;
  alignment: TokenAlignmentPair[];
}

/**
 * Comparator A: Fixed-Position Comparator.
 * Compares tokens strictly at identical positional indices (slot-by-slot).
 * Unaligned positions due to unequal token counts incur TOKEN_GAP_COST.
 */
export function compareFixedPosition(
  tokensA: SpokenToken[],
  tokensB: SpokenToken[]
): ComparisonResult {
  const maxLen = Math.max(tokensA.length, tokensB.length);
  const alignment: TokenAlignmentPair[] = [];
  let totalDistance = 0;

  for (let i = 0; i < maxLen; i++) {
    const tA = tokensA[i] ? tokensA[i].word : null;
    const tB = tokensB[i] ? tokensB[i].word : null;

    if (tA !== null && tB !== null) {
      const dist = getFastTokenDistance(tA, tB);
      totalDistance += dist;
      alignment.push({ tokenA: tA, tokenB: tB, distance: dist });
    } else {
      // Unpaired position incurs gap cost
      totalDistance += TOKEN_GAP_COST;
      alignment.push({ tokenA: tA, tokenB: tB, distance: TOKEN_GAP_COST });
    }
  }

  const meanDistance = maxLen > 0 ? Number((totalDistance / maxLen).toFixed(4)) : 0;

  return {
    comparatorName: 'fixed_position',
    totalDistance: Number(totalDistance.toFixed(4)),
    meanDistance,
    alignment
  };
}

/**
 * Comparator B: Gapped-Alignment Comparator.
 * Performs Needleman-Wunsch token-level dynamic programming alignment.
 * Allows inserted/omitted or shifted tokens to align without cascading penalties.
 */
export function compareGappedAlignment(
  tokensA: SpokenToken[],
  tokensB: SpokenToken[]
): ComparisonResult {
  const m = tokensA.length;
  const n = tokensB.length;

  if (m === 0 && n === 0) {
    return {
      comparatorName: 'gapped_alignment',
      totalDistance: 0,
      meanDistance: 0,
      alignment: []
    };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i * TOKEN_GAP_COST;
  for (let j = 0; j <= n; j++) dp[0][j] = j * TOKEN_GAP_COST;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = getFastTokenDistance(tokensA[i - 1].word, tokensB[j - 1].word);
      dp[i][j] = Math.min(
        dp[i - 1][j] + TOKEN_GAP_COST,     // deletion from A (gap in B)
        dp[i][j - 1] + TOKEN_GAP_COST,     // insertion to A (gap in A)
        dp[i - 1][j - 1] + subCost         // match or substitution
      );
    }
  }

  // Backtrack to extract optimal alignment
  let i = m;
  let j = n;
  const revAlignment: TokenAlignmentPair[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const subCost = getFastTokenDistance(tokensA[i - 1].word, tokensB[j - 1].word);
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + subCost)) < 1e-6) {
        revAlignment.push({
          tokenA: tokensA[i - 1].word,
          tokenB: tokensB[j - 1].word,
          distance: subCost
        });
        i--;
        j--;
        continue;
      }
    }

    if (i > 0 && Math.abs(dp[i][j] - (dp[i - 1][j] + TOKEN_GAP_COST)) < 1e-6) {
      revAlignment.push({
        tokenA: tokensA[i - 1].word,
        tokenB: null,
        distance: TOKEN_GAP_COST
      });
      i--;
      continue;
    }

    if (j > 0 && Math.abs(dp[i][j] - (dp[i][j - 1] + TOKEN_GAP_COST)) < 1e-6) {
      revAlignment.push({
        tokenA: null,
        tokenB: tokensB[j - 1].word,
        distance: TOKEN_GAP_COST
      });
      j--;
      continue;
    }
  }

  const alignment = revAlignment.reverse();
  const totalDistance = Number(dp[m][n].toFixed(4));
  const meanDistance = alignment.length > 0 ? Number((totalDistance / alignment.length).toFixed(4)) : 0;

  return {
    comparatorName: 'gapped_alignment',
    totalDistance,
    meanDistance,
    alignment
  };
}
