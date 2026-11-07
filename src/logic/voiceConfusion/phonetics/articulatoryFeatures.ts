/**
 * Articulatory feature tables and phoneme distance model for UK English warehouse picking acoustics.
 *
 * Model Assumption:
 * This model assesses articulatory similarity based on standard phonetic feature overlap
 * (place, manner, voicing for consonants; height, backness, length, rounding for vowels).
 * It is a rule-based acoustic approximation and does not represent measured audio waveform DTW
 * or trained neural speech-to-text confusion probabilities.
 */

export type ConsonantPlace =
  | 'bilabial'
  | 'labiodental'
  | 'dental'
  | 'alveolar'
  | 'postalveolar'
  | 'palatal'
  | 'velar'
  | 'glottal';

export type ConsonantManner =
  | 'plosive'
  | 'fricative'
  | 'affricate'
  | 'nasal'
  | 'approximant'
  | 'lateral';

export type ConsonantVoicing = 'voiced' | 'voiceless';

export interface ConsonantFeatures {
  isVowel: false;
  place: ConsonantPlace;
  manner: ConsonantManner;
  voicing: ConsonantVoicing;
}

export type VowelHeight = 'close' | 'close_mid' | 'open_mid' | 'open';
export type VowelBackness = 'front' | 'central' | 'back';
export type VowelLength = 'short' | 'long' | 'diphthong';
export type VowelRounding = 'unrounded' | 'rounded';

export interface VowelFeatures {
  isVowel: true;
  height: VowelHeight;
  backness: VowelBackness;
  length: VowelLength;
  rounding: VowelRounding;
}

export type PhonemeFeatures = ConsonantFeatures | VowelFeatures;

/**
 * Articulatory feature definitions for UK English phonemes used in warehouse vocabularies.
 * Standard IPA symbols are used as keys.
 */
export const PHONEME_FEATURE_TABLE: Record<string, PhonemeFeatures> = {
  // Plosives
  p: { isVowel: false, place: 'bilabial', manner: 'plosive', voicing: 'voiceless' },
  b: { isVowel: false, place: 'bilabial', manner: 'plosive', voicing: 'voiced' },
  t: { isVowel: false, place: 'alveolar', manner: 'plosive', voicing: 'voiceless' },
  d: { isVowel: false, place: 'alveolar', manner: 'plosive', voicing: 'voiced' },
  k: { isVowel: false, place: 'velar', manner: 'plosive', voicing: 'voiceless' },
  g: { isVowel: false, place: 'velar', manner: 'plosive', voicing: 'voiced' },

  // Fricatives
  f: { isVowel: false, place: 'labiodental', manner: 'fricative', voicing: 'voiceless' },
  v: { isVowel: false, place: 'labiodental', manner: 'fricative', voicing: 'voiced' },
  θ: { isVowel: false, place: 'dental', manner: 'fricative', voicing: 'voiceless' },
  ð: { isVowel: false, place: 'dental', manner: 'fricative', voicing: 'voiced' },
  s: { isVowel: false, place: 'alveolar', manner: 'fricative', voicing: 'voiceless' },
  z: { isVowel: false, place: 'alveolar', manner: 'fricative', voicing: 'voiced' },
  ʃ: { isVowel: false, place: 'postalveolar', manner: 'fricative', voicing: 'voiceless' },
  ʒ: { isVowel: false, place: 'postalveolar', manner: 'fricative', voicing: 'voiced' },
  h: { isVowel: false, place: 'glottal', manner: 'fricative', voicing: 'voiceless' },

  // Affricates
  tʃ: { isVowel: false, place: 'postalveolar', manner: 'affricate', voicing: 'voiceless' },
  dʒ: { isVowel: false, place: 'postalveolar', manner: 'affricate', voicing: 'voiced' },

  // Nasals
  m: { isVowel: false, place: 'bilabial', manner: 'nasal', voicing: 'voiced' },
  n: { isVowel: false, place: 'alveolar', manner: 'nasal', voicing: 'voiced' },
  ŋ: { isVowel: false, place: 'velar', manner: 'nasal', voicing: 'voiced' },

  // Approximants & Laterals
  l: { isVowel: false, place: 'alveolar', manner: 'lateral', voicing: 'voiced' },
  r: { isVowel: false, place: 'postalveolar', manner: 'approximant', voicing: 'voiced' },
  j: { isVowel: false, place: 'palatal', manner: 'approximant', voicing: 'voiced' },
  w: { isVowel: false, place: 'bilabial', manner: 'approximant', voicing: 'voiced' },

  // Short Vowels
  ɪ: { isVowel: true, height: 'close', backness: 'front', length: 'short', rounding: 'unrounded' },
  e: { isVowel: true, height: 'close_mid', backness: 'front', length: 'short', rounding: 'unrounded' },
  æ: { isVowel: true, height: 'open', backness: 'front', length: 'short', rounding: 'unrounded' },
  ʌ: { isVowel: true, height: 'open_mid', backness: 'central', length: 'short', rounding: 'unrounded' },
  ɒ: { isVowel: true, height: 'open', backness: 'back', length: 'short', rounding: 'rounded' },
  ʊ: { isVowel: true, height: 'close', backness: 'back', length: 'short', rounding: 'rounded' },
  ə: { isVowel: true, height: 'close_mid', backness: 'central', length: 'short', rounding: 'unrounded' },

  // Long Vowels
  iː: { isVowel: true, height: 'close', backness: 'front', length: 'long', rounding: 'unrounded' },
  ɑː: { isVowel: true, height: 'open', backness: 'back', length: 'long', rounding: 'unrounded' },
  ɔː: { isVowel: true, height: 'open_mid', backness: 'back', length: 'long', rounding: 'rounded' },
  uː: { isVowel: true, height: 'close', backness: 'back', length: 'long', rounding: 'rounded' },
  ɜː: { isVowel: true, height: 'close_mid', backness: 'central', length: 'long', rounding: 'unrounded' },

  // Diphthongs
  eɪ: { isVowel: true, height: 'close_mid', backness: 'front', length: 'diphthong', rounding: 'unrounded' },
  aɪ: { isVowel: true, height: 'open', backness: 'front', length: 'diphthong', rounding: 'unrounded' },
  ɔɪ: { isVowel: true, height: 'open_mid', backness: 'back', length: 'diphthong', rounding: 'rounded' },
  əʊ: { isVowel: true, height: 'close_mid', backness: 'back', length: 'diphthong', rounding: 'rounded' },
  aʊ: { isVowel: true, height: 'open', backness: 'back', length: 'diphthong', rounding: 'rounded' },
  ɪə: { isVowel: true, height: 'close', backness: 'central', length: 'diphthong', rounding: 'unrounded' },
  eə: { isVowel: true, height: 'open_mid', backness: 'central', length: 'diphthong', rounding: 'unrounded' },
  ʊə: { isVowel: true, height: 'close', backness: 'central', length: 'diphthong', rounding: 'rounded' }
};

// Documented cost weights
export const PHONEME_INDEL_COST = 0.8;
export const VOWEL_CONSONANT_MISMATCH_COST = 1.0;

/**
 * Computes the substitution distance between two phonemes based on feature overlap.
 * Scale: 0.0 (identical) to 1.0 (maximally distinct).
 *
 * Distance properties satisfied:
 * - Identity: getPhonemeDistance(a, a) === 0
 * - Symmetry: getPhonemeDistance(a, b) === getPhonemeDistance(b, a)
 * - Non-negativity: getPhonemeDistance(a, b) >= 0
 */
export function getPhonemeDistance(p1: string, p2: string): number {
  if (p1 === p2) return 0;

  const f1 = PHONEME_FEATURE_TABLE[p1];
  const f2 = PHONEME_FEATURE_TABLE[p2];

  if (!f1 || !f2) {
    return 1.0;
  }

  // Crossing vowel vs consonant boundary incurs maximum distance
  if (f1.isVowel !== f2.isVowel) {
    return VOWEL_CONSONANT_MISMATCH_COST;
  }

  if (!f1.isVowel && !f2.isVowel) {
    // Consonant feature distance (weighted: manner 0.45, place 0.40, voicing 0.15)
    let dist = 0;
    if (f1.manner !== f2.manner) dist += 0.45;
    if (f1.place !== f2.place) dist += 0.40;
    if (f1.voicing !== f2.voicing) dist += 0.15;
    return dist;
  }

  if (f1.isVowel && f2.isVowel) {
    // Vowel feature distance (weighted: height 0.35, backness 0.35, length 0.20, rounding 0.10)
    let dist = 0;
    if (f1.height !== f2.height) dist += 0.35;
    if (f1.backness !== f2.backness) dist += 0.35;
    if (f1.length !== f2.length) dist += 0.20;
    if (f1.rounding !== f2.rounding) dist += 0.10;
    return dist;
  }

  return 1.0;
}

/**
 * Computes the Levenshtein phoneme edit distance between two phoneme sequences.
 */
export function getPhonemeSequenceDistance(seq1: string[], seq2: string[]): number {
  const m = seq1.length;
  const n = seq2.length;

  if (m === 0) return n * PHONEME_INDEL_COST;
  if (n === 0) return m * PHONEME_INDEL_COST;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i * PHONEME_INDEL_COST;
  for (let j = 0; j <= n; j++) dp[0][j] = j * PHONEME_INDEL_COST;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = getPhonemeDistance(seq1[i - 1], seq2[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j] + PHONEME_INDEL_COST, // deletion
        dp[i][j - 1] + PHONEME_INDEL_COST, // insertion
        dp[i - 1][j - 1] + subCost         // substitution
      );
    }
  }

  const rawDist = dp[m][n];
  const maxLen = Math.max(m, n);
  // Normalized to [0, 1] range
  return maxLen > 0 ? Number((rawDist / maxLen).toFixed(4)) : 0;
}
