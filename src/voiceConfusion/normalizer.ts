/**
 * Location code normalisation utilities for Voice Confusion Risk.
 * 
 * Rules:
 * - Trims leading and trailing whitespace.
 * - Converts to uppercase for case-insensitive matching.
 * - Strictly PRESERVES original intended characters (e.g. O vs 0, I vs 1).
 *   Never silently converts ambiguous characters, as phonetic distinction
 *   between O and 0 is critical in stockrooms.
 */

/**
 * Normalises a location code for storage, indexing, and comparison.
 */
export function normaliseLocationCode(code: string): string {
  if (!code) return '';
  return code.trim().toUpperCase();
}

/**
 * Checks whether two location codes are equivalent after standard normalisation.
 */
export function areLocationsEquivalent(locA: string, locB: string): boolean {
  return normaliseLocationCode(locA) === normaliseLocationCode(locB);
}

/**
 * Generates the unique composite key used for duplicate detection.
 * Format: HEARD::ACTUAL::REASON
 */
export function getReportCompositeKey(
  heardLocation: string,
  actualLocation: string,
  reason: string
): string {
  return `${normaliseLocationCode(heardLocation)}::${normaliseLocationCode(actualLocation)}::${reason.trim()}`;
}

/**
 * Detects whether a code contains character pairs frequently confused in speech or vision
 * (such as O and 0, or I and 1), providing helpful non-destructive tips if needed.
 */
export function detectAmbiguousCharacters(code: string): {
  hasDigitZero: boolean;
  hasLetterO: boolean;
  hasDigitOne: boolean;
  hasLetterI: boolean;
} {
  const upper = normaliseLocationCode(code);
  return {
    hasDigitZero: upper.includes('0'),
    hasLetterO: upper.includes('O'),
    hasDigitOne: upper.includes('1'),
    hasLetterI: upper.includes('I')
  };
}
