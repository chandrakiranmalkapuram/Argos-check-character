import { NATO_PHONETIC_ALPHABET } from './constants.ts';
import { calculateStoreCheckChar } from './storeCalculator.ts';
import type { ReverseLookupResult } from './types.ts';

// Precomputed cache map: CheckCharacter -> { [aisle: string]: string[] }
let cachedReverseIndex: Map<string, Map<string, string[]>> | null = null;

/**
 * Builds the inverted index mapping each of the 26 NATO phonetic check characters
 * to all store locations from 00AA to 99ZZ grouped by aisle (00..99).
 *
 * Invariant I1: Calls calculateStoreCheckChar for every location. No duplicate formula.
 */
export function buildReverseIndex(): Map<string, Map<string, string[]>> {
  if (cachedReverseIndex) {
    return cachedReverseIndex;
  }

  const index = new Map<string, Map<string, string[]>>();

  // Initialize empty map for all 26 NATO words
  for (const word of NATO_PHONETIC_ALPHABET) {
    index.set(word, new Map<string, string[]>());
  }

  const letters: string[] = [];
  for (let i = 0; i < 26; i++) {
    letters.push(String.fromCharCode(65 + i));
  }

  // Enumerate standard store locations (00AA - 99ZZ) in deterministic order
  for (let a = 0; a <= 99; a++) {
    const aisleStr = a.toString().padStart(2, '0');

    for (let b = 0; b < 26; b++) {
      const bayChar = letters[b];

      for (let s = 0; s < 26; s++) {
        const shelfChar = letters[s];
        const location = `${aisleStr}${bayChar}${shelfChar}`;

        // INVARIANT I1: calculateStoreCheckChar is the single source of truth
        const checkWord = calculateStoreCheckChar(location).checkChar;

        const aisleMap = index.get(checkWord);
        if (aisleMap) {
          let list = aisleMap.get(aisleStr);
          if (!list) {
            list = [];
            aisleMap.set(aisleStr, list);
          }
          list.push(location);
        }
      }
    }
  }

  cachedReverseIndex = index;
  return index;
}

/**
 * Performs reverse lookup to find all locations using a given phonetic check character.
 */
export function performReverseLookup(query: string): ReverseLookupResult | null {
  const normalized = query.trim().toUpperCase();
  if (!NATO_PHONETIC_ALPHABET.includes(normalized)) {
    return null;
  }

  const index = buildReverseIndex();
  const aisleMap = index.get(normalized);

  if (!aisleMap) {
    return null;
  }

  const aisles: { aisle: string; locations: string[] }[] = [];
  let totalMatches = 0;

  for (let i = 0; i <= 99; i++) {
    const aisleKey = i.toString().padStart(2, '0');
    const locations = aisleMap.get(aisleKey);
    if (locations && locations.length > 0) {
      aisles.push({
        aisle: aisleKey,
        locations
      });
      totalMatches += locations.length;
    }
  }

  return {
    checkChar: normalized,
    phoneticWord: normalized,
    totalMatches,
    aisles
  };
}

/**
 * Returns true if the query is a recognized NATO phonetic character word.
 */
export function isPhoneticWord(query: string): boolean {
  return NATO_PHONETIC_ALPHABET.includes(query.trim().toUpperCase());
}
