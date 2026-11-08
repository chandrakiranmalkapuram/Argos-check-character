// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ReportSearch } from '../components/ReportSearch.tsx';
import * as serviceModule from '../service.ts';
import type { VoiceConfusionReport } from '../types.ts';

describe('ReportSearch Component — Decision D15 & D16 Details and Labels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const baseReport = (overrides?: Partial<VoiceConfusionReport>): VoiceConfusionReport => {
    const voiced = overrides?.voiced_location ?? '10AK';
    const found = overrides?.found_location ?? '10KA';
    return {
      id: 'rep-search-01',
      user_id: null,
      voiced_location: voiced,
      found_location: found,
      voiced_location_norm: overrides?.voiced_location_norm ?? voiced,
      found_location_norm: overrides?.found_location_norm ?? found,
      reason: 'similar_sounding',
      status: 'approved',
      provenance: 'community_submitted',
      confirmations_count: 3,
      flag_count: 0,
      created_at: '2026-11-01T12:00:00Z',
      updated_at: '2026-11-01T12:00:00Z',
      ...overrides
    };
  };

  it('Decision D15 & D16: suppresses details for seed_observation, but renders them with Reporter\'s note label for community_submitted', async () => {
    vi.spyOn(serviceModule, 'searchCommunityReports').mockResolvedValue({
      reports: [
        baseReport({
          id: 'rep-seed-d15',
          voiced_location: '10AK',
          found_location: '10KA',
          provenance: 'seed_observation',
          details: 'Adjacent character swap produces the same check character in standard formula'
        }),
        baseReport({
          id: 'rep-community-d15',
          voiced_location: '16ZG',
          found_location: '16JA',
          provenance: 'community_submitted',
          details: 'High radio interference in aisle 16'
        })
      ],
      totalCount: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    render(<ReportSearch initialQuery="10AK" />);

    await waitFor(() => {
      expect(screen.getByText('High radio interference in aisle 16')).toBeTruthy();
    });

    // Decision D16: Label is "Reporter's note (free text, unverified):"
    expect(screen.getByText(/Reporter's note \(free text, unverified\):/)).toBeTruthy();
    expect(screen.getByText('High radio interference in aisle 16')).toBeTruthy();

    // Decision D15: Details for seed_observation are suppressed
    expect(
      screen.queryByText('Adjacent character swap produces the same check character in standard formula')
    ).toBeNull();
  });
});
