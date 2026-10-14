import { NATO_PHONETIC_ALPHABET, POSITION_WEIGHTS } from './constants.ts';
import type { ReverseLookupResult } from './types.ts';

// Precomputed cache map: CheckCharacter -> { [aisle: string]: string[] }
let cachedReverseIndex: Map<string, Map<string, string[]>> | null = null;

/**
 * Builds the inverted index mapping each of the 26 NATO phonetic check characters
 * to all store locations from 00AA to 99ZZ grouped by aisle (00..99).
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

  // Pre-calculate ASCII values and weighted components
  // c0 in '0'..'9', c1 in '0'..'9', c2 in 'A'..'Z', c3 in 'A'..'Z'
  const ascii0to9: { char: string; code: number }[] = [];
  for (let d = 0; d <= 9; d++) {
    ascii0to9.push({ char: d.toString(), code: 48 + d });
  }

  const asciiAtoZ: { char: string; code: number }[] = [];
  for (let l = 0; l < 26; l++) {
    asciiAtoZ.push({ char: String.fromCharCode(65 + l), code: 65 + l });
  }

  const w0 = POSITION_WEIGHTS[0]; // 5
  const w1 = POSITION_WEIGHTS[1]; // 7
  const w2 = POSITION_WEIGHTS[2]; // 7
  const w3 = POSITION_WEIGHTS[3]; // 3

  for (let a = 0; a <= 99; a++) {
    const d0 = Math.floor(a / 10);
    const d1 = a % 10;
    const aisleStr = a.toString().padStart(2, '0');

    const sumAisle = ascii0to9[d0].code * w0 + ascii0to9[d1].code * w1;

    for (let b = 0; b < 26; b++) {
      const bayObj = asciiAtoZ[b];
      const sumBay = sumAisle + bayObj.code * w2;

      for (let s = 0; s < 26; s++) {
        const shelfObj = asciiAtoZ[s];
        const total = sumBay + shelfObj.code * w3;
        const remainder = total % 26;
        const checkWord = NATO_PHONETIC_ALPHABET[remainder];

        const aisleMap = index.get(checkWord);
        if (aisleMap) {
          let list = aisleMap.get(aisleStr);
          if (!list) {
            list = [];
            aisleMap.set(aisleStr, list);
          }
          list.push(`${aisleStr}${bayObj.char}${shelfObj.char}`);
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
