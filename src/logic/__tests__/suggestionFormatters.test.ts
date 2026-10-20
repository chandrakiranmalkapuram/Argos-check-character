import { describe, it, expect } from 'vitest';
import { getPlainEnglishReason, getEvidenceLabel } from '../suggestionFormatters.ts';
import type { CandidateSuggestion } from '../candidateRanking.ts';

describe('Voice Confusion Suggestion Formatters (Plain English & Evidence Labels)', () => {
  const baseSuggestion: CandidateSuggestion = {
    candidateLocation: '10KA',
    totalScore: 400,
    confidence: 'medium',
    type: 'inferred_heuristic',
    label: 'Possible match — community evidence/heuristic',
    explanations: [],
    scoreBreakdown: {
      communityBase: 0,
      confirmationBoost: 0,
      acousticHeuristic: 200,
      sameAisleBoost: 150,
      formatValidityBoost: 100,
      checkCharCollisionBoost: 0,
      flagPenalty: 0,
      totalScore: 450
    },
    checkChar: 'SIERRA',
    spokenText: 'ONE ZERO KILO ALPHA'
  };

  describe('getEvidenceLabel', () => {
    it('returns "Community reported" for community observations', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report'
      };
      expect(getEvidenceLabel(cand)).toBe('Community reported');
    });

    it('returns "Possible match" for inferred heuristics', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'inferred_heuristic'
      };
      expect(getEvidenceLabel(cand)).toBe('Possible match');
    });

    it('returns "Limited evidence" for reference fallbacks', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'reference_fallback'
      };
      expect(getEvidenceLabel(cand)).toBe('Limited evidence');
    });
  });

  describe('getPlainEnglishReason', () => {
    it('formats last two character transpositions into warehouse plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ["Adjacent character transposition: positions 3 and 4 ('A' and 'K') swapped."]
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'The last two characters may have been heard in the wrong order.'
      );
    });

    it('formats first two character transpositions into warehouse plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ["Adjacent character transposition: positions 1 and 2 ('1' and '0') swapped."]
      };
      expect(getPlainEnglishReason(cand, '01AK')).toBe(
        'The first two characters may have been heard in the wrong order.'
      );
    });

    it('formats middle character transpositions into warehouse plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ["Adjacent character transposition: positions 2 and 3 ('0' and 'A') swapped."]
      };
      expect(getPlainEnglishReason(cand, '1A0K')).toBe(
        'The middle characters may have been heard in the wrong order.'
      );
    });

    it('formats jewellery/zero prefix acoustic heuristic into plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ['Documented prefix heuristic: Headset voice recognition engine confuses spoken "JEWELLERY" with "ZERO".']
      };
      expect(getPlainEnglishReason(cand, 'J1PG')).toBe(
        'Spoken "JEWELLERY" prefix is often misheard as "ZERO" by voice headsets.'
      );
    });

    it('formats security/zero prefix acoustic heuristic into plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ['Documented prefix heuristic: Ambient stockroom noise causes "SECURITY" to be misrecognized as "ZERO".']
      };
      expect(getPlainEnglishReason(cand, 'S1AA')).toBe(
        'Spoken "SECURITY" prefix is often misheard as "ZERO" in noisy stockrooms.'
      );
    });

    it('formats digit pair 08/20 acoustic confusion into plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ['Documented digit pair heuristic: Spoken "zero-eight" / "oh-eight" acoustically confused with "twenty" / "two-zero".']
      };
      expect(getPlainEnglishReason(cand, '08MN')).toBe(
        'Numbers "08" and "20" sound very similar over voice headsets.'
      );
    });

    it('formats single letter acoustic confusion into plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        explanations: ['Documented phonetic heuristic: Spoken "M" and "N" are acoustically similar over headsets at position 3.']
      };
      expect(getPlainEnglishReason(cand, '08MN')).toBe(
        'Letters "M" and "N" sound very similar over voice headsets.'
      );
    });

    it('formats community report with missing report data safely without claiming verified', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        explanations: ['Direct community observation: reported voiced as "10AK" and physically found at "10KA".']
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues reported finding stock at this shelf when 10AK was voiced.'
      );
      expect(getPlainEnglishReason(cand, '10AK')).not.toContain('verified');
    });

    it('formats unapproved community report with 1 confirmation into neutral wording', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        communityReport: {
          id: 'rep-1',
          user_id: null,
          voiced_location: '10AK',
          found_location: '10KA',
          raw_voiced_location: '10AK',
          raw_found_location: '10KA',
          voiced_location_norm: '10AK',
          found_location_norm: '10KA',
          heard_location: '10AK',
          actual_location: '10KA',
          heard_location_norm: '10AK',
          actual_location_norm: '10KA',
          reason: 'similar_check_character',
          details: 'Aisle 10 observation',
          status: 'community_submitted',
          provenance: 'community_submitted',
          confirmations_count: 1,
          flag_count: 0,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z'
        }
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues reported finding stock at this shelf when 10AK was voiced.'
      );
      expect(getPlainEnglishReason(cand, '10AK')).not.toContain('verified');
    });

    it('formats unapproved community report with 2 confirmations into neutral wording (does not claim verified)', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        communityReport: {
          id: 'rep-2',
          user_id: null,
          voiced_location: '10AK',
          found_location: '10KA',
          raw_voiced_location: '10AK',
          raw_found_location: '10KA',
          voiced_location_norm: '10AK',
          found_location_norm: '10KA',
          heard_location: '10AK',
          actual_location: '10KA',
          heard_location_norm: '10AK',
          actual_location_norm: '10KA',
          reason: 'similar_check_character',
          details: 'Aisle 10 observation',
          status: 'community_submitted',
          provenance: 'community_submitted',
          confirmations_count: 2,
          flag_count: 0,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z'
        }
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues corroborated finding stock at this shelf when 10AK was voiced (2 confirmations).'
      );
      expect(getPlainEnglishReason(cand, '10AK')).not.toContain('verified');
    });

    it('formats unapproved community report with 3 confirmations as verified per candidateRanking threshold', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        communityReport: {
          id: 'rep-3',
          user_id: null,
          voiced_location: '10AK',
          found_location: '10KA',
          raw_voiced_location: '10AK',
          raw_found_location: '10KA',
          voiced_location_norm: '10AK',
          found_location_norm: '10KA',
          heard_location: '10AK',
          actual_location: '10KA',
          heard_location_norm: '10AK',
          actual_location_norm: '10KA',
          reason: 'similar_check_character',
          details: 'Aisle 10 observation',
          status: 'community_submitted',
          provenance: 'community_submitted',
          confirmations_count: 3,
          flag_count: 0,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z'
        }
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues verified finding stock at this shelf when 10AK was voiced (3 confirmations).'
      );
    });

    it('formats explicitly confirmed community report with 1 confirmation as verified', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        communityReport: {
          id: 'rep-4',
          user_id: null,
          voiced_location: '10AK',
          found_location: '10KA',
          raw_voiced_location: '10AK',
          raw_found_location: '10KA',
          voiced_location_norm: '10AK',
          found_location_norm: '10KA',
          heard_location: '10AK',
          actual_location: '10KA',
          heard_location_norm: '10AK',
          actual_location_norm: '10KA',
          reason: 'similar_check_character',
          details: 'Aisle 10 confirmed by manager',
          status: 'confirmed',
          provenance: 'moderator_confirmed',
          confirmations_count: 1,
          flag_count: 0,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z'
        }
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues verified finding stock at this shelf when 10AK was voiced (1 confirmation).'
      );
    });

    it('formats explicitly confirmed community report with multiple confirmations as verified', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        type: 'community_report',
        communityReport: {
          id: 'rep-5',
          user_id: null,
          voiced_location: '10AK',
          found_location: '10KA',
          raw_voiced_location: '10AK',
          raw_found_location: '10KA',
          voiced_location_norm: '10AK',
          found_location_norm: '10KA',
          heard_location: '10AK',
          actual_location: '10KA',
          heard_location_norm: '10AK',
          actual_location_norm: '10KA',
          reason: 'similar_check_character',
          details: 'Verified in aisle 10',
          status: 'confirmed',
          provenance: 'moderator_confirmed',
          confirmations_count: 5,
          flag_count: 0,
          created_at: '2026-10-19T00:00:00Z',
          updated_at: '2026-10-19T00:00:00Z'
        }
      };
      expect(getPlainEnglishReason(cand, '10AK')).toBe(
        'Colleagues verified finding stock at this shelf when 10AK was voiced (5 confirmations).'
      );
    });

    it('formats reference fallback warning into plain English', () => {
      const cand: CandidateSuggestion = {
        ...baseSuggestion,
        candidateLocation: '44AA',
        type: 'reference_fallback',
        explanations: ['Insufficient voice-confusion evidence for this zone.']
      };
      expect(getPlainEnglishReason(cand, '44ZZ')).toBe(
        'No voice confusion reports recorded for this shelf. Baseline reference location in aisle 44.'
      );
    });
  });
});
