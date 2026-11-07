import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSupabaseFrom = vi.fn();

vi.mock('../supabaseClient.ts', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args)
  }
}));

import {
  fetchEvidenceForLocation,
  getEvidenceSuggestions,
  clearEvidenceCache,
  refreshEvidenceForLocation,
  setCachedEvidence,
  EVIDENCE_CACHE_TTL_MS
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      const result = await getEvidenceSuggestions('10AK', { bypassCache: true });

      expect(result.evidence.kind).toBe('available');
      if (result.evidence.kind === 'available') {
        expect(result.evidence.reports).toEqual([]);
        expect(result.evidence.isTruncated).toBe(false);
        expect(result.evidence.isHighTrustTruncated).toBe(false);
        expect(result.evidence.isUnverifiedTruncated).toBe(false);
      }
    });

    it('detects when result hits the limit and marks isTruncated = true ("results may be incomplete")', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);

      const mockReports: VoiceConfusionReport[] = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `rep-${i}`, found_location: `10D${i}` })
      );

      vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: mockReports,
        isTruncated: true,
        isHighTrustTruncated: true,
        isUnverifiedTruncated: false
      });

      const result = await getEvidenceSuggestions('10AK', { limit: 10, bypassCache: true });

      expect(result.evidence.kind).toBe('available');
      if (result.evidence.kind === 'available') {
        expect(result.evidence.reports.length).toBe(10);
        expect(result.evidence.isTruncated).toBe(true);
        expect(result.evidence.isHighTrustTruncated).toBe(true);
        expect(result.evidence.isUnverifiedTruncated).toBe(false);
      }
    });

    it('detects truncation when high-trust group is truncated while community group is not', async () => {
      // 4 queries: htVoiced (51 rows -> truncated), htFound (10 rows), unvVoiced (10 rows), unvFound (10 rows)
      const htVoicedRows = Array.from({ length: 51 }, (_, i) =>
        baseReport({ id: `ht-v-${i}`, status: 'approved', voiced_location: '10AK', found_location: `10D${i}` })
      );
      const htFoundRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `ht-f-${i}`, status: 'confirmed', voiced_location: `10E${i}`, found_location: '10AK' })
      );
      const unvVoicedRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `unv-v-${i}`, status: 'community_submitted', voiced_location: '10AK', found_location: `10F${i}` })
      );
      const unvFoundRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `unv-f-${i}`, status: 'community_submitted', voiced_location: `10G${i}`, found_location: '10AK' })
      );

      let callCount = 0;
      mockSupabaseFrom.mockImplementation(() => {
        callCount++;
        let currentData = unvFoundRows;
        if (callCount % 4 === 1) currentData = htVoicedRows;
        else if (callCount % 4 === 2) currentData = htFoundRows;
        else if (callCount % 4 === 3) currentData = unvVoicedRows;

        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockReturnValue(builder);
        builder.in = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.order = vi.fn().mockReturnValue(builder);
        builder.limit = vi.fn().mockResolvedValue({ data: currentData, error: null });
        return builder;
      });

      const res = await serviceModule.fetchLocationReports('10AK', 50);
      expect(res.isHighTrustTruncated).toBe(true);
      expect(res.isUnverifiedTruncated).toBe(false);
      expect(res.isTruncated).toBe(true);
      // Slices htVoiced to 50, keeps all others -> 50 + 10 + 10 + 10 = 80 total reports
      expect(res.reports.length).toBe(80);
    });

    it('detects truncation when community group is truncated while high-trust group is not', async () => {
      // 4 queries: htVoiced (10 rows), htFound (10 rows), unvVoiced (51 rows -> truncated), unvFound (10 rows)
      const htVoicedRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `ht-v-${i}`, status: 'approved', voiced_location: '10AK', found_location: `10D${i}` })
      );
      const htFoundRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `ht-f-${i}`, status: 'confirmed', voiced_location: `10E${i}`, found_location: '10AK' })
      );
      const unvVoicedRows = Array.from({ length: 51 }, (_, i) =>
        baseReport({ id: `unv-v-${i}`, status: 'community_submitted', voiced_location: '10AK', found_location: `10F${i}` })
      );
      const unvFoundRows = Array.from({ length: 10 }, (_, i) =>
        baseReport({ id: `unv-f-${i}`, status: 'community_submitted', voiced_location: `10G${i}`, found_location: '10AK' })
      );

      let callCount = 0;
      mockSupabaseFrom.mockImplementation(() => {
        callCount++;
        let currentData = unvFoundRows;
        if (callCount % 4 === 1) currentData = htVoicedRows;
        else if (callCount % 4 === 2) currentData = htFoundRows;
        else if (callCount % 4 === 3) currentData = unvVoicedRows;

        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockReturnValue(builder);
        builder.in = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.order = vi.fn().mockReturnValue(builder);
        builder.limit = vi.fn().mockResolvedValue({ data: currentData, error: null });
        return builder;
      });

      const res = await serviceModule.fetchLocationReports('10AK', 50);
      expect(res.isHighTrustTruncated).toBe(false);
      expect(res.isUnverifiedTruncated).toBe(true);
      expect(res.isTruncated).toBe(true);
      // Slices unvVoiced to 50, keeps all others -> 10 + 10 + 50 + 10 = 80 total reports
      expect(res.reports.length).toBe(80);
    });

    it('does NOT flag incomplete when both groups are under the limit with a merged total above 50', async () => {
      // 4 queries with 20 rows each = 80 distinct rows merged > 50, but each query is <= 50
      const htVoicedRows = Array.from({ length: 20 }, (_, i) =>
        baseReport({ id: `ht-v-${i}`, status: 'approved', voiced_location: '10AK', found_location: `10D${i}` })
      );
      const htFoundRows = Array.from({ length: 20 }, (_, i) =>
        baseReport({ id: `ht-f-${i}`, status: 'confirmed', voiced_location: `10E${i}`, found_location: '10AK' })
      );
      const unvVoicedRows = Array.from({ length: 20 }, (_, i) =>
        baseReport({ id: `unv-v-${i}`, status: 'community_submitted', voiced_location: '10AK', found_location: `10F${i}` })
      );
      const unvFoundRows = Array.from({ length: 20 }, (_, i) =>
        baseReport({ id: `unv-f-${i}`, status: 'community_submitted', voiced_location: `10G${i}`, found_location: '10AK' })
      );

      let callCount = 0;
      mockSupabaseFrom.mockImplementation(() => {
        callCount++;
        let currentData = unvFoundRows;
        if (callCount % 4 === 1) currentData = htVoicedRows;
        else if (callCount % 4 === 2) currentData = htFoundRows;
        else if (callCount % 4 === 3) currentData = unvVoicedRows;

        const builder: Record<string, unknown> = {};
        builder.select = vi.fn().mockReturnValue(builder);
        builder.in = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.order = vi.fn().mockReturnValue(builder);
        builder.limit = vi.fn().mockResolvedValue({ data: currentData, error: null });
        return builder;
      });

      const res = await serviceModule.fetchLocationReports('10AK', 50);
      expect(res.isHighTrustTruncated).toBe(false);
      expect(res.isUnverifiedTruncated).toBe(false);
      expect(res.isTruncated).toBe(false);
      expect(res.reports.length).toBe(80);
    });
  });

  describe('3. Every Report Status Assertion', () => {
    const statuses: { status: VoiceConfusionStatus; elevatesTier: boolean }[] = [
      { status: 'approved', elevatesTier: true },
      { status: 'confirmed', elevatesTier: true },
      { status: 'community_submitted', elevatesTier: false },
      { status: 'pending', elevatesTier: false },
      { status: 'flagged', elevatesTier: false },
      { status: 'rejected', elevatesTier: false },
      { status: 'archived', elevatesTier: false }
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
          isTruncated: false,
          isHighTrustTruncated: false,
          isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
          isTruncated: false,
          isHighTrustTruncated: false,
          isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
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
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      // Call 1
      await fetchEvidenceForLocation('10ak');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Call 2 with varied casing and whitespace: should use cache
      const cached = await fetchEvidenceForLocation('  10AK  ');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(cached.kind).toBe('available');
    });


    it('expires cached evidence after 5 minutes (TTL = 300,000 ms)', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [baseReport()],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      // Populate cache at time T0
      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Expire cache manually (simulate 5 minutes + 1 second elapsed)
      const expiredTimestamp = Date.now() - (EVIDENCE_CACHE_TTL_MS + 1000);
      setCachedEvidence(
        '10AK',
        {
          kind: 'available',
          reports: [baseReport()],
          isTruncated: false,
          isHighTrustTruncated: false,
          isUnverifiedTruncated: false
        },
        expiredTimestamp
      );

      // Next call must detect expired entry and refetch
      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('manual refresh path (refreshEvidenceForLocation) bypasses cache and updates cache', async () => {
      vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
      const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports').mockResolvedValue({
        reports: [baseReport()],
        isTruncated: false,
        isHighTrustTruncated: false,
        isUnverifiedTruncated: false
      });

      await fetchEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Manual refresh
      const refreshed = await refreshEvidenceForLocation('10AK');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshed.kind).toBe('available');
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
      const displayName = hostile.length > 50 ? '[5000-character string]' : hostile;
      it(`rejects hostile input "${displayName}" without querying database`, async () => {
        vi.spyOn(serviceModule, 'isPersistenceConfigured').mockReturnValue(true);
        const fetchSpy = vi.spyOn(serviceModule, 'fetchLocationReports');
        mockSupabaseFrom.mockClear();

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

        // Assert that the Supabase mock is called zero times
        expect(mockSupabaseFrom).toHaveBeenCalledTimes(0);
      });
    }
  });
});
