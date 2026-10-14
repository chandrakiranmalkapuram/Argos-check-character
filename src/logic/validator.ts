import { NATO_PHONETIC_ALPHABET, RETURNS_ALIASES, FIXED_CHECK_CHARACTERS } from './constants.ts';
import type { CheckMode, ValidationState } from './types.ts';

/**
 * Validates and classifies an input query.
 */
export function validateAndClassifyInput(input: string, activeMode: CheckMode): ValidationState {
  const raw = input.trim();
  const upper = raw.toUpperCase();

  if (raw === '') {
    return {
      isValid: false,
      detectedMode: activeMode,
      formattedInput: '',
      guidanceMessage: 'Enter a shelf location (e.g. 10AK, J1PG, ABCD) or a NATO word for reverse lookup.'
    };
  }

  // Check if it's a NATO phonetic word for reverse lookup
  if (NATO_PHONETIC_ALPHABET.includes(upper)) {
    return {
      isValid: true,
      detectedMode: 'reverse',
      formattedInput: upper,
      guidanceMessage: `Reverse lookup detected: finding all store locations using '${upper}'`
    };
  }

  // Check known special aliases
  if (RETURNS_ALIASES.includes(upper as (typeof RETURNS_ALIASES)[number])) {
    return {
      isValid: true,
      detectedMode: activeMode === 'rfc' ? 'rfc' : 'store',
      formattedInput: upper,
      guidanceMessage: 'Recognized special Returns zone code.'
    };
  }

  if (upper in FIXED_CHECK_CHARACTERS) {
    return {
      isValid: true,
      detectedMode: 'store',
      formattedInput: upper,
      guidanceMessage: `Recognized special fixed zone code: ${upper}.`
    };
  }

  // Clean to 4-character code
  const code = upper.substring(0, 4);

  // If active mode is explicitly RFC
  if (activeMode === 'rfc') {
    const isLetters = /^[A-Z]{4}$/.test(code);
    return {
      isValid: isLetters,
      detectedMode: 'rfc',
      formattedInput: code,
      guidanceMessage: isLetters
        ? 'Valid 4-letter RFC location.'
        : 'RFC requires exactly 4 letters (A-Z), e.g. ABCD, RETS.'
    };
  }

  // If active mode is explicitly Store
  if (activeMode === 'store') {
    const isValidStore = code.length === 4;
    return {
      isValid: isValidStore,
      detectedMode: 'store',
      formattedInput: code,
      guidanceMessage: isValidStore
        ? 'Valid 4-character Store location.'
        : 'Store locations require 4 characters (e.g. 10AK, J1PG, 10A+).'
    };
  }

  // Auto mode detection
  if (/^[A-Z]{4}$/.test(code)) {
    return {
      isValid: true,
      detectedMode: 'auto',
      formattedInput: code,
      guidanceMessage: '4-letter code matches both Store and RFC formats (displaying both).'
    };
  }

  if (code.length === 4) {
    return {
      isValid: true,
      detectedMode: 'store',
      formattedInput: code,
      guidanceMessage: 'Standard store shelf format.'
    };
  }

  return {
    isValid: false,
    detectedMode: 'auto',
    formattedInput: code,
    guidanceMessage: 'Codes must be at least 4 characters long (e.g. 10AK).'
  };
}
