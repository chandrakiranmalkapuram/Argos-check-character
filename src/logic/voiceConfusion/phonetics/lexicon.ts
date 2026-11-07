import { getPhonemeSequenceDistance } from './articulatoryFeatures.ts';

export type PronunciationMode = 'nato' | 'letter_names';

/**
 * Model Assumptions:
 * 1. Accents: Standard British English (RP / General Southern British) articulatory profiles.
 * 2. Variant matching: Words with recognized pronunciation variants (e.g. JEWELLERY, QUEBEC, PAPA)
 *    provide multiple phoneme lists; comparison takes the minimum distance between any pair of variants.
 * 3. ZED convention: In the separate letter-names mode (disabled by default), Z is 'zed' (/zɛd/), not 'zee'.
 * 4. Digit zero: Zero is pronounced ZERO (/ˈzɪərəʊ/), not OH (/əʊ/), per stockroom protocol D7.
 * 5. Compound zone tokens: Multi-word zone names (CASH OFFICE, COLLECTION POINT) are treated as
 *    continuous articulatory phoneme streams matching warehouse picking headsets.
 */
export const NATO_LEXICON: Record<string, string[][]> = {
  // Digits (0 - 9)
  ZERO: [['z', 'ɪə', 'r', 'əʊ']],
  ONE: [['w', 'ʌ', 'n']],
  TWO: [['t', 'uː']],
  THREE: [['θ', 'r', 'iː']],
  FOUR: [['f', 'ɔː']],
  FIVE: [['f', 'aɪ', 'v']],
  SIX: [['s', 'ɪ', 'k', 's']],
  SEVEN: [['s', 'e', 'v', 'ə', 'n']],
  EIGHT: [['eɪ', 't']],
  NINE: [['n', 'aɪ', 'n']],

  // NATO Phonetic Alphabet (A - Z)
  ALPHA: [['æ', 'l', 'f', 'ə']],
  BRAVO: [['b', 'r', 'ɑː', 'v', 'əʊ']],
  CHARLIE: [['tʃ', 'ɑː', 'l', 'iː']],
  DELTA: [['d', 'e', 'l', 't', 'ə']],
  ECHO: [['e', 'k', 'əʊ']],
  FOXTROT: [['f', 'ɒ', 'k', 's', 't', 'r', 'ɒ', 't']],
  GOLF: [['g', 'ɒ', 'l', 'f']],
  HOTEL: [['h', 'əʊ', 't', 'e', 'l']],
  INDIA: [['ɪ', 'n', 'd', 'iː', 'ə'], ['ɪ', 'n', 'd', 'j', 'ə']],
  JULIET: [['dʒ', 'uː', 'l', 'i', 'e', 't']],
  KILO: [['k', 'iː', 'l', 'əʊ']],
  LIMA: [['l', 'iː', 'm', 'ə']],
  MIKE: [['m', 'aɪ', 'k']],
  NOVEMBER: [['n', 'əʊ', 'v', 'e', 'm', 'b', 'ə']],
  OSCAR: [['ɒ', 's', 'k', 'ə']],
  PAPA: [['p', 'ə', 'p', 'ɑː'], ['p', 'ɑː', 'p', 'ə']],
  QUEBEC: [['k', 'w', 'ɪ', 'b', 'e', 'k'], ['k', 'e', 'b', 'e', 'k']],
  ROMEO: [['r', 'əʊ', 'm', 'i', 'əʊ']],
  SIERRA: [['s', 'i', 'e', 'r', 'ə']],
  TANGO: [['t', 'æ', 'ŋ', 'g', 'əʊ']],
  UNIFORM: [['j', 'uː', 'n', 'ɪ', 'f', 'ɔː', 'm']],
  VICTOR: [['v', 'ɪ', 'k', 't', 'ə']],
  WHISKEY: [['w', 'ɪ', 's', 'k', 'iː']],
  'X-RAY': [['e', 'k', 's', 'r', 'eɪ']],
  YANKEE: [['j', 'æ', 'ŋ', 'k', 'iː']],
  ZULU: [['z', 'uː', 'l', 'uː']],

  // Zone Tokens
  JEWELLERY: [
    ['dʒ', 'uː', 'ə', 'l', 'r', 'iː'],
    ['dʒ', 'uː', 'l', 'r', 'iː']
  ],
  SECURITY: [
    ['s', 'ɪ', 'k', 'j', 'ʊə', 'r', 'ə', 't', 'iː'],
    ['s', 'ə', 'k', 'j', 'ʊə', 'r', 'ə', 't', 'iː']
  ],
  LINBIN: [['l', 'ɪ', 'n', 'b', 'ɪ', 'n']],
  BULK: [['b', 'ʌ', 'l', 'k']],
  'CASH OFFICE': [['k', 'æ', 'ʃ', 'ɒ', 'f', 'ɪ', 's']],
  'COLLECTION POINT': [['k', 'ə', 'l', 'e', 'k', 'ʃ', 'ə', 'n', 'p', 'ɔɪ', 'n', 't']],

  // Relative Location Suffix Markers
  AFTER: [['ɑː', 'f', 't', 'ə']],
  BEFORE: [['b', 'ɪ', 'f', 'ɔː']]
};

/**
 * British English Letter-Name Pronunciation Lexicon.
 * SHIPPED DISABLED BY DEFAULT behind explicit flag with zero UI exposure.
 * Strictly separates UK ZED (/zɛd/) from NATO ZULU (/zuːluː/).
 */
export const LETTER_NAME_LEXICON: Record<string, string[][]> = {
  A: [['eɪ']],
  B: [['b', 'iː']],
  C: [['s', 'iː']],
  D: [['d', 'iː']],
  E: [['iː']],
  F: [['e', 'f']],
  G: [['dʒ', 'iː']],
  H: [['eɪ', 'tʃ']],
  I: [['aɪ']],
  J: [['dʒ', 'eɪ']],
  K: [['k', 'eɪ']],
  L: [['e', 'l']],
  M: [['e', 'm']],
  N: [['e', 'n']],
  O: [['əʊ']],
  P: [['p', 'iː']],
  Q: [['k', 'j', 'uː']],
  R: [['ɑː']],
  S: [['e', 's']],
  T: [['t', 'iː']],
  U: [['j', 'uː']],
  V: [['v', 'iː']],
  W: [['d', 'ʌ', 'b', 'l', 'j', 'uː']],
  X: [['e', 'k', 's']],
  Y: [['w', 'aɪ']],
  Z: [['z', 'e', 'd']] // UK ZED, strictly verified
};

/**
 * Computes pairwise phoneme distance between two token words under the specified pronunciation mode.
 * Evaluates all variant pairings and returns the minimum distance.
 */
export function getTokenDistance(
  wordA: string,
  wordB: string,
  mode: PronunciationMode = 'nato'
): number {
  if (wordA === wordB) return 0;

  const lexicon = mode === 'nato' ? NATO_LEXICON : LETTER_NAME_LEXICON;
  const variantsA = lexicon[wordA];
  const variantsB = lexicon[wordB];

  if (!variantsA || !variantsB) {
    // If not found in primary lexicon, fallback to max distance
    return 1.0;
  }

  let minDistance = Infinity;

  for (const seqA of variantsA) {
    for (const seqB of variantsB) {
      const dist = getPhonemeSequenceDistance(seqA, seqB);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return Number(minDistance.toFixed(4));
}
