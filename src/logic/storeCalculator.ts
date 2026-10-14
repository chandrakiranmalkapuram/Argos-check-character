import {
  NATO_PHONETIC_ALPHABET,
  DIGIT_WORDS,
  POSITION_WEIGHTS,
  FIXED_CHECK_CHARACTERS,
  RETURNS_ALIASES
} from './constants.ts';
import type { CalculationResult } from './types.ts';

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
 */
export function formatStoreSpokenText(location: string, individualWords: string[]): string {
  const upper = location.toUpperCase();
  const prefix2 = upper.substring(0, 2);
  const firstChar = upper[0] ?? '';
  const lastChar = upper.slice(-1);

  let phrase = individualWords.join(' ');

  if (firstChar === 'J') {
    // Jewellery: e.g. J1PG -> JEWELLERY ONE PAPA GOLF
    phrase = `JEWELLERY ${individualWords.slice(1).join(' ')}`;
  } else if (firstChar === 'S') {
    // Security: e.g. S1PG -> SECURITY ONE PAPA GOLF
    phrase = `SECURITY ${individualWords.slice(1).join(' ')}`;
  } else if (firstChar === 'L' && individualWords.length >= 4) {
    // Linbin: e.g. L10A -> ONE ZERO LINBIN ALPHA
    phrase = `${individualWords.slice(1, 3).join(' ')} LINBIN ${individualWords[3]}`;
  } else if (firstChar === 'Z' && individualWords.length >= 4) {
    // Bulk: e.g. Z10A -> ONE ZERO BULK ALPHA
    phrase = `${individualWords.slice(1, 3).join(' ')} BULK ${individualWords[3]}`;
  }

  // Relative location markers (+ / -)
  if (lastChar === '+') {
    phrase = `AFTER ${individualWords.slice(0, 3).join(' ')}`;
  } else if (lastChar === '-') {
    phrase = `BEFORE ${individualWords.slice(0, 3).join(' ')}`;
  }

  // Fixed zone names
  if (prefix2 === 'CA') {
    phrase = `CASH OFFICE ${individualWords.slice(2).join(' ')}`;
  } else if (prefix2 === 'CP') {
    phrase = `COLLECTION POINT ${individualWords.slice(2).join(' ')}`;
  } else if (upper === 'RETS' || RETURNS_ALIASES.includes(upper as (typeof RETURNS_ALIASES)[number])) {
    phrase = 'RETURNS';
  } else if (upper.startsWith('DPA')) {
    phrase = 'DPA';
  } else if (upper.startsWith('SOB')) {
    phrase = 'SOB';
  }

  return phrase;
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
