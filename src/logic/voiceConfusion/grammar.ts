import { isRfcCandidate } from '../rfcCalculator.ts';
import { FIXED_CHECK_CHARACTERS, RETURNS_ALIASES } from '../constants.ts';

/**
 * Supported pattern types within the Argos Store location grammar.
 *
 * 1. Standard: 2 digits + 2 letters (e.g. 10AK, 00AA, 99ZZ)
 * 2. Jewellery / Security: J or S + 1 digit + 2 letters (e.g. J7AZ, S1PG)
 * 3. Linbin / Bulk: L or Z + 2 digits + 1 letter (e.g. L10A, Z01B)
 * 4. Cash Office / Collection Point: CA or CP + 2 digits (e.g. CA10, CP20)
 */
export type SupportedStorePattern =
  | 'standard'
  | 'jewellery_security'
  | 'linbin_bulk'
  | 'cash_office_collection_point';

export type UnsupportedReason =
  | 'relative_marker'
  | 'fixed_code'
  | 'returns_alias'
  | 'rfc_candidate'
  | 'invalid_format';

export type ParsedLocationCode =
  | {
      kind: 'supported';
      raw: string;
      normalized: string;
      pattern: SupportedStorePattern;
    }
  | {
      kind: 'unsupported';
      raw: string;
      normalized: string;
      reason: UnsupportedReason;
      message: string;
    };

// Regex patterns matching the 4 supported Store stockroom location structures
export const PATTERN_REGEXES: Record<SupportedStorePattern, RegExp> = {
  standard: /^\d{2}[A-Z]{2}$/,
  jewellery_security: /^[JS]\d[A-Z]{2}$/,
  linbin_bulk: /^[LZ]\d{2}[A-Z]$/,
  cash_office_collection_point: /^C[AP]\d{2}$/
};

/**
 * Checks whether a normalized string matches any of the 4 supported store grammar patterns.
 */
export function matchSupportedStorePattern(code: string): SupportedStorePattern | null {
  if (PATTERN_REGEXES.standard.test(code)) return 'standard';
  if (PATTERN_REGEXES.jewellery_security.test(code)) return 'jewellery_security';
  if (PATTERN_REGEXES.linbin_bulk.test(code)) return 'linbin_bulk';
  if (PATTERN_REGEXES.cash_office_collection_point.test(code)) return 'cash_office_collection_point';
  return null;
}

/**
 * Parses and categorizes an arbitrary location input string into either a supported
 * Store grammar code or an explicitly typed unsupported code with an explanatory reason.
 */
export function parseLocationCode(rawInput: string): ParsedLocationCode {
  const normalized = rawInput.trim().toUpperCase();

  // 1. Check fixed system operational codes (e.g. DPA, SOB)
  if (normalized in FIXED_CHECK_CHARACTERS || normalized.startsWith('DPA') || normalized.startsWith('SOB')) {
    return {
      kind: 'unsupported',
      raw: rawInput,
      normalized,
      reason: 'fixed_code',
      message: 'Fixed operational codes (e.g. DPA, SOB) have pre-assigned static check characters and are not covered by voice-confusion matching.'
    };
  }

  // 2. Check returns aliases (RETURNS, RETURN, RETUR, RETS)
  if (
    normalized === 'RETS' ||
    RETURNS_ALIASES.includes(normalized as (typeof RETURNS_ALIASES)[number])
  ) {
    return {
      kind: 'unsupported',
      raw: rawInput,
      normalized,
      reason: 'returns_alias',
      message: 'Returns operational locations use a static system check character and are not covered by voice-confusion matching.'
    };
  }

  // 3. Check relative location markers (+ / -)
  if (normalized.endsWith('+') || normalized.endsWith('-')) {
    return {
      kind: 'unsupported',
      raw: rawInput,
      normalized,
      reason: 'relative_marker',
      message: 'Relative location markers (+ and -) indicate offset shelf positions and are not covered by voice-confusion matching.'
    };
  }

  // 4. Check 4-character candidate against supported Store patterns
  const candidate4 = normalized.substring(0, 4);
  const matchedPattern = matchSupportedStorePattern(candidate4);

  if (matchedPattern && candidate4.length === normalized.length) {
    return {
      kind: 'supported',
      raw: rawInput,
      normalized: candidate4,
      pattern: matchedPattern
    };
  }

  // 5. Check if candidate is RFC format (4 letters)
  if (isRfcCandidate(normalized)) {
    return {
      kind: 'unsupported',
      raw: rawInput,
      normalized,
      reason: 'rfc_candidate',
      message: 'RFC (Regional Fulfilment Centre) 4-letter locations use a separate two-digit check algorithm and are not covered by Store voice-confusion matching.'
    };
  }

  // 6. Generic invalid format
  return {
    kind: 'unsupported',
    raw: rawInput,
    normalized,
    reason: 'invalid_format',
    message: 'Location format is not recognized as a supported Store stockroom location code.'
  };
}

/**
 * Enumerates all valid location codes for a given supported store pattern.
 */
export function enumeratePatternLocations(pattern: SupportedStorePattern): string[] {
  const codes: string[] = [];

  const letters: string[] = [];
  for (let i = 0; i < 26; i++) {
    letters.push(String.fromCharCode(65 + i));
  }

  switch (pattern) {
    case 'standard': {
      // 00AA - 99ZZ: 100 aisles * 26 bays * 26 shelves = 67,600 codes
      for (let a = 0; a <= 99; a++) {
        const aisle = a.toString().padStart(2, '0');
        for (const bay of letters) {
          for (const shelf of letters) {
            codes.push(`${aisle}${bay}${shelf}`);
          }
        }
      }
      break;
    }

    case 'jewellery_security': {
      // [JS][0-9][A-Z][A-Z]: 2 prefixes * 10 digits * 26 bays * 26 shelves = 13,520 codes
      for (const prefix of ['J', 'S']) {
        for (let d = 0; d <= 9; d++) {
          const digitStr = d.toString();
          for (const bay of letters) {
            for (const shelf of letters) {
              codes.push(`${prefix}${digitStr}${bay}${shelf}`);
            }
          }
        }
      }
      break;
    }

    case 'linbin_bulk': {
      // [LZ][00-99][A-Z]: 2 prefixes * 100 aisles * 26 shelves = 5,200 codes
      for (const prefix of ['L', 'Z']) {
        for (let a = 0; a <= 99; a++) {
          const aisle = a.toString().padStart(2, '0');
          for (const shelf of letters) {
            codes.push(`${prefix}${aisle}${shelf}`);
          }
        }
      }
      break;
    }

    case 'cash_office_collection_point': {
      // C[AP][00-99]: 2 prefixes * 100 numbers = 200 codes
      for (const prefix of ['CA', 'CP']) {
        for (let a = 0; a <= 99; a++) {
          const num = a.toString().padStart(2, '0');
          codes.push(`${prefix}${num}`);
        }
      }
      break;
    }
  }

  return codes;
}

/**
 * Enumerates all 86,520 codes across all 4 supported Store grammar patterns.
 */
export function enumerateGrammarLocations(): string[] {
  return [
    ...enumeratePatternLocations('standard'),
    ...enumeratePatternLocations('jewellery_security'),
    ...enumeratePatternLocations('linbin_bulk'),
    ...enumeratePatternLocations('cash_office_collection_point')
  ];
}
