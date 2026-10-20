/**
 * Deterministic Candidate-Ranking Engine for Voice-Confused and Unreferenced Warehouse Locations.
 * 
 * Signals:
 * 1. Community-Submitted Reports (observed voice corrections from warehouse workers)
 * 2. Independent Confirmations Count & Status
 * 3. Documented Warehouse Acoustic & Headset Misrecognition Heuristics
 * 4. Valid Warehouse Location Formats & Prefix Rules (Store modulo-26, RFC modulo-99, Special Prefixes)
 * 5. Check Character Collision Detection (identical check character increases voice-picking risk)
 * 
 * Strict Guidelines:
 * - Deterministic ordering: identical inputs and database produce identical ranked outputs.
 * - No statistical learning claimed from sparse seed samples.
 * - No edit distance treated as acoustic proof.
 * - Never fabricates codes or claims certainty.
 * - For valid unreferenced codes with insufficient evidence, returns a defensible valid reference
 *   location with an explicit low-confidence warning.
 */

import { isValidStorePattern } from './similarLocations.ts';
import { calculateStoreCheckChar } from './storeCalculator.ts';
import { calculateRfcCheckChar, isRfcCandidate } from './rfcCalculator.ts';
import type { VoiceConfusionReport } from '../voiceConfusion/types.ts';

export type CandidateType = 'community_report' | 'inferred_heuristic' | 'reference_fallback';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ScoreBreakdown {
  communityBase: number;
  confirmationBoost: number;
  acousticHeuristic: number;
  sameAisleBoost: number;
  formatValidityBoost: number;
  checkCharCollisionBoost: number;
  flagPenalty: number;
  totalScore: number;
}

export interface CandidateSuggestion {
  candidateLocation: string;
  totalScore: number;
  confidence: ConfidenceLevel;
  type: CandidateType;
  label: string;
  explanations: string[];
  scoreBreakdown: ScoreBreakdown;
  checkChar: string;
  spokenText: string;
  communityReport?: VoiceConfusionReport;
}

/**
 * Explicitly documented acoustic and phonetic confusion heuristics.
 * Each entry documents the operational stockroom reason for the substitution.
 */
interface AcousticSubstitution {
  source: string;
  target: string;
  type: 'prefix' | 'digit_pair' | 'letter_pair' | 'transposition';
  reason: string;
  points: number;
}

const DOCUMENTED_HEURISTICS: readonly AcousticSubstitution[] = [
  // 1. Prefix Acoustic Confusions
  {
    source: 'J',
    target: '0',
    type: 'prefix',
    reason: 'Headset voice recognition engine confuses spoken "JEWELLERY" with "ZERO"',
    points: 300
  },
  {
    source: '0',
    target: 'J',
    type: 'prefix',
    reason: 'Headset voice recognition engine confuses spoken "ZERO" with "JEWELLERY"',
    points: 300
  },
  {
    source: 'S',
    target: '0',
    type: 'prefix',
    reason: 'Ambient stockroom noise causes "SECURITY" to be misrecognized as "ZERO"',
    points: 300
  },
  {
    source: '0',
    target: 'S',
    type: 'prefix',
    reason: 'Ambient stockroom noise causes "ZERO" to be misrecognized as "SECURITY"',
    points: 300
  },

  // 2. Digit Pair Confusions (Observed in warehouse headsets)
  {
    source: '08',
    target: '20',
    type: 'digit_pair',
    reason: 'Spoken "zero-eight" / "oh-eight" acoustically confused with "twenty" / "two-zero"',
    points: 260
  },
  {
    source: '20',
    target: '08',
    type: 'digit_pair',
    reason: 'Spoken "twenty" / "two-zero" acoustically confused with "zero-eight" / "oh-eight"',
    points: 260
  },
  {
    source: '81',
    target: '50',
    type: 'digit_pair',
    reason: 'Spoken "eighty-one" acoustically masked as "fifty" in high-frequency warehouse noise',
    points: 260
  },
  {
    source: '50',
    target: '81',
    type: 'digit_pair',
    reason: 'Spoken "fifty" acoustically masked as "eighty-one" in high-frequency warehouse noise',
    points: 260
  },

  // 3. Letter Pair Confusions (NATO & Letter Name acoustics)
  {
    source: 'MN',
    target: 'AN',
    type: 'letter_pair',
    reason: 'Nasal consonant "M" (Mike) confused with vowel "A" (Alpha) before "N" (November)',
    points: 220
  },
  {
    source: 'ZG',
    target: 'JA',
    type: 'letter_pair',
    reason: 'Affricate / fricative phonetic shift: "ZG" (Zulu Golf) misheard as "JA" (Juliet Alpha)',
    points: 240
  },
  {
    source: 'ZE',
    target: 'ER',
    type: 'letter_pair',
    reason: 'British English pronunciation "Zed-Echo" / "ZE" confusable with "Echo-Romeo" / "ER"',
    points: 240
  },
  {
    source: 'M',
    target: 'N',
    type: 'letter_pair',
    reason: 'Nasal consonant acoustic masking: "MIKE" heard as "NOVEMBER"',
    points: 180
  },
  {
    source: 'N',
    target: 'M',
    type: 'letter_pair',
    reason: 'Nasal consonant acoustic masking: "NOVEMBER" heard as "MIKE"',
    points: 180
  },
  {
    source: 'B',
    target: 'D',
    type: 'letter_pair',
    reason: 'E-rhyming plosive consonant confusion: "BRAVO" heard as "DELTA"',
    points: 160
  },
  {
    source: 'B',
    target: 'P',
    type: 'letter_pair',
    reason: 'Bilabial plosive consonant confusion: "BRAVO" heard as "PAPA"',
    points: 160
  }
];

/**
 * Checks whether a candidate code is a valid warehouse location format.
 */
export function isSyntacticallyValidCode(code: string): boolean {
  const upper = code.trim().toUpperCase();
  if (upper.length !== 4) return false;
  return isValidStorePattern(upper) || isRfcCandidate(upper);
}

/**
 * Computes check character and spoken phrasing for any candidate code.
 */
export function getCandidateCheckInfo(code: string): { checkChar: string; spokenText: string } {
  const store = calculateStoreCheckChar(code);
  if (store.isValid && store.checkChar !== 'NULL') {
    return {
      checkChar: store.checkChar,
      spokenText: store.spokenText
    };
  }
  const rfc = calculateRfcCheckChar(code);
  if (rfc.isValid && rfc.checkChar !== 'NULL') {
    return {
      checkChar: rfc.checkChar,
      spokenText: rfc.spokenText
    };
  }
  return {
    checkChar: 'UNKNOWN',
    spokenText: code
  };
}

/**
 * Deterministically ranks candidates for an input location code.
 *
 * @param inputLocation The voiced or entered location code.
 * @param communityReports Authoritative shared reports from database.
 * @returns Ordered array of candidate suggestions.
 */
export function rankCandidatesForLocation(
  inputLocation: string,
  communityReports: readonly VoiceConfusionReport[] = []
): CandidateSuggestion[] {
  const cleanInput = inputLocation.trim().toUpperCase();
  if (!cleanInput) {
    return [];
  }

  const inputCode = cleanInput.substring(0, 4);
  const inputCheckInfo = getCandidateCheckInfo(inputCode);
  const candidateMap = new Map<string, CandidateSuggestion>();

  // Helper to safely register or update a candidate
  function addOrUpdateCandidate(
    candidateCode: string,
    scoreParams: {
      type: CandidateType;
      communityBase?: number;
      confirmationBoost?: number;
      acousticHeuristic?: number;
      sameAisleBoost?: number;
      formatValidityBoost?: number;
      checkCharCollisionBoost?: number;
      flagPenalty?: number;
    },
    label: string,
    confidence: ConfidenceLevel,
    explanation: string,
    communityReport?: VoiceConfusionReport
  ) {
    if (candidateCode === inputCode) {
      return; // A location is not an alternative to itself
    }

    const checkInfo = getCandidateCheckInfo(candidateCode);
    const existing = candidateMap.get(candidateCode);

    if (existing) {
      // Merge explanations and update score if higher
      if (!existing.explanations.includes(explanation)) {
        existing.explanations.push(explanation);
      }
      if (communityReport && !existing.communityReport) {
        existing.communityReport = communityReport;
        existing.type = 'community_report';
        existing.label = label;
        existing.confidence = confidence;
      }
      existing.scoreBreakdown.communityBase += scoreParams.communityBase || 0;
      existing.scoreBreakdown.confirmationBoost += scoreParams.confirmationBoost || 0;
      existing.scoreBreakdown.acousticHeuristic += scoreParams.acousticHeuristic || 0;
      existing.scoreBreakdown.flagPenalty += scoreParams.flagPenalty || 0;
      existing.totalScore =
        existing.scoreBreakdown.communityBase +
        existing.scoreBreakdown.confirmationBoost +
        existing.scoreBreakdown.acousticHeuristic +
        existing.scoreBreakdown.sameAisleBoost +
        existing.scoreBreakdown.formatValidityBoost +
        existing.scoreBreakdown.checkCharCollisionBoost -
        existing.scoreBreakdown.flagPenalty;
      return;
    }

    const cBase = scoreParams.communityBase || 0;
    const confBoost = scoreParams.confirmationBoost || 0;
    const acBoost = scoreParams.acousticHeuristic || 0;
    const aisleBoost = scoreParams.sameAisleBoost || 0;
    const fmtBoost = scoreParams.formatValidityBoost || 0;
    const collBoost = scoreParams.checkCharCollisionBoost || 0;
    const flagPen = scoreParams.flagPenalty || 0;

    const total = cBase + confBoost + acBoost + aisleBoost + fmtBoost + collBoost - flagPen;

    candidateMap.set(candidateCode, {
      candidateLocation: candidateCode,
      totalScore: total,
      confidence,
      type: scoreParams.type,
      label,
      explanations: [explanation],
      scoreBreakdown: {
        communityBase: cBase,
        confirmationBoost: confBoost,
        acousticHeuristic: acBoost,
        sameAisleBoost: aisleBoost,
        formatValidityBoost: fmtBoost,
        checkCharCollisionBoost: collBoost,
        flagPenalty: flagPen,
        totalScore: total
      },
      checkChar: checkInfo.checkChar,
      spokenText: checkInfo.spokenText,
      communityReport
    });
  }

  // --------------------------------------------------------------------------
  // Signal 1: Community Reports (Observed Warehouse Evidence)
  // --------------------------------------------------------------------------
  for (const report of communityReports) {
    if (report.status === 'flagged' || report.status === 'rejected') {
      continue;
    }

    const repVoiced = (report.voiced_location || report.heard_location || '').trim().toUpperCase();
    const repFound = (report.found_location || report.actual_location || '').trim().toUpperCase();

    if (repVoiced === inputCode) {
      const confirmations = report.confirmations_count || 1;
      const flags = report.flag_count || 0;
      const isConfirmed = report.status === 'confirmed' || confirmations >= 3;

      const label = isConfirmed
        ? `Community Report — Confirmed (${confirmations} corroborations)`
        : `Community Report — Unverified observation (${confirmations} report${confirmations > 1 ? 's' : ''})`;

      const confidence: ConfidenceLevel = isConfirmed ? 'high' : 'medium';

      addOrUpdateCandidate(
        repFound,
        {
          type: 'community_report',
          communityBase: 1000,
          confirmationBoost: confirmations * 100,
          flagPenalty: flags * 150,
          formatValidityBoost: isSyntacticallyValidCode(repFound) ? 100 : 0,
          sameAisleBoost: repFound.substring(0, 2) === inputCode.substring(0, 2) ? 150 : 0
        },
        label,
        confidence,
        `Direct community observation: reported voiced as "${repVoiced}" and physically found at "${repFound}" (${confirmations} independent confirmation${confirmations > 1 ? 's' : ''}).`,
        report
      );
    }
  }

  // --------------------------------------------------------------------------
  // Signal 2: Explicitly Documented Acoustic Heuristics
  // --------------------------------------------------------------------------
  // Full-code substitution
  for (const h of DOCUMENTED_HEURISTICS) {
    if (h.source === inputCode) {
      const candidateCode = h.target;
      const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(candidateCode).checkChar;
      addOrUpdateCandidate(
        candidateCode,
        {
          type: 'inferred_heuristic',
          acousticHeuristic: h.points,
          formatValidityBoost: isSyntacticallyValidCode(candidateCode) ? 100 : 0,
          checkCharCollisionBoost: sameCheck ? 120 : 0
        },
        'Possible match — community evidence/heuristic',
        'medium',
        `Documented acoustic heuristic: ${h.reason}.`
      );
    }
  }

  // Prefix substitution (position 0)
  const firstChar = inputCode[0];
  for (const h of DOCUMENTED_HEURISTICS.filter(x => x.type === 'prefix' && x.source.length === 1)) {
    if (firstChar === h.source) {
      const candidateCode = h.target + inputCode.substring(1);
      if (isSyntacticallyValidCode(candidateCode)) {
        const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(candidateCode).checkChar;
        addOrUpdateCandidate(
          candidateCode,
          {
            type: 'inferred_heuristic',
            acousticHeuristic: h.points,
            formatValidityBoost: 100,
            checkCharCollisionBoost: sameCheck ? 120 : 0
          },
          'Possible match — community evidence/heuristic',
          'medium',
          `Documented prefix heuristic: ${h.reason}.`
        );
      }
    }
  }

  // Digit pair substitution (first 2 digits)
  const prefix2 = inputCode.substring(0, 2);
  for (const h of DOCUMENTED_HEURISTICS.filter(x => x.type === 'digit_pair')) {
    if (prefix2 === h.source) {
      const candidateCode = h.target + inputCode.substring(2);
      if (isSyntacticallyValidCode(candidateCode)) {
        const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(candidateCode).checkChar;
        addOrUpdateCandidate(
          candidateCode,
          {
            type: 'inferred_heuristic',
            acousticHeuristic: h.points,
            formatValidityBoost: 100,
            checkCharCollisionBoost: sameCheck ? 120 : 0
          },
          'Possible match — community evidence/heuristic',
          'medium',
          `Documented digit pair heuristic: ${h.reason}.`
        );
      }
    }
  }

  // Letter pair substitution (last 2 characters)
  const suffix2 = inputCode.substring(2);
  for (const h of DOCUMENTED_HEURISTICS.filter(x => x.type === 'letter_pair' && x.source.length === 2)) {
    if (suffix2 === h.source) {
      const candidateCode = inputCode.substring(0, 2) + h.target;
      if (isSyntacticallyValidCode(candidateCode)) {
        const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(candidateCode).checkChar;
        addOrUpdateCandidate(
          candidateCode,
          {
            type: 'inferred_heuristic',
            acousticHeuristic: h.points,
            formatValidityBoost: 100,
            sameAisleBoost: 150,
            checkCharCollisionBoost: sameCheck ? 120 : 0
          },
          'Possible match — community evidence/heuristic',
          'medium',
          `Documented letter pair heuristic: ${h.reason} within aisle ${inputCode.substring(0, 2)}.`
        );
      }
    }
  }

  // Single letter substitution (e.g. M <-> N, B <-> D)
  for (let pos = 2; pos < 4; pos++) {
    const charAtPos = inputCode[pos];
    for (const h of DOCUMENTED_HEURISTICS.filter(x => x.type === 'letter_pair' && x.source.length === 1)) {
      if (charAtPos === h.source) {
        const candidateCode = inputCode.substring(0, pos) + h.target + inputCode.substring(pos + 1);
        if (isSyntacticallyValidCode(candidateCode)) {
          const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(candidateCode).checkChar;
          addOrUpdateCandidate(
            candidateCode,
            {
              type: 'inferred_heuristic',
              acousticHeuristic: h.points,
              formatValidityBoost: 100,
              sameAisleBoost: 150,
              checkCharCollisionBoost: sameCheck ? 120 : 0
            },
            'Possible match — community evidence/heuristic',
            'medium',
            `Documented phonetic heuristic: ${h.reason} at position ${pos + 1}.`
          );
        }
      }
    }
  }

  // Adjacent character transpositions (e.g. 10AK -> 10KA)
  for (let pos = 0; pos < 3; pos++) {
    const chars = inputCode.split('');
    const a = chars[pos];
    const b = chars[pos + 1];
    const isDigitA = /\d/.test(a);
    const isDigitB = /\d/.test(b);

    if (isDigitA === isDigitB) {
      chars[pos] = b;
      chars[pos + 1] = a;
      const transposed = chars.join('');
      if (isSyntacticallyValidCode(transposed)) {
        const sameCheck = inputCheckInfo.checkChar === getCandidateCheckInfo(transposed).checkChar;
        addOrUpdateCandidate(
          transposed,
          {
            type: 'inferred_heuristic',
            acousticHeuristic: 180,
            formatValidityBoost: 100,
            sameAisleBoost: transposed.substring(0, 2) === inputCode.substring(0, 2) ? 150 : 0,
            checkCharCollisionBoost: sameCheck ? 120 : 0
          },
          'Possible match — community evidence/heuristic',
          'medium',
          `Adjacent character transposition: positions ${pos + 1} and ${pos + 2} ('${a}' and '${b}') swapped.`
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Signal 3: Requirement 5 — Always Provide at Least One Defensible Candidate
  // for Valid Unreferenced Codes
  // --------------------------------------------------------------------------
  if (candidateMap.size === 0 && isSyntacticallyValidCode(inputCode)) {
    // Determine closest defensible reference location in the same aisle or zone
    let fallbackCode = '';
    const aisleDigits = inputCode.substring(0, 2);

    if (/^\d\d/.test(inputCode)) {
      // Standard store format: e.g. 44ZZ -> 44AA (base shelf in aisle 44)
      fallbackCode = `${aisleDigits}AA`;
      if (fallbackCode === inputCode) {
        fallbackCode = `${aisleDigits}AB`;
      }
    } else if (inputCode.startsWith('J') || inputCode.startsWith('S')) {
      fallbackCode = `${inputCode[0]}1AA`;
    } else if (inputCode.startsWith('L') || inputCode.startsWith('Z')) {
      fallbackCode = `${inputCode[0]}01A`;
    } else if (inputCode.startsWith('CA') || inputCode.startsWith('CP')) {
      fallbackCode = `${inputCode.substring(0, 2)}01`;
      if (fallbackCode === inputCode) {
        fallbackCode = `${inputCode.substring(0, 2)}02`;
      }
    } else if (isRfcCandidate(inputCode)) {
      fallbackCode = 'RETS';
    }

    if (fallbackCode && fallbackCode !== inputCode && isSyntacticallyValidCode(fallbackCode)) {
      const checkInfo = getCandidateCheckInfo(fallbackCode);
      candidateMap.set(fallbackCode, {
        candidateLocation: fallbackCode,
        totalScore: 50,
        confidence: 'low',
        type: 'reference_fallback',
        label: 'Possible match — low confidence reference fallback',
        explanations: [
          'Insufficient voice-confusion evidence for this zone. No documented acoustic confusion or community report matches this code.',
          `Showing valid reference location "${fallbackCode}" as a baseline reference candidate.`,
          'Low-confidence warning: Do not assume these locations are interchangeable. Verify physical shelf label before proceeding.'
        ],
        scoreBreakdown: {
          communityBase: 0,
          confirmationBoost: 0,
          acousticHeuristic: 0,
          sameAisleBoost: fallbackCode.substring(0, 2) === inputCode.substring(0, 2) ? 20 : 0,
          formatValidityBoost: 30,
          checkCharCollisionBoost: 0,
          flagPenalty: 0,
          totalScore: 50
        },
        checkChar: checkInfo.checkChar,
        spokenText: checkInfo.spokenText
      });
    }
  }

  // --------------------------------------------------------------------------
  // Deterministic Sorting:
  // 1. Total score (descending)
  // 2. Confirmations count (descending)
  // 3. Alphabetical location string (ascending tie-breaker)
  // --------------------------------------------------------------------------
  const results = Array.from(candidateMap.values());
  results.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    const confA = a.communityReport?.confirmations_count ?? 0;
    const confB = b.communityReport?.confirmations_count ?? 0;
    if (confB !== confA) {
      return confB - confA;
    }
    return a.candidateLocation.localeCompare(b.candidateLocation);
  });

  return results;
}

export interface GenerateCandidatesOptions {
  communityReports?: readonly VoiceConfusionReport[];
  checkCharacterTarget?: string;
  maxResults?: number;
}

export interface RankedCandidate {
  location: string;
  score: number;
  confidence: ConfidenceLevel;
  type: CandidateType;
  label: string;
  reasons: string[];
  evidence: string[];
  scoreBreakdown: ScoreBreakdown;
  checkCharacter: string;
  spokenText: string;
  communityReport?: VoiceConfusionReport;
}

/**
 * Convenience wrapper around rankCandidatesForLocation with object options and candidate formatting.
 */
export function generateRankedCandidates(
  inputLocation: string,
  options: GenerateCandidatesOptions = {}
): RankedCandidate[] {
  const suggestions = rankCandidatesForLocation(inputLocation, options.communityReports || []);
  let mapped: RankedCandidate[] = suggestions.map(s => ({
    location: s.candidateLocation,
    score: s.totalScore,
    confidence: s.confidence,
    type: s.type,
    label: s.label,
    reasons: s.explanations,
    evidence: s.explanations,
    scoreBreakdown: s.scoreBreakdown,
    checkCharacter: s.checkChar,
    spokenText: s.spokenText,
    communityReport: s.communityReport
  }));

  if (options.checkCharacterTarget) {
    const target = options.checkCharacterTarget.toUpperCase();
    mapped = mapped.map(c => {
      if (c.checkCharacter.toUpperCase() === target) {
        return {
          ...c,
          score: c.score + 25,
          reasons: [...c.reasons, `Check character collision: matches target check character (${target})`]
        };
      }
      return c;
    });
    mapped.sort((a, b) => b.score - a.score || a.location.localeCompare(b.location));
  }

  if (options.maxResults && options.maxResults > 0) {
    return mapped.slice(0, options.maxResults);
  }
  return mapped;
}

