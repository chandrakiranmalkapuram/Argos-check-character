import { describe, it, expect } from 'vitest';
import { suggestConfusions } from '../voiceConfusion/engine.ts';
import { calculateStoreCheckChar } from '../storeCalculator.ts';
import { enumerateGrammarLocations, parseLocationCode } from '../voiceConfusion/grammar.ts';
import { compareGappedAlignment, compareFixedPosition, TOKEN_GAP_COST } from '../voiceConfusion/phonetics/comparators.ts';
import { tokenizeStoreLocation } from '../voiceConfusion/tokenizer.ts';
import type { VoiceConfusionReport } from '../voiceConfusion/types.ts';

declare const process: { env: Record<string, string | undefined> };

describe('Milestone 4: Suggestion Engine, Ranking, and Plain-English Explanations', () => {
  describe('1. INVARIANT I1 & I2: Same-Check Gate and Calculator-Backed Fidelity', () => {
    it('verifies every returned candidate shares the exact check character calculated by calculateStoreCheckChar', () => {
      const testInputs = ['10AK', '21EZ', '16ZG', 'J7AZ', '01MM', '81ZE', 'CA10', 'L10A'];

      for (const input of testInputs) {
        const result = suggestConfusions(input, { includeArithmeticCollisions: true });
        expect(result.isValid).toBe(true);
        expect(result.checkChar).toBeDefined();

        const inputCalc = calculateStoreCheckChar(input);
        expect(result.checkChar).toBe(inputCalc.checkChar);

        for (const candidate of result.candidates) {
          const candCalc = calculateStoreCheckChar(candidate.location);
          expect(
            candCalc.checkChar,
            `Candidate ${candidate.location} checkChar must match input ${input} checkChar`
          ).toBe(result.checkChar);
          expect(candidate.checkChar).toBe(result.checkChar);
        }
      }
    });

    it('verifies 10KA and 01AK are strictly ABSENT from candidates for 10AK (Section 5 requirements)', () => {
      const res10AK = suggestConfusions('10AK', { includeArithmeticCollisions: true });
      expect(res10AK.isValid).toBe(true);
      expect(res10AK.checkChar).toBe('NOVEMBER');

      const candLocations = res10AK.candidates.map(c => c.location);
      expect(candLocations).not.toContain('10KA');
      expect(candLocations).not.toContain('01AK');

      // 10KA and 01AK have different check characters
      expect(calculateStoreCheckChar('10KA').checkChar).toBe('BRAVO');
      expect(calculateStoreCheckChar('01AK').checkChar).toBe('PAPA');
    });
  });

  describe('2. INVARIANT I3, I5 & I6: Plain-English Explanations, Digit-by-Digit, No Fake Scores', () => {
    it('verifies explanations use digit-by-digit spoken words for aisles (never "TEN")', () => {
      const res = suggestConfusions('10AK');
      expect(res.candidates.length).toBeGreaterThan(0);

      for (const cand of res.candidates.slice(0, 10)) {
        expect(cand.explanation).not.toMatch(/\bten\b/i);
        expect(cand.explanation).toMatch(/shared check character/i);
        expect(cand.explanation).toMatch(/would not be caught by the check-character step if this confusion occurred/i);
        expect(cand.explanation).not.toMatch(/likely heard as/i);
      }
    });

    it('verifies absence of fake percentages, arbitrary points, or fabricated confidence numbers (Invariant I5)', () => {
      const res = suggestConfusions('10AK');
      for (const cand of res.candidates) {
        expect(cand.explanation).not.toMatch(/%/);
        expect(cand.explanation).not.toMatch(/\bscore\b/i);
        expect(cand.explanation).not.toMatch(/\bpoints\b/i);
        expect(cand.explanation).not.toMatch(/\bconfidence\b/i);

        if (cand.explanation.includes('model')) {
          expect(cand.explanation).toMatch(/model assessment/i);
        }
      }
    });
  });

  describe('3. INVARIANT I4: Existence is strictly "unknown" for all candidates', () => {
    it('verifies candidate existence is strictly "unknown" for every candidate', () => {
      const res08MN = suggestConfusions('08MN', { includeArithmeticCollisions: true });
      for (const cand of res08MN.candidates) {
        expect(cand.existence).toBe('unknown');
      }

      const res10AK = suggestConfusions('10AK', { includeArithmeticCollisions: true });
      for (const cand of res10AK.candidates) {
        expect(cand.existence).toBe('unknown');
      }
    });
  });

  describe('4. Tier 2 Model-Similar Rule & Seed Observations (Decision D3)', () => {
    it('places 10DD and 21DK in Tier 2 because all differing tokens are model-similar (farTokens === 0)', () => {
      const res10AK = suggestConfusions('10AK');
      const cand10DD = res10AK.candidates.find(c => c.location === '10DD');
      expect(cand10DD).toBeDefined();
      expect(cand10DD?.tier).toBe('tier2_model_similar');
      expect(cand10DD?.totalDistance).toBeCloseTo(0.91, 2);

      const res21EZ = suggestConfusions('21EZ');
      const cand21DK = res21EZ.candidates.find(c => c.location === '21DK');
      expect(cand21DK).toBeDefined();
      expect(cand21DK?.tier).toBe('tier2_model_similar');
      expect(cand21DK?.totalDistance).toBeCloseTo(1.03, 2);
    });

    it('verifies seed_observation provenance NEVER elevates a tier and sets isReferenceExample badge', () => {
      const res08MN = suggestConfusions('08MN', { includeArithmeticCollisions: true });
      const cand20AN = res08MN.candidates.find(c => c.location === '20AN');
      expect(cand20AN).toBeDefined();
      // 20AN has 3 far tokens, so on phonetics alone it sits in arithmetic_collision, NOT tier1_reported
      expect(cand20AN?.tier).toBe('arithmetic_collision');
      expect(cand20AN?.isReferenceExample).toBe(true);
      expect(cand20AN?.provenance).toBe('seed_observation');

      const resJ7AZ = suggestConfusions('J7AZ');
      const cand07AZ = resJ7AZ.candidates.find(c => c.location === '07AZ');
      expect(cand07AZ).toBeDefined();
      // 07AZ has 1 far token, so on phonetics alone it sits in tier3_possible
      expect(cand07AZ?.tier).toBe('tier3_possible');
      expect(cand07AZ?.isReferenceExample).toBe(true);
    });

    it('verifies moderator approved or confirmed status elevates to Tier 1, while other statuses do not', () => {
      const approvedReport: VoiceConfusionReport = {
        id: 'rep-approved',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10BZ',
        reason: 'similar_sounding',
        status: 'approved',
        provenance: 'community_submitted',
        confirmations_count: 5,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      const resApproved = suggestConfusions('10AK', { communityReports: [approvedReport] });
      const cand10BZ = resApproved.candidates.find(c => c.location === '10BZ');
      expect(cand10BZ?.tier).toBe('tier1_reported');

      // Test other non-elevating statuses: community_submitted, pending, flagged, rejected, archived
      const nonElevatingStatuses = ['community_submitted', 'pending', 'flagged', 'rejected', 'archived'] as const;
      for (const st of nonElevatingStatuses) {
        const report: VoiceConfusionReport = {
          id: `rep-${st}`,
          user_id: null,
          voiced_location: '10AK',
          found_location: '10BZ',
          reason: 'similar_sounding',
          status: st,
          provenance: 'community_submitted',
          confirmations_count: 1,
          flag_count: 0,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z'
        };

        const res = suggestConfusions('10AK', { communityReports: [report] });
        const cand = res.candidates.find(c => c.location === '10BZ');
        // Does NOT elevate to Tier 1; ranks on phonetics as Tier 3
        expect(cand?.tier, `Status ${st} must not elevate to tier1`).toBe('tier3_possible');
        expect(cand?.hasCommunityReport).toBe(true);
        expect(cand?.communityReportStatus).toBe(st);
      }
    });

    it('verifies report direction is strictly preserved (voiced -> found)', () => {
      // Report says voiced 10AK -> found 10BZ
      const report: VoiceConfusionReport = {
        id: 'rep-dir',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10BZ',
        reason: 'similar_sounding',
        status: 'approved',
        provenance: 'moderator_confirmed',
        confirmations_count: 2,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      // Searching for 10AK promotes 10BZ
      const resFor10AK = suggestConfusions('10AK', { communityReports: [report] });
      expect(resFor10AK.candidates.find(c => c.location === '10BZ')?.tier).toBe('tier1_reported');

      // But searching for 10BZ does NOT promote 10AK (direction preserved)
      const resFor10BZ = suggestConfusions('10BZ', { communityReports: [report] });
      expect(resFor10BZ.candidates.find(c => c.location === '10AK')?.tier).not.toBe('tier1_reported');
    });
  });

  describe('5. INVARIANT I7 & Decision D9: Reported Pairs and Different-Check Isolation', () => {
    it('ensures a report involving 10KA for input 10AK stays completely out of the same-check list', () => {
      const fakeReport: VoiceConfusionReport = {
        id: 'rep-fake-10ka',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10KA',
        reason: 'other',
        status: 'approved',
        provenance: 'moderator_confirmed',
        confirmations_count: 10,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      const res = suggestConfusions('10AK', {
        includeArithmeticCollisions: true,
        communityReports: [fakeReport]
      });

      // 10KA must NOT appear in candidates
      expect(res.candidates.map(c => c.location)).not.toContain('10KA');

      // 10KA MUST appear in differentCheckCommunityReports
      const diffReport = res.differentCheckCommunityReports.find(r => r.reportedLocation === '10KA');
      expect(diffReport).toBeDefined();
      expect(diffReport?.reportedCheckChar).toBe('BRAVO');
      expect(diffReport?.inputCheckChar).toBe('NOVEMBER');
      expect(diffReport?.explanation).toContain('would normally be rejected by the check-character step');
    });

    it('populates reportedPairs section for same-check pairs with labels and handles reverse direction (Decision D9)', () => {
      const forwardReport: VoiceConfusionReport = {
        id: 'rep-fwd',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10DD',
        reason: 'similar_sounding',
        status: 'approved',
        provenance: 'moderator_confirmed',
        confirmations_count: 3,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      const reverseReport: VoiceConfusionReport = {
        id: 'rep-rev',
        user_id: null,
        voiced_location: '10IA',
        found_location: '10AK',
        reason: 'similar_sounding',
        status: 'confirmed',
        provenance: 'community_submitted',
        confirmations_count: 2,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      const res = suggestConfusions('10AK', {
        communityReports: [forwardReport, reverseReport]
      });

      // Both must appear in reportedPairs
      const fwd = res.reportedPairs.find(p => p.reportedLocation === '10DD');
      expect(fwd).toBeDefined();
      expect(fwd?.direction).toBe('voiced_to_found');
      expect(fwd?.label).toBe('Approved');
      expect(fwd?.checkChar).toBe('NOVEMBER');

      const rev = res.reportedPairs.find(p => p.reportedLocation === '10IA');
      expect(rev).toBeDefined();
      expect(rev?.direction).toBe('opposite_direction');
      expect(rev?.label).toBe('Confirmed');

      // Reverse report MUST NOT elevate 10IA to Tier 1 in candidates list
      const cand10IA = res.candidates.find(c => c.location === '10IA');
      expect(cand10IA?.tier).not.toBe('tier1_reported');
    });

    it('enforces Decision D11: non-acoustic reasons do not elevate candidate tiers and receive layout/check-character label', () => {
      // 1. Report with similar_check_character: approved by moderator
      const checkCharReport: VoiceConfusionReport = {
        id: 'rep-checkchar-mod',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10DD',
        reason: 'similar_check_character',
        status: 'approved',
        provenance: 'moderator_confirmed',
        confirmations_count: 5,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      // 2. Report with other: confirmed
      const otherReport: VoiceConfusionReport = {
        id: 'rep-other-mod',
        user_id: null,
        voiced_location: '10AK',
        found_location: '10BZ',
        reason: 'other',
        status: 'confirmed',
        provenance: 'community_submitted',
        confirmations_count: 3,
        flag_count: 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z'
      };

      const res = suggestConfusions('10AK', {
        communityReports: [checkCharReport, otherReport]
      });

      // 10DD must NOT be elevated to Tier 1; ranks on phonetics alone (Tier 2 model similar)
      const cand10DD = res.candidates.find(c => c.location === '10DD');
      expect(cand10DD?.tier).toBe('tier2_model_similar');

      // 10BZ must NOT be elevated to Tier 1; ranks on phonetics alone (Tier 3 possible)
      const cand10BZ = res.candidates.find(c => c.location === '10BZ');
      expect(cand10BZ?.tier).toBe('tier3_possible');

      // Both appear in reportedPairs with non-acoustic label
      const rep10DD = res.reportedPairs.find(p => p.reportedLocation === '10DD');
      expect(rep10DD?.label).toBe('Reported (layout / check-character), does not affect ranking');
      expect(rep10DD?.reason).toBe('similar_check_character');

      const rep10BZ = res.reportedPairs.find(p => p.reportedLocation === '10BZ');
      expect(rep10BZ?.label).toBe('Reported (layout / check-character), does not affect ranking');
      expect(rep10BZ?.reason).toBe('other');
    });

    it('verifies D12: gapped alignment is cheaper than fixed-position for rare equal-length pairs (aisles 13 vs 39 with identical letters)', () => {
      // 13AA: ['ONE', 'THREE', 'ALPHA', 'ALPHA']
      // 39AA: ['THREE', 'NINE', 'ALPHA', 'ALPHA']
      const tokensA = tokenizeStoreLocation('13AA');
      const tokensB = tokenizeStoreLocation('39AA');

      const fixedComp = compareFixedPosition(tokensA, tokensB);
      const gappedComp = compareGappedAlignment(tokensA, tokensB);

      // Fixed alignment: ONE/THREE (0.9667) + THREE/NINE (1.0000) + ALPHA/ALPHA (0) + ALPHA/ALPHA (0) = 1.9667 (~1.97)
      expect(fixedComp.totalDistance).toBeCloseTo(1.9667, 3);

      // Gapped alignment: aligns THREE/THREE (0) with two gap penalties (2 × 0.90 = 1.80)
      expect(gappedComp.totalDistance).toBeCloseTo(1.80, 2);

      // Real comparator output proves gapped is cheaper (1.80 < 1.9667)
      expect(gappedComp.totalDistance).toBeLessThan(fixedComp.totalDistance);
    });

    it('engine-level: Cash Office or Collection Point input against standard candidate (and reverse) asserts collapsed tier and that differing-token cap counts gap tokens', () => {
      // 1. Cash Office Input CA01 (3 tokens: CASH OFFICE, ZERO, ONE; checkChar: ZULU)
      const resCA = suggestConfusions('CA01', { includeArithmeticCollisions: true });
      expect(resCA.isValid).toBe(true);
      expect(resCA.checkChar).toBe('ZULU');

      // Candidate 70WW is standard format (4 tokens: SEVEN, ZERO, WHISKEY, WHISKEY; checkChar: ZULU)
      const cand70WW = resCA.candidates.find(c => c.location === '70WW');
      expect(cand70WW).toBeDefined();

      // Gapped alignment produces gap token with distance TOKEN_GAP_COST (0.90)
      const gapSlot = cand70WW!.alignment.find(s => s.tokenA === null || s.tokenB === null);
      expect(gapSlot).toBeDefined();
      expect(gapSlot?.distance).toBe(TOKEN_GAP_COST);
      expect(gapSlot?.distance).toBe(0.9);

      // Gap token exceeds near threshold (> 0.55), counting as a far token towards differing-token cap.
      // Total differing tokens = 3 (CASH OFFICE/SEVEN, null/WHISKEY gap, ONE/WHISKEY), which exceeds
      // MAX_DIFFERING_TOKENS_TIER2 (2) and MAX_DIFFERING_TOKENS_TIER3 (2).
      // Thus, cand70WW is excluded from Tier 1, 2, and 3, and categorized into arithmetic_collision.
      expect(cand70WW!.tier).toBe('arithmetic_collision');

      // Default query (without includeArithmeticCollisions) has 0 candidates for CA01
      const defaultResCA = suggestConfusions('CA01');
      expect(defaultResCA.candidates).toHaveLength(0);

      // 2. REVERSE DIRECTION: Standard format input 70WW against Cash Office candidate CA01
      const resReverse = suggestConfusions('70WW', { includeArithmeticCollisions: true });
      expect(resReverse.isValid).toBe(true);
      expect(resReverse.checkChar).toBe('ZULU');

      const candCA01 = resReverse.candidates.find(c => c.location === 'CA01');
      expect(candCA01).toBeDefined();

      // Reverse alignment also contains gap token (0.90) counting towards differing-token cap
      const reverseGapSlot = candCA01!.alignment.find(s => s.tokenA === null || s.tokenB === null);
      expect(reverseGapSlot).toBeDefined();
      expect(reverseGapSlot?.distance).toBe(TOKEN_GAP_COST);
      expect(reverseGapSlot?.tokenA).toBe('WHISKEY');
      expect(reverseGapSlot?.tokenB).toBeNull();
      expect(candCA01!.tier).toBe('arithmetic_collision');

      // 3. Collection Point Input CP01 (3 tokens: COLLECTION POINT, ZERO, ONE; checkChar: ALPHA)
      const resCP = suggestConfusions('CP01', { includeArithmeticCollisions: true });
      expect(resCP.isValid).toBe(true);
      expect(resCP.checkChar).toBe('ALPHA');

      // All standard candidates with checkChar ALPHA have gap tokens and are collapsed into arithmetic_collision
      const standardCands = resCP.candidates.filter(c => c.pattern === 'standard');
      expect(standardCands.length).toBeGreaterThan(0);
      for (const cand of standardCands) {
        expect(cand.tier).toBe('arithmetic_collision');
        const hasGap = cand.alignment.some(s => s.tokenA === null || s.tokenB === null);
        expect(hasGap).toBe(true);
      }
      expect(suggestConfusions('CP01').candidates).toHaveLength(0);
    });
  });

  describe('6. Large-Scale Property Tests over Supported Store Inputs', () => {
    const isFull = process.env.FULL_TEST_SUITE === '1';

    it(
      'strictly satisfies Invariant I2 (Same-Check Gate) across inputs spanning all four patterns (default 300 samples, 2,000 in test:full)',
      () => {
        const allCodes = enumerateGrammarLocations();
        const byPattern = {
          standard: [] as string[],
          jewellery_security: [] as string[],
          linbin_bulk: [] as string[],
          cash_office_collection_point: [] as string[]
        };

        for (const code of allCodes) {
          const parsed = parseLocationCode(code);
          if (parsed.kind === 'supported') {
            byPattern[parsed.pattern].push(code);
          }
        }

        // Deterministic PRNG LCG (seed = 98765)
        let seed = 98765;
        function lcg() {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        }

        const sampleCodes: string[] = [];
        if (isFull) {
          for (let i = 0; i < 2000; i++) {
            const idx = Math.floor(lcg() * allCodes.length);
            sampleCodes.push(allCodes[idx]);
          }
        } else {
          // 300 deterministic inputs spanning all 4 patterns
          function sampleFrom(list: string[], count: number) {
            for (let i = 0; i < count; i++) {
              const idx = Math.floor(lcg() * list.length);
              sampleCodes.push(list[idx]);
            }
          }
          sampleFrom(byPattern.standard, 150);
          sampleFrom(byPattern.jewellery_security, 70);
          sampleFrom(byPattern.linbin_bulk, 60);
          sampleFrom(byPattern.cash_office_collection_point, 20);
        }

        for (const code of sampleCodes) {
          const res = suggestConfusions(code, { includeArithmeticCollisions: true });
          expect(res.isValid).toBe(true);

          const expectedCheck = calculateStoreCheckChar(code).checkChar;
          expect(res.checkChar).toBe(expectedCheck);

          // Check top candidates and sampled collapsed pool
          const candidatesToCheck = [
            ...res.candidates.slice(0, 5),
            ...res.candidates.slice(-5)
          ];

          for (const cand of candidatesToCheck) {
            const candCalc = calculateStoreCheckChar(cand.location);
            expect(candCalc.checkChar).toBe(expectedCheck);
            expect(cand.checkChar).toBe(expectedCheck);
          }
        }
      },
      60_000 // 60s timeout set exclusively for property test
    );
  });

  describe('7. Unsupported Grammar, Formatting Quirks, and Regression Tests (Item 3 & 4)', () => {
    it('returns structured unsupported reasons for non-grammar inputs and verifies kind/message', () => {
      // 1. LAKE -> rfc_candidate
      const lake = suggestConfusions('LAKE');
      expect(lake.isValid).toBe(false);
      expect(lake.parsed.kind).toBe('unsupported');
      expect(lake.unsupportedReason).toBe('rfc_candidate');
      expect(lake.errorMessage).toBe(
        'RFC (Regional Fulfilment Centre) 4-letter locations use a separate two-digit check algorithm and are not covered by Store voice-confusion matching.'
      );

      // 2. JADE -> rfc_candidate
      const jade = suggestConfusions('JADE');
      expect(jade.isValid).toBe(false);
      expect(jade.parsed.kind).toBe('unsupported');
      expect(jade.unsupportedReason).toBe('rfc_candidate');

      // 3. DPA -> fixed_code
      const dpa = suggestConfusions('DPA');
      expect(dpa.isValid).toBe(false);
      expect(dpa.unsupportedReason).toBe('fixed_code');
      expect(dpa.errorMessage).toBe(
        'Fixed operational codes (e.g. DPA, SOB) have pre-assigned static check characters and are not covered by voice-confusion matching.'
      );

      // 4. DPA1 -> fixed_code (starts with DPA)
      const dpa1 = suggestConfusions('DPA1');
      expect(dpa1.isValid).toBe(false);
      expect(dpa1.unsupportedReason).toBe('fixed_code');
      expect(dpa1.errorMessage).toBe(
        'Fixed operational codes (e.g. DPA, SOB) have pre-assigned static check characters and are not covered by voice-confusion matching.'
      );

      // 5. SOB -> fixed_code
      const sob = suggestConfusions('SOB');
      expect(sob.isValid).toBe(false);
      expect(sob.unsupportedReason).toBe('fixed_code');

      // 6. RETURNS -> returns_alias
      const returns = suggestConfusions('RETURNS');
      expect(returns.isValid).toBe(false);
      expect(returns.unsupportedReason).toBe('returns_alias');
      expect(returns.errorMessage).toBe(
        'Returns operational locations use a static system check character and are not covered by voice-confusion matching.'
      );

      // 7. 10A+ -> relative_marker
      const relPlus = suggestConfusions('10A+');
      expect(relPlus.isValid).toBe(false);
      expect(relPlus.unsupportedReason).toBe('relative_marker');
      expect(relPlus.errorMessage).toBe(
        'Relative location markers (+ and -) indicate offset shelf positions and are not covered by voice-confusion matching.'
      );

      // 8. 10A- -> relative_marker
      const relMinus = suggestConfusions('10A-');
      expect(relMinus.isValid).toBe(false);
      expect(relMinus.unsupportedReason).toBe('relative_marker');

      // 9. ABCD -> rfc_candidate
      const abcd = suggestConfusions('ABCD');
      expect(abcd.isValid).toBe(false);
      expect(abcd.unsupportedReason).toBe('rfc_candidate');

      // 10. ' 10ak ' -> valid supported standard
      const trimmed = suggestConfusions(' 10ak ');
      expect(trimmed.isValid).toBe(true);
      expect(trimmed.normalizedLocation).toBe('10AK');
      expect(trimmed.parsed.kind).toBe('supported');

      // 11. Empty string -> invalid_format
      const empty = suggestConfusions('');
      expect(empty.isValid).toBe(false);
      expect(empty.unsupportedReason).toBe('invalid_format');
      expect(empty.errorMessage).toBe(
        'Location format is not recognized as a supported Store stockroom location code.'
      );

      // 12. 3-character input '10A' -> invalid_format
      const threeChar = suggestConfusions('10A');
      expect(threeChar.isValid).toBe(false);
      expect(threeChar.unsupportedReason).toBe('invalid_format');
      expect(threeChar.errorMessage).toBe(
        'Location format is not recognized as a supported Store stockroom location code.'
      );
    });

    it('asserts regression tests for long inputs: INVALID123, LONGSTRING, and 5-letter inputs (Item 3)', () => {
      // INVALID123
      const inv = suggestConfusions('INVALID123');
      expect(inv.isValid).toBe(false);
      expect(inv.unsupportedReason).toBe('invalid_format');
      expect(inv.errorMessage).toBe(
        "Input has more than 4 characters; the calculator used the first four ('INVA'). Suggestions are only shown for exact 4-character codes."
      );

      // LONGSTRING
      const longStr = suggestConfusions('LONGSTRING');
      expect(longStr.isValid).toBe(false);
      expect(longStr.unsupportedReason).toBe('invalid_format');
      expect(longStr.errorMessage).toBe(
        "Input has more than 4 characters; the calculator used the first four ('LONG'). Suggestions are only shown for exact 4-character codes."
      );

      // 5-letter input ABCDE
      const fiveLetter = suggestConfusions('ABCDE');
      expect(fiveLetter.isValid).toBe(false);
      expect(fiveLetter.unsupportedReason).toBe('invalid_format');
      expect(fiveLetter.errorMessage).toBe(
        "Input has more than 4 characters; the calculator used the first four ('ABCD'). Suggestions are only shown for exact 4-character codes."
      );

      // 10AKX (5 characters):
      // Calculator truncates to 10AK and returns NOVEMBER
      const calc10AKX = calculateStoreCheckChar('10AKX');
      expect(calc10AKX.isValid).toBe(true);
      expect(calc10AKX.checkChar).toBe('NOVEMBER');

      // Engine rejects 10AKX as unsupported invalid_format
      const engine10AKX = suggestConfusions('10AKX');
      expect(engine10AKX.isValid).toBe(false);
      expect(engine10AKX.unsupportedReason).toBe('invalid_format');
      expect(engine10AKX.errorMessage).toBe(
        "Input has more than 4 characters; the calculator used the first four ('10AK'). Suggestions are only shown for exact 4-character codes."
      );
    });
  });

  describe('8. Pure Engine Architectural Gate (Item 2)', () => {
    it('proves engine.ts and its transitive modules do not import supabaseClient or service.ts', () => {
      const logicModules = import.meta.glob('../voiceConfusion/**/*.ts', {
        query: '?raw',
        import: 'default',
        eager: true
      }) as Record<string, string>;

      expect(Object.keys(logicModules).length).toBeGreaterThan(0);

      for (const [filePath, fileContent] of Object.entries(logicModules)) {
        if (filePath.includes('__tests__')) continue;

        // Check for imports from supabaseClient or service
        expect(fileContent).not.toMatch(/from\s+['"].*supabaseClient.*['"]/);
        expect(fileContent).not.toMatch(/from\s+['"].*\/service(\.ts)?['"]/);
        expect(fileContent).not.toMatch(/import\.meta\.env/);
      }
    });
  });
});
