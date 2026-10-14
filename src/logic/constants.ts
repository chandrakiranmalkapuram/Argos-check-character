/**
 * Independent constants for stockroom check-character calculations.
 */

export const NATO_PHONETIC_ALPHABET: readonly string[] = [
  'ALPHA',
  'BRAVO',
  'CHARLIE',
  'DELTA',
  'ECHO',
  'FOXTROT',
  'GOLF',
  'HOTEL',
  'INDIA',
  'JULIET',
  'KILO',
  'LIMA',
  'MIKE',
  'NOVEMBER',
  'OSCAR',
  'PAPA',
  'QUEBEC',
  'ROMEO',
  'SIERRA',
  'TANGO',
  'UNIFORM',
  'VICTOR',
  'WHISKEY',
  'X-RAY',
  'YANKEE',
  'ZULU'
] as const;

export const DIGIT_WORDS: readonly string[] = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE'
] as const;

/**
 * Both Store and RFC formulas weight the 4 positional characters by [5, 7, 7, 3].
 */
export const POSITION_WEIGHTS: readonly [number, number, number, number] = [5, 7, 7, 3] as const;

/**
 * Verified fixed location check characters.
 */
export const FIXED_CHECK_CHARACTERS: Readonly<Record<string, string>> = {
  DPA: 'VICTOR',
  SOB: 'SIERRA'
};

/**
 * Returns aliases.
 */
export const RETURNS_ALIASES = ['RETURNS', 'RETURN', 'RETUR', 'RETS'] as const;

/**
 * Prefix spoken descriptors for store aisles and zones.
 */
export const STORE_PREFIX_MAP: Readonly<Record<string, string>> = {
  J: 'JEWELLERY',
  S: 'SECURITY',
  L: 'LINBIN',
  Z: 'BULK',
  CA: 'CASH OFFICE',
  CP: 'COLLECTION POINT'
};
