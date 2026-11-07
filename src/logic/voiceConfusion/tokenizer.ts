import {
  DIGIT_WORDS,
  NATO_PHONETIC_ALPHABET,
  RETURNS_ALIASES
} from '../constants.ts';

export type SpokenTokenType =
  | 'digit'
  | 'nato_letter'
  | 'zone'
  | 'relative_marker'
  | 'fixed'
  | 'unknown';

export interface SpokenToken {
  word: string;
  type: SpokenTokenType;
  rawChar?: string;
}

/**
 * Returns the spoken word for a single character (digit, uppercase letter, or '?').
 */
export function getCharSpokenWord(char: string): string {
  if (/^\d$/.test(char)) {
    return DIGIT_WORDS[parseInt(char, 10)] ?? '?';
  }
  if (/^[A-Z]$/.test(char)) {
    const index = char.charCodeAt(0) - 65;
    return NATO_PHONETIC_ALPHABET[index] ?? '?';
  }
  return '?';
}

/**
 * Categorizes a spoken word into its token type.
 */
export function getTokenType(word: string): SpokenTokenType {
  if (DIGIT_WORDS.includes(word)) return 'digit';
  if (NATO_PHONETIC_ALPHABET.includes(word)) return 'nato_letter';
  if (
    word === 'JEWELLERY' ||
    word === 'SECURITY' ||
    word === 'LINBIN' ||
    word === 'BULK' ||
    word === 'CASH OFFICE' ||
    word === 'COLLECTION POINT'
  ) {
    return 'zone';
  }
  if (word === 'AFTER' || word === 'BEFORE') return 'relative_marker';
  if (word === 'DPA' || word === 'SOB' || word === 'RETURNS') return 'fixed';
  return 'unknown';
}

/**
 * Tokenizes any store location string into an ordered sequence of SpokenTokens
 * matching Argos warehouse voice-directed picking headset rules.
 *
 * This function preserves all formatting and slot-ordering quirks of formatStoreSpokenText,
 * guaranteeing 100% output equivalence across all inputs (grammar-valid, relative, fixed,
 * returns, and non-grammar words).
 */
export function tokenizeStoreLocation(rawInput: string): SpokenToken[] {
  const upper = rawInput.trim().toUpperCase();
  const prefix2 = upper.substring(0, 2);
  const firstChar = upper[0] ?? '';
  const lastChar = upper.slice(-1);

  // 1. Check fixed system codes and returns aliases (highest precedence in formatStoreSpokenText)
  if (upper === 'RETS' || RETURNS_ALIASES.includes(upper as (typeof RETURNS_ALIASES)[number])) {
    return [{ word: 'RETURNS', type: 'fixed', rawChar: upper }];
  }
  if (upper.startsWith('DPA')) {
    return [{ word: 'DPA', type: 'fixed', rawChar: 'DPA' }];
  }
  if (upper.startsWith('SOB')) {
    return [{ word: 'SOB', type: 'fixed', rawChar: 'SOB' }];
  }

  // 2. Base character tokenization
  const chars = upper.split('');
  const baseWords = chars.map(getCharSpokenWord);

  // 3. Fixed zone names: CA and CP
  if (prefix2 === 'CA') {
    const tokens: SpokenToken[] = [
      { word: 'CASH OFFICE', type: 'zone', rawChar: 'CA' }
    ];
    for (let i = 2; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  if (prefix2 === 'CP') {
    const tokens: SpokenToken[] = [
      { word: 'COLLECTION POINT', type: 'zone', rawChar: 'CP' }
    ];
    for (let i = 2; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  // 4. Relative location markers (+ / -)
  if (lastChar === '+') {
    const tokens: SpokenToken[] = [
      { word: 'AFTER', type: 'relative_marker', rawChar: '+' }
    ];
    for (let i = 0; i < Math.min(3, chars.length); i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  if (lastChar === '-') {
    const tokens: SpokenToken[] = [
      { word: 'BEFORE', type: 'relative_marker', rawChar: '-' }
    ];
    for (let i = 0; i < Math.min(3, chars.length); i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  // 5. Zone prefixes: J, S, L, Z
  if (firstChar === 'J') {
    // Jewellery: e.g. J1PG -> JEWELLERY ONE PAPA GOLF
    const tokens: SpokenToken[] = [
      { word: 'JEWELLERY', type: 'zone', rawChar: 'J' }
    ];
    for (let i = 1; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  if (firstChar === 'S') {
    // Security: e.g. S1PG -> SECURITY ONE PAPA GOLF
    const tokens: SpokenToken[] = [
      { word: 'SECURITY', type: 'zone', rawChar: 'S' }
    ];
    for (let i = 1; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  if (firstChar === 'L' && baseWords.length >= 4) {
    // Linbin: e.g. L10A -> ONE ZERO LINBIN ALPHA
    // Slots: individualWords[1], individualWords[2], 'LINBIN', individualWords[3], ...rest
    const tokens: SpokenToken[] = [
      { word: baseWords[1], type: getTokenType(baseWords[1]), rawChar: chars[1] },
      { word: baseWords[2], type: getTokenType(baseWords[2]), rawChar: chars[2] },
      { word: 'LINBIN', type: 'zone', rawChar: 'L' },
      { word: baseWords[3], type: getTokenType(baseWords[3]), rawChar: chars[3] }
    ];
    for (let i = 4; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  if (firstChar === 'Z' && baseWords.length >= 4) {
    // Bulk: e.g. Z10A -> ONE ZERO BULK ALPHA
    // Slots: individualWords[1], individualWords[2], 'BULK', individualWords[3], ...rest
    const tokens: SpokenToken[] = [
      { word: baseWords[1], type: getTokenType(baseWords[1]), rawChar: chars[1] },
      { word: baseWords[2], type: getTokenType(baseWords[2]), rawChar: chars[2] },
      { word: 'BULK', type: 'zone', rawChar: 'Z' },
      { word: baseWords[3], type: getTokenType(baseWords[3]), rawChar: chars[3] }
    ];
    for (let i = 4; i < chars.length; i++) {
      tokens.push({ word: baseWords[i], type: getTokenType(baseWords[i]), rawChar: chars[i] });
    }
    return tokens;
  }

  // 6. Standard sequential token mapping
  return chars.map((c, i) => ({
    word: baseWords[i],
    type: getTokenType(baseWords[i]),
    rawChar: c
  }));
}

/**
 * Converts a sequence of SpokenTokens into the spoken text phrase string.
 */
export function tokensToSpokenText(tokens: SpokenToken[]): string {
  return tokens.map(t => t.word).join(' ');
}
