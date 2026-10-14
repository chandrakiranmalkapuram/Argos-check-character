export * from './types.ts';
export * from './constants.ts';
export * from './storeCalculator.ts';
export * from './rfcCalculator.ts';
export * from './reverseLookup.ts';
export * from './similarLocations.ts';
export * from './validator.ts';

import type { CalculationResult, CheckMode, ReverseLookupResult, SimilarLocation } from './types.ts';
import { calculateStoreCheckChar } from './storeCalculator.ts';
import { calculateRfcCheckChar, isRfcCandidate } from './rfcCalculator.ts';
import { performReverseLookup, isPhoneticWord } from './reverseLookup.ts';
import { findSimilarLocations } from './similarLocations.ts';
import { validateAndClassifyInput } from './validator.ts';

export interface EvaluatedQuery {
  mode: CheckMode;
  input: string;
  storeResult?: CalculationResult;
  rfcResult?: CalculationResult;
  reverseResult?: ReverseLookupResult | null;
  similarLocations: SimilarLocation[];
  guidance: string;
  hasResults: boolean;
}

/**
 * High-level orchestration function to process an input under a specified mode.
 */
export function evaluateQuery(rawInput: string, selectedMode: CheckMode): EvaluatedQuery {
  const trimmed = rawInput.trim();
  const validation = validateAndClassifyInput(trimmed, selectedMode);

  if (!trimmed) {
    return {
      mode: selectedMode,
      input: '',
      similarLocations: [],
      guidance: validation.guidanceMessage,
      hasResults: false
    };
  }

  // Handle Reverse Lookup if input is NATO word or mode is 'reverse'
  if (selectedMode === 'reverse' || (selectedMode === 'auto' && isPhoneticWord(trimmed))) {
    const reverse = performReverseLookup(trimmed);
    return {
      mode: 'reverse',
      input: trimmed.toUpperCase(),
      reverseResult: reverse,
      similarLocations: [],
      guidance: reverse
        ? `Found ${reverse.totalMatches} shelf locations assigned to check character "${reverse.checkChar}".`
        : 'Enter a valid NATO phonetic word (e.g. ALPHA, ECHO, NOVEMBER, ZULU).',
      hasResults: !!reverse && reverse.totalMatches > 0
    };
  }

  // Handle explicit RFC mode
  if (selectedMode === 'rfc') {
    const rfc = calculateRfcCheckChar(trimmed);
    return {
      mode: 'rfc',
      input: trimmed.toUpperCase().substring(0, 4),
      rfcResult: rfc,
      similarLocations: [],
      guidance: rfc.isValid ? 'RFC check character calculated successfully.' : (rfc.errorMessage ?? 'Invalid RFC format.'),
      hasResults: rfc.isValid
    };
  }

  // Handle explicit Store mode
  if (selectedMode === 'store') {
    const store = calculateStoreCheckChar(trimmed);
    const similar = store.isValid ? findSimilarLocations(trimmed) : [];
    return {
      mode: 'store',
      input: trimmed.toUpperCase().substring(0, 4),
      storeResult: store,
      similarLocations: similar,
      guidance: store.isValid ? 'Store check character calculated successfully.' : (store.errorMessage ?? 'Invalid Store format.'),
      hasResults: store.isValid
    };
  }

  // Auto mode: if 4 letters, show both Store and RFC!
  if (isRfcCandidate(trimmed)) {
    const store = calculateStoreCheckChar(trimmed);
    const rfc = calculateRfcCheckChar(trimmed);
    const similar = findSimilarLocations(trimmed);
    return {
      mode: 'auto',
      input: trimmed.toUpperCase().substring(0, 4),
      storeResult: store,
      rfcResult: rfc,
      similarLocations: similar,
      guidance: '4-letter location: displaying both Store and RFC check characters.',
      hasResults: true
    };
  }

  // Default auto to Store
  const store = calculateStoreCheckChar(trimmed);
  const similar = store.isValid ? findSimilarLocations(trimmed) : [];
  return {
    mode: 'auto',
    input: trimmed.toUpperCase().substring(0, 4),
    storeResult: store,
    similarLocations: similar,
    guidance: store.isValid ? 'Store check character calculated successfully.' : (store.errorMessage ?? 'Incomplete location code.'),
    hasResults: store.isValid
  };
}
