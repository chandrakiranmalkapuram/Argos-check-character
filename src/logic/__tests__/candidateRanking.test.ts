import { describe, it, expect } from 'vitest';
import { generateRankedCandidates } from '../candidateRanking.ts';
import { calculateStoreCheckCharacter } from '../storeCalculator.ts';
import type { VoiceConfusionReport } from '../../voiceConfusion/types.ts';

describe('Acoustic Voice Confusion Analysis & Deterministic Candidate Ranking', () => {
  const seedCommunityReports: VoiceConfusionReport[] = [
    {
      id: 'seed-001',
      user_id: null,
      voiced_location: '08MN',
      found_location: '20AN',
      raw_voiced_location: '08MN',
      raw_found_location: '20AN',
      voiced_location_norm: '08MN',
      found_location_norm: '20AN',
      heard_location: '08MN',
      actual_location: '20AN',
      heard_location_norm: '08MN',
      actual_location_norm: '20AN',
      reason: 'similar_sounding',
      details: 'Reported warehouse acoustic confusion: 08 heard for 20, M heard for A.',
      status: 'community_submitted',
      provenance: 'community_submitted',
      confirmations_count: 3,
      flag_count: 0,
      created_at: '2026-10-19T08:00:00Z',
      updated_at: '2026-10-19T08:00:00Z'
    },
    {
      id: 'seed-002',
      user_id: null,
      voiced_location: '16ZG',
      found_location: '16JA',
      raw_voiced_location: '16ZG',
      raw_found_location: '16JA',
      voiced_location_norm: '16ZG',
      found_location_norm: '16JA',
      heard_location: '16ZG',
      actual_location: '16JA',
      heard_location_norm: '16ZG',
      actual_location_norm: '16JA',
      reason: 'similar_sounding',
      details: 'Reported warehouse acoustic confusion in aisle 16: ZG spoken sounds like JA.',
      status: 'community_submitted',
      provenance: 'community_submitted',
      confirmations_count: 2,
      flag_count: 0,
      created_at: '2026-10-19T08:00:00Z',
      updated_at: '2026-10-19T08:00:00Z'
    },
    {
      id: 'seed-003',
      user_id: null,
      voiced_location: '81ZE',
      found_location: '50ER',
      raw_voiced_location: '81ZE',
      raw_found_location: '50ER',
      voiced_location_norm: '81ZE',
      found_location_norm: '50ER',
      heard_location: '81ZE',
      actual_location: '50ER',
      heard_location_norm: '81ZE',
      actual_location_norm: '50ER',
      reason: 'similar_sounding',
      details: 'Reported warehouse acoustic confusion: 81 heard for 50, ZE heard for ER.',
      status: 'community_submitted',
      provenance: 'community_submitted',
      confirmations_count: 1,
      flag_count: 0,
      created_at: '2026-10-19T08:00:00Z',
      updated_at: '2026-10-19T08:00:00Z'
    },
    {
      id: 'seed-004',
      user_id: null,
      voiced_location: '01MM',
      found_location: 'Z01B',
      raw_voiced_location: '01MM',
      raw_found_location: 'Z01B',
      voiced_location_norm: '01MM',
      found_location_norm: 'Z01B',
      heard_location: '01MM',
      actual_location: 'Z01B',
      heard_location_norm: '01MM',
      actual_location_norm: 'Z01B',
      reason: 'similar_sounding',
      details: 'Reported warehouse acoustic confusion: standard vs Bulk zone prefix Z (Zero-One-Bulk-Bravo).',
      status: 'community_submitted',
      provenance: 'community_submitted',
      confirmations_count: 4,
      flag_count: 0,
      created_at: '2026-10-19T08:00:00Z',
      updated_at: '2026-10-19T08:00:00Z'
    }
  ];

  describe('Seed Observations Candidate Retrieval', () => {
    it('ranks 20AN as top candidate when voiced input is 08MN', () => {
      const candidates = generateRankedCandidates('08MN', {
        communityReports: seedCommunityReports
      });

      expect(candidates.length).toBeGreaterThan(0);
      const top = candidates[0];
      expect(top.location).toBe('20AN');
      expect(top.confidence).toBe('high');
      expect(top.reasons.some(r => r.includes('community') || r.includes('08') || r.includes('20'))).toBe(true);
      expect(top.checkCharacter).toBe(calculateStoreCheckCharacter('20AN'));
    });

    it('ranks 16JA as top candidate when voiced input is 16ZG', () => {
      const candidates = generateRankedCandidates('16ZG', {
        communityReports: seedCommunityReports
      });

      expect(candidates.length).toBeGreaterThan(0);
      const match = candidates.find(c => c.location === '16JA');
      expect(match).toBeDefined();
      expect(match?.reasons.some(r => r.includes('community') || r.includes('16ZG'))).toBe(true);
      expect(match?.checkCharacter).toBe(calculateStoreCheckCharacter('16JA'));
    });

    it('ranks 50ER as candidate when voiced input is 81ZE', () => {
      const candidates = generateRankedCandidates('81ZE', {
        communityReports: seedCommunityReports
      });

      expect(candidates.length).toBeGreaterThan(0);
      const match = candidates.find(c => c.location === '50ER');
      expect(match).toBeDefined();
      expect(['high', 'medium']).toContain(match?.confidence);
      expect(match?.checkCharacter).toBe(calculateStoreCheckCharacter('50ER'));
    });

    it('ranks Z01B as candidate when voiced input is 01MM (Store Bulk zone prefix Z)', () => {
      const candidates = generateRankedCandidates('01MM', {
        communityReports: seedCommunityReports
      });

      expect(candidates.length).toBeGreaterThan(0);
      const match = candidates.find(c => c.location === 'Z01B');
      expect(match).toBeDefined();
      expect(match?.reasons.some(r => r.includes('community') || r.includes('Bulk'))).toBe(true);
      expect(match?.checkCharacter).toBe(calculateStoreCheckCharacter('Z01B'));
    });
  });

  describe('Deterministic Ranking Behavior', () => {
    it('produces the exact same ordered list and scores across multiple invocations with identical input', () => {
      const testInputs = ['08MN', '16ZG', '81ZE', '01MM', '10AK', 'Z01B'];

      for (const input of testInputs) {
        const run1 = generateRankedCandidates(input, { communityReports: seedCommunityReports });
        const run2 = generateRankedCandidates(input, { communityReports: seedCommunityReports });
        const run3 = generateRankedCandidates(input, { communityReports: seedCommunityReports });

        expect(run1.map(c => c.location)).toEqual(run2.map(c => c.location));
        expect(run1.map(c => c.score)).toEqual(run2.map(c => c.score));
        expect(run2.map(c => c.location)).toEqual(run3.map(c => c.location));
        expect(run2.map(c => c.score)).toEqual(run3.map(c => c.score));
      }
    });

    it('never changes the existing Check Character calculation formula', () => {
      const candidates = generateRankedCandidates('08MN', { communityReports: seedCommunityReports });
      for (const cand of candidates) {
        if (cand.checkCharacter) {
          expect(cand.checkCharacter).toBe(calculateStoreCheckCharacter(cand.location));
        }
      }
    });
  });

  describe('Unreferenced Zone Fallback & Low-Confidence Warning', () => {
    it('always provides at least one candidate for a syntactically valid unreferenced zone input', () => {
      // 99ZZ is a valid Store format (2 digits, 2 letters) but has no community reports
      const candidates = generateRankedCandidates('99ZZ', {
        communityReports: [] // Empty DB
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const top = candidates[0];
      expect(top.location).toMatch(/^[0-9A-Z]+$/);
      expect(top.score).toBeGreaterThan(0);
      expect(top.reasons.length).toBeGreaterThan(0);
      // Explanations must clearly label heuristic/possible match
      expect(top.reasons.some(r => r.toLowerCase().includes('heuristic') || r.toLowerCase().includes('possible') || r.toLowerCase().includes('valid'))).toBe(true);
    });

    it('provides low-confidence warning when evidence is sparse rather than fabricating certainty', () => {
      const candidates = generateRankedCandidates('99ZZ', {
        communityReports: []
      });

      const top = candidates[0];
      // When evidence is purely acoustic heuristic or structural without community corroborate, confidence is low or medium
      expect(['low', 'medium']).toContain(top.confidence);
      // Evidence explanation must not claim statistical certainty
      expect(top.evidence.some(e => e.toLowerCase().includes('proven') || e.toLowerCase().includes('guaranteed'))).toBe(false);
    });

    it('never invents invalid locations (e.g. invalid syntax characters or length)', () => {
      const candidates = generateRankedCandidates('99ZZ', { communityReports: [] });
      for (const cand of candidates) {
        expect(cand.location.length).toBeGreaterThanOrEqual(2);
        expect(cand.location.length).toBeLessThanOrEqual(10);
        expect(/^[A-Z0-9+\-/]+$/.test(cand.location)).toBe(true);
      }
    });

    it('provides valid fallback candidate for unreferenced Cash Office (CA) locations', () => {
      const candidates = generateRankedCandidates('CA99', { communityReports: [] });
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const top = candidates[0];
      expect(top.location).toBe('CA01');
      expect(top.confidence).toBe('low');
      expect(top.type).toBe('reference_fallback');
      expect(top.reasons.some(r => r.includes('low-confidence') || r.includes('Low-confidence'))).toBe(true);
      expect(top.checkCharacter).toBe(calculateStoreCheckCharacter('CA01'));
    });

    it('provides valid fallback candidate for unreferenced Collection Point (CP) locations', () => {
      const candidates = generateRankedCandidates('CP99', { communityReports: [] });
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const top = candidates[0];
      expect(top.location).toBe('CP01');
      expect(top.confidence).toBe('low');
      expect(top.type).toBe('reference_fallback');
      expect(top.reasons.some(r => r.includes('low-confidence') || r.includes('Low-confidence'))).toBe(true);
      expect(top.checkCharacter).toBe(calculateStoreCheckCharacter('CP01'));
    });

    it('avoids proposing the exact same location when input is CA01', () => {
      const candidates = generateRankedCandidates('CA01', { communityReports: [] });
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates.every(c => c.location !== 'CA01')).toBe(true);
      expect(candidates.some(c => c.location === 'CA10')).toBe(true);
    });
  });

  describe('Generic Acoustic Heuristics vs Community Evidence (LOG-02)', () => {
    it('does NOT treat 01MM -> Z01B as a universal generic heuristic when no community reports exist', () => {
      const candidatesWithoutCommunity = generateRankedCandidates('01MM', {
        communityReports: [] // Empty community DB
      });
      const hasZ01B = candidatesWithoutCommunity.some(c => c.location === 'Z01B');
      expect(hasZ01B).toBe(false);
    });

    it('ranks Z01B strictly as community evidence when community reports are supplied', () => {
      const candidatesWithCommunity = generateRankedCandidates('01MM', {
        communityReports: seedCommunityReports
      });
      const match = candidatesWithCommunity.find(c => c.location === 'Z01B');
      expect(match).toBeDefined();
      expect(match?.type).toBe('community_report');
      expect(match?.evidence.some(e => e.includes('community') || e.includes('Bulk'))).toBe(true);
    });
  });

  describe('Dynamic Community Updates Without Redeployment', () => {
    it('immediately reflects new community reports in candidate ranking without application reload', () => {
      const initialCandidates = generateRankedCandidates('44QQ', {
        communityReports: []
      });
      expect(initialCandidates.length).toBeGreaterThan(0);

      // New community report submitted during runtime
      const updatedReports: VoiceConfusionReport[] = [
        ...seedCommunityReports,
        {
          id: 'dynamic-report-001',
          user_id: null,
          voiced_location: '44QQ',
          found_location: '44PP',
          raw_voiced_location: '44QQ',
          raw_found_location: '44PP',
          voiced_location_norm: '44QQ',
          found_location_norm: '44PP',
          heard_location: '44QQ',
          actual_location: '44PP',
          heard_location_norm: '44QQ',
          actual_location_norm: '44PP',
          reason: 'similar_sounding',
          details: 'Newly submitted community correction',
          status: 'community_submitted',
          provenance: 'community_submitted',
          confirmations_count: 1,
          flag_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const refreshedCandidates = generateRankedCandidates('44QQ', {
        communityReports: updatedReports
      });

      expect(refreshedCandidates.length).toBeGreaterThan(0);
      expect(refreshedCandidates[0].location).toBe('44PP');
      expect(['high', 'medium']).toContain(refreshedCandidates[0].confidence);
      expect(refreshedCandidates[0].reasons.some(r => r.includes('community'))).toBe(true);
    });
  });

  describe('Target Check Character Collision Filtering', () => {
    it('boosts candidates whose check character matches the target check character if provided', () => {
      const candidatesWithTarget = generateRankedCandidates('16ZG', {
        communityReports: seedCommunityReports,
        checkCharacterTarget: calculateStoreCheckCharacter('16JA')
      });

      const match = candidatesWithTarget.find(c => c.location === '16JA');
      expect(match).toBeDefined();
      expect(match?.reasons.some(r => r.includes('Check character'))).toBe(true);
    });
  });
});

