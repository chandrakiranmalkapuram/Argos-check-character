import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchEvidenceForLocation,
  getEvidenceSuggestions,
  clearEvidenceCache,
  refreshEvidenceForLocation,
  setCachedEvidence,
  EVIDENCE_CACHE_TTL_MS,
  CommittedEvidenceCoordinator
} from '../evidenceAdapter.ts';
import * as serviceModule from '../service.ts';
import type { VoiceConfusionReport, VoiceConfusionStatus, VoiceConfusionReason } from '../types.ts';

describe('Milestone 5: Read-Only Evidence Adapter', () => {
  beforeEach(() => {
    clearEvidenceCache();
    vi.restoreAllMocks();
  });

  const baseReport = (overrides?: Partial<VoiceConfusionReport>): VoiceConfusionReport => {
    const voiced = overrides?.voiced_location ?? '10AK';
    const found = overrides?.found_location ?? '10DD';
    return {
      id: 'rep-test-01',
      user_id: null,
      voiced_location: voiced,
      found_location: found,
      voiced_location_norm: overrides?.voiced_location_norm ?? voiced,
      found_location_norm: overrides?.found_location_norm ?? found,
      reason: 'similar_sounding',
      status: 'approved',
      provenance: 'moderator_confirmed',
      confirmations_count: 3,
      flag_count: 0,
      created_at: '2026-11-01T12:00:00Z',
      updated_at: '2026-11-01T12:00:00Z',
      ...overrides
    };
  };

  describe('1. Unconfigured Supabase and Fetch Errors', () => {
    it('returns "community evidence unavailable" when Supabase persistence is unconfigured, while engine still returns phonetic results', async () => {
      // Mock unconfigured persistence
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(false);

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });

      // Evidence must be unavailable with the exact required message
      expect(result.evidence.kind).toBe('unavailable');
      if (result.evidence.kind === 'unavailable') {
        expect(result.evidence.userMessage).toBe('community evidence unavailable');
        expect(result.evidence.reason).toBe('database_not_configured');
      }

      // Engine STILL returns valid phonetic results based on NATO model
      expect(result.suggestionResult.isValid).toBe(true);
      expect(result.suggestionResult.checkChar).toBe('NOVEMBER');
      expect(result.suggestionResult.candidates.length).toBeGreaterThan(0);

      // Verify 10DD ranks on phonetics alone (Tier 2 model similar)
      const cand10DD = result.suggestionResult.candidates.find(c => c.location === '10DD');
      expect(cand10DD).toBeDefined();
      expect(cand10DD?.tier).toBe('tier2_model_similar');
    });

    it('returns "community evidence unavailable" when a database fetch error occurs, never "no reports"', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      vi.spyOn(serviceModule, 'fetchLocationReports').mockRejectedValue(
        new Error('Connection timeout to Supabase PostgREST endpoint')
      );

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });

      expect(result.evidence.kind).toBe('unavailable');
      if (result.evidence.kind === 'unavailable') {
        expect(result.evidence.userMessage).toBe('community evidence unavailable');
        expect(result.evidence.reason).toContain('Connection timeout');
      }

      // Engine still returns phonetic results
      expect(result.suggestionResult.isValid).toBe(true);
      expect(result.suggestionResult.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('2. Empty Results and Safety Limit Truncation', () => {
    it('handles empty database results gracefully as available with 0 reports', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [],
        isTruncated: false
      });

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });

      expect(result.evidence.kind).toBe('available');
      if (result.evidence.kind === 'available') {
        expect(result.evidence.reports).toEqual([]);
        expect(result.evidence.isTruncated).toBe(false);
      }
    });

    it('detects when result hits the limit and marks isTruncated = true ("results may be incomplete")', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      const mockReports: VoiceConfusionReport[] = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `rep-${i}`, found_location: `10D${i}` })
      );

      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: mockReports,
        isTruncated: true
      });

      const result = await getEvidenceSuggestions('10AK', { limit: 10, bypassCache: true });

      expect(result.evidence.kind).toBe('available');
      if (result.evidence.kind === 'available') {
        expect(result.evidence.reports.length).toBe(10);
        expect(result.evidence.isTruncated).toBe(true);
      }
    });
  });

  describe('3. Every Report Status Assertion', () => {
    const statuses: { status: VoiceConfusionStatus; elevatesTier: boolean }[] = [
      { status: 'approved', elevatesTier: true },
      { status: 'confirmed', elevatesTier: true },
      { status: 'community_submitted', elevatesTier: false },
      { status: 'pending', elevatesTier: false },
      { status: 'flagged', elevatesTier: false },
      { status: 'rejected', elevatesTier: false }
    ];

    for (const { status, elevatesTier } of statuses) {
      it(`verifies status "${status}": elevatesTier = ${elevatesTier}`, async () => {
        vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

        const rep = baseReport({
          status,
          provenance: status === 'approved' ? 'moderator_confirmed' : 'community_submitted',
          found_location: '10BZ' // 10BZ is phonetically Tier 3
        });

        vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
          reports: [rep],
          isTruncated: false
        });

        const result = await getEvidenceSuggestions('10AK', { bypassCache: true });
        const cand10BZ = result.suggestionResult.candidates.find(c => c.location === '10BZ');

        if (elevatesTier) {
          expect(cand10BZ?.tier, `Status ${status} should elevate to Tier 1`).toBe('tier1_reported');
        } else {
          expect(cand10BZ?.tier, `Status ${status} must NOT elevate to Tier 1`).toBe('tier3_possible');
        }
      });
    }

    it('verifies seed_observation provenance NEVER elevates a tier even when status is approved', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      const seedRep = baseReport({
        provenance: 'seed_observation',
        status: 'approved',
        found_location: '10BZ'
      });

      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [seedRep],
        isTruncated: false
      });

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });
      const cand10BZ = result.suggestionResult.candidates.find(c => c.location === '10BZ');

      // Seed observation must never elevate
      expect(cand10BZ?.tier).toBe('tier3_possible');
      expect(cand10BZ?.isReferenceExample).toBe(true);
    });
  });

  describe('4. Every Report Reason Assertion (Decision D11 Option A)', () => {
    const reasons: { reason: VoiceConfusionReason; elevatesTier: boolean; expectedLabel: string }[] = [
      { reason: 'similar_sounding', elevatesTier: true, expectedLabel: 'Approved' },
      { reason: 'headset_misrecognition', elevatesTier: true, expectedLabel: 'Approved' },
      {
        reason: 'similar_check_character',
        elevatesTier: false,
        expectedLabel: 'Reported (layout / check-character), does not affect ranking'
      },
      {
        reason: 'other',
        elevatesTier: false,
        expectedLabel: 'Reported (layout / check-character), does not affect ranking'
      }
    ];

    for (const { reason, elevatesTier, expectedLabel } of reasons) {
      it(`evaluates reason "${reason}": elevatesTier = ${elevatesTier}, label = "${expectedLabel}"`, async () => {
        vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

        const rep = baseReport({
          reason,
          status: 'approved',
          provenance: 'moderator_confirmed',
          found_location: '10BZ'
        });

        vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
          reports: [rep],
          isTruncated: false
        });

        const result = await getEvidenceSuggestions('10AK', { bypassCache: true });
        const cand10BZ = result.suggestionResult.candidates.find(c => c.location === '10BZ');

        if (elevatesTier) {
          expect(cand10BZ?.tier).toBe('tier1_reported');
        } else {
          expect(cand10BZ?.tier).toBe('tier3_possible');
        }

        const repEntry = result.suggestionResult.reportedPairs.find(p => p.reportedLocation === '10BZ');
        expect(repEntry?.label).toBe(expectedLabel);
        expect(repEntry?.reason).toBe(reason);
      });
    }
  });

  describe('5. Both Directions (voiced_to_found vs opposite_direction)', () => {
    it('elevates candidate in voiced_to_found direction, but never in opposite_direction', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      // Report: Voiced 10AK -> Found 10DD
      const fwdRep = baseReport({
        voiced_location: '10AK',
        found_location: '10DD',
        status: 'approved',
        provenance: 'moderator_confirmed'
      });

      // Forward query: user entered 10AK
      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [fwdRep],
        isTruncated: false
      });

      const fwdResult = await getEvidenceSuggestions('10AK', { bypassCache: true });
      const cand10DD = fwdResult.suggestionResult.candidates.find(c => c.location === '10DD');
      expect(cand10DD?.tier).toBe('tier1_reported');

      const fwdEntry = fwdResult.suggestionResult.reportedPairs.find(p => p.reportedLocation === '10DD');
      expect(fwdEntry?.direction).toBe('voiced_to_found');

      // Reverse query: user entered 10DD (found location of the report)
      const revResult = await getEvidenceSuggestions('10DD', { bypassCache: true });
      const cand10AK = revResult.suggestionResult.candidates.find(c => c.location === '10AK');
      // Reverse direction must NEVER raise a tier
      expect(cand10AK?.tier).not.toBe('tier1_reported');

      const revEntry = revResult.suggestionResult.reportedPairs.find(p => p.reportedLocation === '10AK');
      expect(revEntry?.direction).toBe('opposite_direction');
    });
  });

  describe('6. Different-Check Report Isolation', () => {
    it('isolates different-check reports completely from candidate suggestions', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      // Report: Voiced 10AK (NOVEMBER) -> Found 10KA (BRAVO)
      const diffRep = baseReport({
        voiced_location: '10AK',
        found_location: '10KA',
        status: 'approved',
        provenance: 'moderator_confirmed'
      });

      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [diffRep],
        isTruncated: false
      });

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });

      // 10KA must NOT appear in candidate suggestions
      expect(result.suggestionResult.candidates.map(c => c.location)).not.toContain('10KA');

      // 10KA MUST appear in differentCheckCommunityReports
      const diff = result.suggestionResult.differentCheckCommunityReports.find(
        d => d.reportedLocation === '10KA'
      );
      expect(diff).toBeDefined();
      expect(diff?.reportedCheckChar).toBe('BRAVO');
      expect(diff?.inputCheckChar).toBe('NOVEMBER');
      expect(diff?.explanation).toContain('would normally be rejected by the check-character step');
    });
  });

  describe('7. Caching and Stale Response Coordinator', () => {
    it('caches successful fetches by normalised location and skips duplicate network calls', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [baseReport()],
        isTruncated: false
      });

      // Call 1
      await fetchEvidenceForLocation('10ak');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Call 2 with varied casing and whitespace: should use cache
      const cached = await fetchEvidenceForLocation('  10AK  ');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(cached.kind).toBe('available');
    });

    it('coordinator debounces calls and ignores stale in-flight responses', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      const coordinator = new CommittedEvidenceCoordinator();
      const results: string[] = [];

      // Fast typing simulation: '1', '10', '10A', '10AK'
      // scheduleFetch cancels previous timers
      coordinator.scheduleFetch('10A', res => {
        results.push(res.suggestionResult.inputLocation);
      }, 50);

      coordinator.scheduleFetch('10AK', res => {
        results.push(res.suggestionResult.inputLocation);
      }, 50);

      // Wait for debounce timer to fire
      await new Promise(r => setTimeout(r, 80));

      // Only the last committed request ('10AK') should have completed
      expect(results).toEqual(['10AK']);
    });

    it('expires cached evidence after 5 minutes (TTL = 300,000 ms)', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [baseReport()],
        isTruncated: false
      });

      // Populate cache at time T0
      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Expire cache manually (simulate 5 minutes + 1 second elapsed)
      const expiredTimestamp = Date.now() - (EVIDENCE_CACHE_TTL_MS + 1000);
      setCachedEvidence('10AK', { kind: 'available', reports: [baseReport()], isTruncated: false }, expiredTimestamp);

      // Next call must detect expired entry and refetch
      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('manual refresh path (refreshEvidenceForLocation) bypasses cache and updates cache', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [baseReport()],
        isTruncated: false
      });

      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Manual refresh
      const refreshed = await refreshEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshed.kind).toBe('available');
    });

    it('ignores stale in-flight response when committed input has changed while request was in flight', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      const coordinator = new CommittedEvidenceCoordinator();
      const results: string[] = [];

      // Mock fetchLocationReports with variable delays
      vi.spyOn(serviceModule, 'fetchLocationReports').mockImplementation(async (loc: string) => {
        if (loc === '10AK') {
          // Slow response: 80ms
          await new Promise(r => setTimeout(r, 80));
          return { reports: [baseReport({ voiced_location: '10AK' })], isTruncated: false };
        } else {
          // Fast response: 10ms
          await new Promise(r => setTimeout(r, 10));
          return { reports: [baseReport({ voiced_location: '21EZ', found_location: '11BZ' })], isTruncated: false };
        }
      });

      // Commit 1st input '10AK' (slow, in flight)
      const p1 = coordinator.commitInput('10AK', res => {
        results.push(`P1:${res.suggestionResult.inputLocation}`);
      }, { bypassCache: true });

      // Immediate commit of 2nd input '21EZ' (fast)
      const p2 = coordinator.commitInput('21EZ', res => {
        results.push(`P2:${res.suggestionResult.inputLocation}`);
      }, { bypassCache: true });

      await Promise.all([p1, p2]);

      // Only the 2nd committed input '21EZ' must have delivered its callback.
      // The 1st in-flight response ('10AK') finished later and was strictly ignored!
      expect(results).toEqual(['P2:21EZ']);
    });
  });

  describe('8. Input Hardening: Hostile String Rejection (Security & PostgREST Safety)', () => {
    const hostileInputs = [
      '10AK,status.eq.rejected',
      '10AK)',
      '10AK.',
      '*',
      '10AK%2C',
      'A'.repeat(5000)
    ];

    for (const hostile of hostileInputs) {
      it(`rejects hostile input "${hostile.length > 20 ? hostile.slice(0, 15) + '... (5000 chars)' : hostile}" without querying database`, async () => {
        vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
        const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports');

        // fetchEvidenceForLocation must return 'unavailable' with reason 'invalid_location_format'
        const result = await fetchEvidenceForLocation(hostile, { forceConfigured: true });
        expect(result.kind).toBe('unavailable');
        if (result.kind === 'unavailable') {
          expect(result.userMessage).toBe('community evidence unavailable');
          expect(result.reason).toBe('invalid_location_format');
        }

        // fetchEvidenceForLocation rejected before calling fetchLocationReports
        expect(fetchSpy).not.toHaveBeenCalled();

        // Direct call to fetchLocationReports also rejects immediately with an Error
        await expect(serviceModule.fetchLocationReports(hostile)).rejects.toThrow(
          /Invalid location code format for reports query/
        );
      });
    }
  });
});
