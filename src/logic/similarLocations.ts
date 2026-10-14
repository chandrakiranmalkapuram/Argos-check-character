import { STORE_PREFIX_MAP } from './constants.ts';
import { calculateStoreCheckChar, getSpokenWord } from './storeCalculator.ts';
import type { SimilarLocation } from './types.ts';

const VALID_LOCATION_PATTERNS: RegExp[] = [
  /^\d\d[A-Z][A-Z]$/, // Standard: e.g. 10AK
  /^[JS]\d[A-Z][A-Z]$/, // Jewellery or Security: e.g. S1PG, J7AZ
  /^[LZ]\d\d[A-Z]$/, // Linbin or Bulk: e.g. L10A, Z10A
  /^C[AP]\d\d$/ // Cash Office or Collection Point: e.g. CA12, CP12
];

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Validates whether a 4-character code matches a recognized store location pattern.
 */
export function isValidStorePattern(loc: string): boolean {
  return VALID_LOCATION_PATTERNS.some(pat => pat.test(loc));
}

/**
 * Returns the spoken word for a character at position i within a location code,
 * accounting for prefix designations (e.g., J -> JEWELLERY at index 0).
 */
export function getWordAtPosition(location: string, index: number): string {
  if (index === 0 && location[0] in STORE_PREFIX_MAP) {
    return STORE_PREFIX_MAP[location[0]] ?? getSpokenWord(location[0]);
  }
  return getSpokenWord(location[index] ?? '');
}

/**
 * Finds locations that are 1 voice mistake away (either a single misheard character
 * or two swapped adjacent characters) that happen to produce the exact same check character.
 * This directly alerts stockroom pickers to potential stock misplacement.
 */
export function findSimilarLocations(rawInput: string): SimilarLocation[] {
  const location = rawInput.trim().toUpperCase().substring(0, 4);

  if (!isValidStorePattern(location)) {
    return [];
  }

  const primaryResult = calculateStoreCheckChar(location);
  if (!primaryResult.isValid || primaryResult.checkChar === 'NULL') {
    return [];
  }

  const targetCheckChar = primaryResult.checkChar;
  const matchesMap = new Map<string, SimilarLocation>();

  function registerCandidate(candidate: string, reason: string): void {
    if (
      candidate !== location &&
      !matchesMap.has(candidate) &&
      isValidStorePattern(candidate)
    ) {
      const candidateResult = calculateStoreCheckChar(candidate);
      if (candidateResult.checkChar === targetCheckChar) {
        matchesMap.set(candidate, {
          location: candidate,
          spokenText: candidateResult.spokenText,
          checkChar: candidateResult.checkChar,
          reason
        });
      }
    }
  }

  // 1. Check single-character replacement across all 4 positions
  for (let pos = 0; pos < 4; pos++) {
    for (const char of ALPHANUMERIC_CHARS) {
      const candidate = location.substring(0, pos) + char + location.substring(pos + 1);
      const replacedWord = getWordAtPosition(candidate, pos);
      const originalWord = getWordAtPosition(location, pos);
      registerCandidate(candidate, `${replacedWord} heard as ${originalWord}`);
    }
  }

  // 2. Check adjacent character transpositions (only digits with digits, or letters with letters)
  for (let pos = 0; pos < 3; pos++) {
    const chars = location.split('');
    const charA = chars[pos];
    const charB = chars[pos + 1];

    const isDigitA = /\d/.test(charA);
    const isDigitB = /\d/.test(charB);

    if (isDigitA === isDigitB) {
      chars[pos] = charB;
      chars[pos + 1] = charA;
      const transposed = chars.join('');
      const wordA = getWordAtPosition(location, pos);
      const wordB = getWordAtPosition(location, pos + 1);
      registerCandidate(transposed, `${wordA} and ${wordB} swapped`);
    }
  }

  return Array.from(matchesMap.values());
}
