import { NATO_LEXICON, getTokenDistance, type PronunciationMode } from './lexicon.ts';

export interface TokenDistanceMatrix {
  tokens: string[];
  matrix: Map<string, Map<string, number>>;
  lookup(tokenA: string, tokenB: string): number;
}

/**
 * Canonical named constant for model-similar token threshold.
 * Derived from the ~p10 natural distribution of the 946 lexicon token pairs.
 * Pairs with distance <= MODEL_SIMILAR_TOKEN_THRESHOLD are considered model-similar.
 */
export const MODEL_SIMILAR_TOKEN_THRESHOLD = 0.55;

let cachedNatoMatrix: TokenDistanceMatrix | null = null;

/**
 * Precomputes and caches the pairwise token distance matrix across all active tokens
 * in the NATO lexicon (digits, NATO words, zone words, relative markers).
 */
export function buildTokenDistanceMatrix(mode: PronunciationMode = 'nato'): TokenDistanceMatrix {
  if (mode === 'nato' && cachedNatoMatrix) {
    return cachedNatoMatrix;
  }

  const lexicon = mode === 'nato' ? NATO_LEXICON : {};
  const tokens = Object.keys(lexicon).sort();
  const matrix = new Map<string, Map<string, number>>();

  for (const t of tokens) {
    matrix.set(t, new Map<string, number>());
  }

  for (let i = 0; i < tokens.length; i++) {
    const tA = tokens[i];
    matrix.get(tA)?.set(tA, 0);

    for (let j = i + 1; j < tokens.length; j++) {
      const tB = tokens[j];
      const dist = getTokenDistance(tA, tB, mode);
      matrix.get(tA)?.set(tB, dist);
      matrix.get(tB)?.set(tA, dist);
    }
  }

  const result: TokenDistanceMatrix = {
    tokens,
    matrix,
    lookup(tA: string, tB: string): number {
      if (tA === tB) return 0;
      const row = matrix.get(tA);
      if (row && row.has(tB)) {
        return row.get(tB)!;
      }
      return getTokenDistance(tA, tB, mode);
    }
  };

  if (mode === 'nato') {
    cachedNatoMatrix = result;
  }

  return result;
}

/**
 * Fast O(1) pairwise token distance lookup using the precomputed matrix.
 */
export function getFastTokenDistance(tokenA: string, tokenB: string): number {
  if (tokenA === tokenB) return 0;
  const table = buildTokenDistanceMatrix('nato');
  return table.lookup(tokenA, tokenB);
}
