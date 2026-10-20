import type { CandidateSuggestion } from './candidateRanking.ts';

/**
 * Maps technical algorithmic explanations into concise plain English
 * for warehouse colleagues while preserving accuracy.
 */
export function getPlainEnglishReason(
  cand: CandidateSuggestion,
  searchedCode: string
): string {
  const exps = cand.explanations || [];
  const firstExp = exps[0] || '';

  // 1. Transposition (swapped characters)
  if (/transposition/i.test(firstExp) || /swapped/i.test(firstExp)) {
    if (/positions 3 and 4/i.test(firstExp)) {
      return 'The last two characters may have been heard in the wrong order.';
    }
    if (/positions 2 and 3/i.test(firstExp)) {
      return 'The middle characters may have been heard in the wrong order.';
    }
    if (/positions 1 and 2/i.test(firstExp)) {
      return 'The first two characters may have been heard in the wrong order.';
    }
    return 'Characters may have been heard in the wrong order during voice picking.';
  }

  // 2. Prefix Confusions
  if (/JEWELLERY/i.test(firstExp) && /ZERO/i.test(firstExp)) {
    return 'Spoken "JEWELLERY" prefix is often misheard as "ZERO" by voice headsets.';
  }
  if (/SECURITY/i.test(firstExp) && /ZERO/i.test(firstExp)) {
    return 'Spoken "SECURITY" prefix is often misheard as "ZERO" in noisy stockrooms.';
  }

  // 3. Digit Pair Confusions
  if (
    (/\b08\b/i.test(firstExp) || /zero-eight/i.test(firstExp)) &&
    (/\b20\b/i.test(firstExp) || /twenty/i.test(firstExp))
  ) {
    return 'Numbers "08" and "20" sound very similar over voice headsets.';
  }
  if (
    (/\b16\b/i.test(firstExp) || /sixteen/i.test(firstExp)) &&
    (/\b10\b/i.test(firstExp) || /\bten\b/i.test(firstExp))
  ) {
    return 'Numbers "16" and "10" sound very similar over voice headsets.';
  }
  if (
    (/\b81\b/i.test(firstExp) || /eighty-one/i.test(firstExp)) &&
    (/\b50\b/i.test(firstExp) || /fifty/i.test(firstExp))
  ) {
    return 'Numbers "81" and "50" sound very similar over voice headsets.';
  }
  if (
    (/\b01\b/i.test(firstExp) || /zero-one/i.test(firstExp)) &&
    (/\b08\b/i.test(firstExp) || /zero-eight/i.test(firstExp))
  ) {
    return 'Numbers "01" and "08" sound very similar over voice headsets.';
  }

  // 4. Letter Pair Confusions
  if (/\bMN\b/i.test(firstExp) && /\bAN\b/i.test(firstExp)) {
    return 'Letters "MN" sound very similar to "AN" in noisy warehouse aisles.';
  }
  if (/\bZG\b/i.test(firstExp) && /\bJA\b/i.test(firstExp)) {
    return 'Letters "ZG" sound very similar to "JA" over voice headsets.';
  }
  if (/\bZE\b/i.test(firstExp) && /\bER\b/i.test(firstExp)) {
    return 'Letters "ZE" sound very similar to "ER" over voice headsets.';
  }
  if (/\bMM\b/i.test(firstExp) && /\bNN\b/i.test(firstExp)) {
    return 'Letters "MM" sound very similar to "NN" over voice headsets.';
  }

  // 5. Single Letter Confusions
  if (/\bM\b/i.test(firstExp) && /\bN\b/i.test(firstExp)) {
    return 'Letters "M" and "N" sound very similar over voice headsets.';
  }
  if (/\bB\b/i.test(firstExp) && /\bD\b/i.test(firstExp)) {
    return 'Letters "B" and "D" sound very similar over voice headsets.';
  }
  if (/\bP\b/i.test(firstExp) && /\bT\b/i.test(firstExp)) {
    return 'Letters "P" and "T" sound very similar over voice headsets.';
  }
  if (/\bV\b/i.test(firstExp) && /\bB\b/i.test(firstExp)) {
    return 'Letters "V" and "B" sound very similar over voice headsets.';
  }
  if (/\bS\b/i.test(firstExp) && /\bF\b/i.test(firstExp)) {
    return 'Letters "S" and "F" sound very similar over voice headsets.';
  }

  // 5. Community Observations
  if (cand.type === 'community_report') {
    const report = cand.communityReport;
    const confirmations = Math.max(1, report?.confirmations_count || 1);
    const isConfirmed = Boolean(report && (report.status === 'confirmed' || confirmations >= 3));

    if (isConfirmed) {
      return `Colleagues verified finding stock at this shelf when ${searchedCode} was voiced (${confirmations} confirmation${confirmations === 1 ? '' : 's'}).`;
    }
    if (confirmations > 1) {
      return `Colleagues corroborated finding stock at this shelf when ${searchedCode} was voiced (${confirmations} confirmations).`;
    }
    return `Colleagues reported finding stock at this shelf when ${searchedCode} was voiced.`;
  }

  // 6. Limited evidence / Reference Fallback
  if (cand.type === 'reference_fallback') {
    return `No voice confusion reports recorded for this shelf. Baseline reference location in aisle ${cand.candidateLocation.substring(0, 2)}.`;
  }

  // 7. General heuristics
  if (firstExp.startsWith('Documented acoustic heuristic: ')) {
    return firstExp.replace('Documented acoustic heuristic: ', '').replace(/\.$/, '') + '.';
  }
  if (firstExp.startsWith('Documented prefix heuristic: ')) {
    return firstExp.replace('Documented prefix heuristic: ', '').replace(/\.$/, '') + '.';
  }
  if (firstExp.startsWith('Documented letter pair heuristic: ')) {
    return firstExp.replace('Documented letter pair heuristic: ', '').replace(/\.$/, '') + '.';
  }
  if (firstExp.startsWith('Documented phonetic heuristic: ')) {
    return firstExp.replace('Documented phonetic heuristic: ', '').replace(/\.$/, '') + '.';
  }

  return firstExp || 'Possible alternative shelf location.';
}

/**
 * Returns clean, consistent evidence badge text supported strictly by available evidence.
 */
export function getEvidenceLabel(cand: CandidateSuggestion): string {
  if (cand.type === 'community_report') {
    return 'Community reported';
  }
  if (cand.type === 'reference_fallback') {
    return 'Limited evidence';
  }
  return 'Possible match';
}
