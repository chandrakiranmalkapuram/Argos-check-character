import {
  NATO_PHONETIC_ALPHABET,
  DIGIT_WORDS,
  POSITION_WEIGHTS,
  RETURNS_ALIASES
} from './constants.ts';
import type { CalculationResult } from './types.ts';

/**
 * Checks whether the location is a candidate for RFC format (4 alphabetical characters).
 */
export function isRfcCandidate(location: string): boolean {
  return /^[A-Za-z]{4}$/.test(location.trim().substring(0, 4));
}

/**
 * Calculates RFC (Regional Fulfilment Centre) 2-digit check character.
 * Formula:
 *   Letter value v_i = ASCII(char) - 65 (0 to 25)
 *   Base offset = 45
 *   Sum = 45 + (v0*5) + (v1*7) + (v2*7) + (v3*3)
 *   Check Digit = Sum % 99
 *   Check Character = DIGIT_WORDS[tens] + " " + DIGIT_WORDS[units]
 */
export function calculateRfcCheckChar(rawInput: string): CalculationResult {
  const trimmed = rawInput.trim().toUpperCase();

  // Handle returns aliases
  if (RETURNS_ALIASES.includes(trimmed as (typeof RETURNS_ALIASES)[number])) {
    return {
      kind: 'rfc',
      label: 'RFC',
      location: trimmed,
      spokenText: 'ROMEO ECHO TANGO SIERRA',
      checkChar: 'FOUR EIGHT',
      formulaDescription: 'Regional Fulfilment Centre Returns code',
      breakdown: [
        'Letters: R-E-T-S (values: 17, 4, 19, 18)',
        'Base 45 + (17×5) + (4×7) + (19×7) + (18×3) = 45 + 85 + 28 + 133 + 54 = 345',
        '345 mod 99 = 48 -> FOUR EIGHT'
      ],
      isValid: true
    };
  }

  const location = trimmed.substring(0, 4);

  if (location.length < 4) {
    return {
      kind: 'empty',
      label: 'RFC',
      location,
      spokenText: 'NULL',
      checkChar: 'NULL',
      formulaDescription: 'RFC format requires 4 letters (e.g. ABCD, RETS, ZZZZ)',
      breakdown: ['Enter a 4-letter RFC location to calculate'],
      isValid: false,
      errorMessage: 'RFC location must be exactly 4 letters (A-Z)'
    };
  }

  if (!/^[A-Z]{4}$/.test(location)) {
    return {
      kind: 'invalid',
      label: 'RFC',
      location,
      spokenText: 'INVALID',
      checkChar: 'N/A',
      formulaDescription: 'RFC location must consist solely of 4 alphabetical characters (A-Z)',
      breakdown: ['Non-alphabetical characters detected; RFC locations only accept 4 letters'],
      isValid: false,
      errorMessage: 'RFC locations only use 4 letters (A-Z), not numbers or symbols'
    };
  }

  const chars = location.split('');
  const spokenText = chars
    .map(c => NATO_PHONETIC_ALPHABET[c.charCodeAt(0) - 65] ?? '?')
    .join(' ');

  const breakdown: string[] = ['Base offset constant: 45'];
  let totalSum = 45;

  for (let i = 0; i < 4; i++) {
    const c = chars[i];
    const letterValue = c.charCodeAt(0) - 65;
    const weight = POSITION_WEIGHTS[i];
    const product = letterValue * weight;
    totalSum += product;
    breakdown.push(`Pos ${i + 1} ('${c}'): val ${letterValue} × weight ${weight} = ${product}`);
  }

  const checkDigit = totalSum % 99;
  const tens = Math.floor(checkDigit / 10);
  const units = checkDigit % 10;
  const checkChar = `${DIGIT_WORDS[tens]} ${DIGIT_WORDS[units]}`;

  breakdown.push(`Total Sum: ${totalSum}`);
  breakdown.push(`Modulo 99: ${totalSum} mod 99 = ${checkDigit.toString().padStart(2, '0')}`);
  breakdown.push(`Check Character: ${checkChar} (${tens}${units})`);

  return {
    kind: 'rfc',
    label: 'RFC',
    location,
    spokenText,
    checkChar,
    formulaDescription: 'RFC algorithm: 45 + Sum((letterIndex) × [5, 7, 7, 3]) modulo 99',
    breakdown,
    isValid: true
  };
}
