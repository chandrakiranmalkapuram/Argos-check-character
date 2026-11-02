import {
  NATO_PHONETIC_ALPHABET,
  DIGIT_WORDS,
  POSITION_WEIGHTS,
  FIXED_CHECK_CHARACTERS,
  RETURNS_ALIASES
} from './constants.ts';
import type { CalculationResult } from './types.ts';
import { tokenizeStoreLocation, tokensToSpokenText } from './voiceConfusion/tokenizer.ts';

/**
 * Converts a single character into its phonetic or spoken word.
 */
export function getSpokenWord(char: string): string {
  if (/^[0-9]$/.test(char)) {
    return DIGIT_WORDS[parseInt(char, 10)] ?? '?';
  }
  if (/^[A-Z]$/.test(char)) {
    const index = char.charCodeAt(0) - 65;
    return NATO_PHONETIC_ALPHABET[index] ?? '?';
  }
  return '?';
}

/**
 * Constructs the spoken voice-picking phrase matching headset conventions.
 * Delegates to the unified tokenizer core while preserving the exported function API.
 */
export function formatStoreSpokenText(location: string, _individualWords?: string[]): string {
  return tokensToSpokenText(tokenizeStoreLocation(location));
}

/**
 * Computes the Store Check Character for a 4-character shelf code.
 * Formula:
 *   Sum = (ASCII(c0)*5) + (ASCII(c1)*7) + (ASCII(c2)*7) + (ASCII(c3)*3)
 *   Index = Sum % 26
 *   Check Character = NATO[Index]
 */
export function calculateStoreCheckChar(rawInput: string): CalculationResult {
  const trimmed = rawInput.trim().toUpperCase();

  // Handle fixed aliases (e.g. RETURNS)
  if (RETURNS_ALIASES.includes(trimmed as (typeof RETURNS_ALIASES)[number])) {
    return {
      kind: 'fixed',
      label: 'Store',
      location: trimmed,
      spokenText: 'RETURNS',
      checkChar: 'OSCAR',
      formulaDescription: 'Pre-assigned fixed operational code for Returns location',
      breakdown: ['Static system mapping: RETURNS -> OSCAR (Store) / FOUR EIGHT (RFC)'],
      isValid: true
    };
  }

  // Truncate to first 4 characters for calculation
  const location = trimmed.substring(0, 4);

  // Check fixed dictionary codes
  if (location in FIXED_CHECK_CHARACTERS) {
    const fixedChar = FIXED_CHECK_CHARACTERS[location] ?? 'UNKNOWN';
    return {
      kind: 'fixed',
      label: 'Store',
      location,
      spokenText: location,
      checkChar: fixedChar,
      formulaDescription: `Pre-assigned fixed code for ${location}`,
      breakdown: [`Static system mapping: ${location} -> ${fixedChar}`],
      isValid: true
    };
  }

  // If input is too short (< 4 chars)
  if (location.length < 4) {
    return {
      kind: 'empty',
      label: 'Store',
      location,
      spokenText: 'NULL',
      checkChar: 'NULL',
      formulaDescription: 'Requires a complete 4-character shelf code',
      breakdown: ['Enter 4 characters (e.g. 10AK, S1PG, L10A) to calculate'],
      isValid: false,
      errorMessage: 'Location code must be at least 4 characters long'
    };
  }

  const chars = location.split('');
  const spokenWords = chars.map(getSpokenWord);
  const spokenText = formatStoreSpokenText(location, spokenWords);

  const breakdown: string[] = [];
  let totalSum = 0;

  for (let i = 0; i < 4; i++) {
    const c = chars[i];
    const ascii = c.charCodeAt(0);
    const weight = POSITION_WEIGHTS[i];
    const product = ascii * weight;
    totalSum += product;
    breakdown.push(`Pos ${i + 1} ('${c}'): ASCII ${ascii} × weight ${weight} = ${product}`);
  }

  const remainder = totalSum % 26;
  const checkChar = NATO_PHONETIC_ALPHABET[remainder] ?? 'UNKNOWN';

  breakdown.push(`Total Sum: ${totalSum}`);
  breakdown.push(`Modulo 26: ${totalSum} mod 26 = ${remainder} -> ${checkChar}`);

  return {
    kind: 'store',
    label: 'Store',
    location,
    spokenText,
    checkChar,
    formulaDescription: 'Store algorithm: Sum of ASCII codes weighted by [5, 7, 7, 3] modulo 26',
    breakdown,
    isValid: true
  };
}

/**
 * Direct check character string getter for a Store shelf location.
 */
export function calculateStoreCheckCharacter(rawInput: string): string {
  return calculateStoreCheckChar(rawInput).checkChar;
}

