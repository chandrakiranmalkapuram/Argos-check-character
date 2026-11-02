import { calculateStoreCheckChar } from '../storeCalculator.ts';
import { parseLocationCode } from './grammar.ts';
import { tokenizeStoreLocation } from './tokenizer.ts';
import { buildStoreCheckIndex } from './checkIndex.ts';
import {
  compareGappedAlignment,
  type TokenAlignmentPair
} from './phonetics/comparators.ts';
import { MODEL_SIMILAR_TOKEN_THRESHOLD } from './phonetics/tokenDistanceTable.ts';
import { SEED_REFERENCE_OBSERVATIONS } from './seedObservations.ts';
import type {
  VoiceConfusionReport,
  CandidateTier,
  ConfusionCandidate,
  DifferentCheckReport,
  ReportedPairEntry,
  SuggestionOptions,
  SuggestionResult
} from './types.ts';

export type {
  CandidateTier,
  CandidateExistence,
  ConfusionCandidate,
  DifferentCheckReport,
  ReportedPairEntry,
  SuggestionOptions,
  SuggestionResult
} from './types.ts';

/**
 * Maximum number of differing tokens permitted for a Tier 2 candidate.
 * Candidates with more differing tokens fall into arithmetic collisions.
 * Provisional default: 4 (unrestricted), subject to evaluation.
 */
export const MAX_DIFFERING_TOKENS_TIER2 = 4;

/**
 * Maximum total number of differing tokens permitted for a Tier 3 candidate
 * (which must have exactly 1 far token, and at most MAX_DIFFERING_TOKENS_TIER3 differing tokens in total).
 * Provisional default: 4 (unrestricted), subject to evaluation.
 */
export const MAX_DIFFERING_TOKENS_TIER3 = 4;

/**
 * Builds plain-English explanation of voice-confusion risk.
 *
 * Compliance:
 * - INVARIANT I3: Uses digit-by-digit spoken words for aisles (e.g. 'ONE ZERO', never 'TEN').
 * - INVARIANT I5: No fake percentages, arbitrary points, or fabricated confidence numbers.
 * - INVARIANT I6: Phonetic distance explicitly labeled as 'model assessment'.
 * - Wording: Does not say "likely heard as" or imply a headset error is proven.
 */
function buildPlainEnglishExplanation(
  alignment: TokenAlignmentPair[],
  checkChar: string
): string {
  const diffParts: string[] = [];
  const sameParts: string[] = [];

  for (const pair of alignment) {
    if (pair.distance === 0 && pair.tokenA && pair.tokenB) {
      sameParts.push(`'${pair.tokenA}'`);
    } else if (pair.tokenA && pair.tokenB) {
      if (pair.distance <= MODEL_SIMILAR_TOKEN_THRESHOLD) {
        diffParts.push(
          `'${pair.tokenA}' sounds model-similar to '${pair.tokenB}' (model assessment: ${pair.distance.toFixed(2)})`
        );
      } else {
        diffParts.push(
          `'${pair.tokenA}' vs '${pair.tokenB}' (model assessment: ${pair.distance.toFixed(2)})`
        );
      }
    } else if (pair.tokenA && !pair.tokenB) {
      diffParts.push(`omitted spoken word '${pair.tokenA}'`);
    } else if (!pair.tokenA && pair.tokenB) {
      diffParts.push(`inserted spoken word '${pair.tokenB}'`);
    }
  }

  let desc = '';
  if (diffParts.length === 0) {
    desc = 'Identical spoken words across all positions.';
  } else {
    desc = `${diffParts.join('; ')}.`;
    if (sameParts.length > 0) {
      desc += ` Identical slots: ${sameParts.join(', ')}.`;
    }
  }

  const dangerNote = `Shared check character '${checkChar}' means the error would not be caught by the check-character step if this confusion occurred.`;

  return `${desc} ${dangerNote}`;
}

/**
 * Primary Unified Suggestion Engine entry point.
 *
 * Compliance:
 * - Invariant I1: Single-source check character calculation via calculateStoreCheckChar.
 * - Invariant I2: Same-Check Gate: 100% of candidates share the exact check character.
 * - Invariant I3: Plain-English explanations; digit-by-digit spoken words for aisles.
 * - Invariant I4: Candidate existence is strictly 'unknown' ("possible code, not verified to exist").
 * - Invariant I5: No fake percentages or arbitrary confidence scores.
 * - Invariant I6: Phonetic distance explicitly labeled as 'model assessment'.
 * - Invariant I7: Different-check community reports isolated into a separate section.
 * - Decision D3: seed_observation provenance never elevates a tier. Tier 1 requires approved/confirmed status.
 * - Decision D9: Reported pairs section includes all same-check pairs with labels and badges.
 */
export function suggestConfusions(
  location: string,
  options?: SuggestionOptions
): SuggestionResult {
  const parsed = parseLocationCode(location);
  const normalized = parsed.normalized;

  if (parsed.kind === 'unsupported') {
    return {
      isValid: false,
      inputLocation: location,
      normalizedLocation: normalized,
      parsed,
      candidates: [],
      reportedPairs: [],
      differentCheckCommunityReports: [],
      totalCheckedLocations: 0,
      unsupportedReason: parsed.reason,
      errorMessage: parsed.message
    };
  }

  // INVARIANT I1: Compute check character via calculateStoreCheckChar
  const calcResult = calculateStoreCheckChar(normalized);
  if (!calcResult.isValid || calcResult.checkChar === 'NULL') {
    return {
      isValid: false,
      inputLocation: location,
      normalizedLocation: normalized,
      parsed,
      candidates: [],
      reportedPairs: [],
      differentCheckCommunityReports: [],
      totalCheckedLocations: 0,
      errorMessage: calcResult.errorMessage || 'Invalid store location format'
    };
  }

  const targetCheckChar = calcResult.checkChar;
  const inputTokens = tokenizeStoreLocation(normalized);
  const inputSpokenText = calcResult.spokenText;

  // Retrieve all same-check peers from the single-source Store check index
  const { index: checkIndexMap } = buildStoreCheckIndex();
  const peerCodes = checkIndexMap.get(targetCheckChar) || [];

  // Gather community reports (both default seed observations and optional injected reports)
  const allReports: VoiceConfusionReport[] = [
    ...SEED_REFERENCE_OBSERVATIONS,
    ...(options?.communityReports || [])
  ];

  // Map of reported counterparts for this input location: Map<reportedLocation, { count, report }>
  // Direction preserved: repVoiced -> repFound
  const reportedCounterparts = new Map<string, { count: number; report: VoiceConfusionReport }>();
  // Decision D9: All reported pairs involving this location that share the same check character
  const reportedPairs: ReportedPairEntry[] = [];
  // INVARIANT I7: Different-check community reports for this input location
  const differentCheckReports: DifferentCheckReport[] = [];

  for (const rep of allReports) {
    const repVoiced = (rep.voiced_location_norm || rep.voiced_location || '').toUpperCase();
    const repFound = (rep.found_location_norm || rep.found_location || '').toUpperCase();

    // Direction preserved: user voiced input location (repVoiced === normalized)
    if (repVoiced === normalized && repFound && repFound !== normalized) {
      const foundCalc = calculateStoreCheckChar(repFound);
      if (foundCalc.isValid && foundCalc.checkChar === targetCheckChar) {
        // Same check char -> register for phonetic candidate ranking & reportedPairs section
        const existing = reportedCounterparts.get(repFound);
        const count = rep.confirmations_count || 1;
        if (!existing || count > existing.count) {
          reportedCounterparts.set(repFound, { count, report: rep });
        }

        let label: 'Reference example' | 'Reported, unverified' | 'Approved' | 'Confirmed';
        if (rep.provenance === 'seed_observation') {
          label = 'Reference example';
        } else if (rep.status === 'approved' || rep.provenance === 'moderator_confirmed') {
          label = 'Approved';
        } else if (rep.status === 'confirmed') {
          label = 'Confirmed';
        } else {
          label = 'Reported, unverified';
        }

        reportedPairs.push({
          reportedLocation: repFound,
          spokenText: foundCalc.spokenText,
          checkChar: targetCheckChar,
          status: rep.status,
          provenance: rep.provenance,
          reportCount: count,
          label,
          direction: 'voiced_to_found',
          details: rep.details ?? undefined
        });
      } else if (foundCalc.isValid && foundCalc.checkChar !== targetCheckChar) {
        // INVARIANT I7: Different check character -> isolate in separate section
        differentCheckReports.push({
          inputLocation: normalized,
          inputCheckChar: targetCheckChar,
          reportedLocation: repFound,
          reportedCheckChar: foundCalc.checkChar,
          reportCount: rep.confirmations_count || 1,
          details: rep.details ?? undefined,
          explanation: `Reported location ${repFound} has check character '${foundCalc.checkChar}' while ${normalized} has '${targetCheckChar}'. The discrepancy would normally be rejected by the check-character step.`
        });
      }
    }

    // Reverse direction (input was the found location: repFound === normalized)
    else if (repFound === normalized && repVoiced && repVoiced !== normalized) {
      const voicedCalc = calculateStoreCheckChar(repVoiced);
      if (voicedCalc.isValid && voicedCalc.checkChar === targetCheckChar) {
        let label: 'Reference example' | 'Reported, unverified' | 'Approved' | 'Confirmed';
        if (rep.provenance === 'seed_observation') {
          label = 'Reference example';
        } else if (rep.status === 'approved' || rep.provenance === 'moderator_confirmed') {
          label = 'Approved';
        } else if (rep.status === 'confirmed') {
          label = 'Confirmed';
        } else {
          label = 'Reported, unverified';
        }

        reportedPairs.push({
          reportedLocation: repVoiced,
          spokenText: voicedCalc.spokenText,
          checkChar: targetCheckChar,
          status: rep.status,
          provenance: rep.provenance,
          reportCount: rep.confirmations_count || 1,
          label,
          direction: 'opposite_direction',
          details: rep.details ?? undefined
        });
        // Reverse direction never adds to reportedCounterparts, so it never raises a tier!
      } else if (voicedCalc.isValid && voicedCalc.checkChar !== targetCheckChar) {
        differentCheckReports.push({
          inputLocation: normalized,
          inputCheckChar: targetCheckChar,
          reportedLocation: repVoiced,
          reportedCheckChar: voicedCalc.checkChar,
          reportCount: rep.confirmations_count || 1,
          details: rep.details ?? undefined,
          explanation: `Reported location ${repVoiced} (reverse direction) has check character '${voicedCalc.checkChar}' while ${normalized} has '${targetCheckChar}'. The discrepancy would normally be rejected by the check-character step.`
        });
      }
    }
  }

  const tier1Candidates: ConfusionCandidate[] = [];
  const tier2Candidates: ConfusionCandidate[] = [];
  const tier3Candidates: ConfusionCandidate[] = [];
  const arithmeticCollisions: ConfusionCandidate[] = [];

  const maxDiffTier2 = options?.maxDifferingTokensTier2 ?? MAX_DIFFERING_TOKENS_TIER2;
  const maxDiffTier3 = options?.maxDifferingTokensTier3 ?? MAX_DIFFERING_TOKENS_TIER3;
  const maxFarDistTier3 = options?.maxFarTokenDistanceTier3;

  // Evaluate every same-check peer (INVARIANT I2 Same-Check Gate)
  for (const peerCode of peerCodes) {
    if (peerCode === normalized) {
      continue; // Exclude self
    }

    const peerParsed = parseLocationCode(peerCode);
    const peerPattern = peerParsed.kind === 'supported' ? peerParsed.pattern : 'standard';
    const peerTokens = tokenizeStoreLocation(peerCode);
    const comp = compareGappedAlignment(inputTokens, peerTokens);

    let farTokens = 0;
    let nearTokens = 0;
    let identicalTokens = 0;
    let singleFarDist = 0;

    for (const pair of comp.alignment) {
      if (pair.distance === 0) {
        identicalTokens++;
      } else if (pair.distance <= MODEL_SIMILAR_TOKEN_THRESHOLD) {
        nearTokens++;
      } else {
        farTokens++;
        singleFarDist = pair.distance;
      }
    }

    const differingTokens = nearTokens + farTokens;

    const reportedInfo = reportedCounterparts.get(peerCode);
    const isReported = reportedInfo !== undefined;

    // Decision D3: Tier 1 requirements:
    // Requires status 'approved' or 'confirmed' OR provenance 'moderator_confirmed'
    // AND provenance other than 'seed_observation'.
    const qualifiesForTier1 =
      isReported &&
      reportedInfo.report.provenance !== 'seed_observation' &&
      (reportedInfo.report.status === 'approved' ||
        reportedInfo.report.status === 'confirmed' ||
        reportedInfo.report.provenance === 'moderator_confirmed');

    const isReferenceExample =
      isReported && reportedInfo.report.provenance === 'seed_observation';

    // Tier 2: Model-Similar: 0 far tokens (all differing tokens are model-similar <= 0.55)
    // and total differing tokens <= maxDiffTier2
    const isTier2 = farTokens === 0 && differingTokens <= maxDiffTier2;

    // Tier 3: Possible: exactly 1 far token, total differing tokens <= maxDiffTier3,
    // and far token distance <= maxFarDistTier3 (if specified)
    const isTier3 =
      farTokens === 1 &&
      differingTokens <= maxDiffTier3 &&
      (maxFarDistTier3 === undefined || singleFarDist <= maxFarDistTier3);

    let tier: CandidateTier;
    if (qualifiesForTier1) {
      tier = 'tier1_reported';
    } else if (isTier2) {
      tier = 'tier2_model_similar';
    } else if (isTier3) {
      tier = 'tier3_possible';
    } else {
      tier = 'arithmetic_collision';
    }

    const explanation = buildPlainEnglishExplanation(
      comp.alignment,
      targetCheckChar
    );

    const cand: ConfusionCandidate = {
      location: peerCode,
      pattern: peerPattern,
      spokenText: comp.alignment.map(a => a.tokenB).filter(Boolean).join(' '),
      checkChar: targetCheckChar,
      tier,
      // INVARIANT I4: Strictly 'unknown' for every candidate
      existence: 'unknown',
      totalDistance: comp.totalDistance,
      meanDistance: comp.meanDistance,
      alignment: comp.alignment,
      explanation,
      isReferenceExample: isReferenceExample ? true : undefined,
      hasCommunityReport: isReported ? true : undefined,
      communityReportStatus: isReported ? reportedInfo.report.status : undefined,
      provenance: isReported ? reportedInfo.report.provenance : undefined,
      reportCount: isReported ? reportedInfo.count : undefined
    };

    if (tier === 'tier1_reported') {
      tier1Candidates.push(cand);
    } else if (tier === 'tier2_model_similar') {
      tier2Candidates.push(cand);
    } else if (tier === 'tier3_possible') {
      tier3Candidates.push(cand);
    } else if (options?.includeArithmeticCollisions) {
      arithmeticCollisions.push(cand);
    }
  }

  // Sorters: by totalDistance ascending, then alphabetically by code
  const comparator = (a: ConfusionCandidate, b: ConfusionCandidate) => {
    if (Math.abs(a.totalDistance - b.totalDistance) > 1e-4) {
      return a.totalDistance - b.totalDistance;
    }
    return a.location.localeCompare(b.location);
  };

  tier1Candidates.sort(comparator);
  tier2Candidates.sort(comparator);
  tier3Candidates.sort(comparator);
  arithmeticCollisions.sort(comparator);

  const allVisibleCandidates = [
    ...tier1Candidates,
    ...tier2Candidates,
    ...tier3Candidates,
    ...arithmeticCollisions
  ];

  return {
    isValid: true,
    inputLocation: location,
    normalizedLocation: normalized,
    parsed,
    checkChar: targetCheckChar,
    spokenText: inputSpokenText,
    candidates: allVisibleCandidates,
    reportedPairs,
    differentCheckCommunityReports: differentCheckReports,
    totalCheckedLocations: peerCodes.length
  };
}
