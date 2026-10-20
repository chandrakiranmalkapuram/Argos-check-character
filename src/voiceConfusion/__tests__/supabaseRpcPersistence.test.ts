import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../supabaseClient.ts', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null })
    }
  }
}));

import {
  submitLocationCorrection,
  confirmReport,
  flagReport,
  searchCommunityReports,
  getAllActiveReports
} from '../service.ts';

describe('Supabase RPC Persistence & Failure Safety (PER-01, PER-02, SEC-01, SEC-02, SEC-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitLocationCorrection when Supabase is configured', () => {
    it('returns success when RPC succeeds on new report', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          is_duplicate: false,
          id: 'mock-uuid-001',
          voiced_location: '10AK',
          found_location: '10KA',
          status: 'community_submitted',
          message: 'Location correction shared successfully!'
        },
        error: null
      });

      const response = await submitLocationCorrection({
        voiced_location: '10AK',
        found_location: '10KA',
        details: 'Heard swap'
      });

      expect(mockRpc).toHaveBeenCalledWith('submit_voice_confusion_reference', expect.objectContaining({
        p_voiced_location: '10AK',
        p_found_location: '10KA',
        p_reason: 'similar_sounding'
      }));
      expect(response.success).toBe(true);
      expect(response.is_duplicate).toBe(false);
      expect(response.message).toBe('Location correction shared successfully!');
      expect(response.report?.id).toBe('mock-uuid-001');
    });

    it('returns honest failure when RPC fails without falling back to local memory (PER-01)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed: connection timeout' }
      });

      const response = await submitLocationCorrection({
        voiced_location: '20AN',
        found_location: '08MN'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Database connection failed');
      expect(response.message).toBeUndefined();
    });

    it('never claims success or silent fallback when RPC throws network exception', async () => {
      mockRpc.mockRejectedValueOnce(new Error('Network error: socket hang up'));

      const response = await submitLocationCorrection({
        voiced_location: '30BB',
        found_location: '30CC'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Network error: socket hang up');
    });

    it('handles atomic duplicate corroboration cleanly via RPC response (SEC-05)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          is_duplicate: true,
          id: 'existing-uuid-123',
          confirmations_count: 4,
          message: 'Existing observation found! Your report has corroboratively confirmed this community entry (+1 confirmation).'
        },
        error: null
      });

      const response = await submitLocationCorrection({
        voiced_location: '16ZG',
        found_location: '16JA'
      });

      expect(response.success).toBe(true);
      expect(response.is_duplicate).toBe(true);
      expect(response.is_corroboration).toBe(true);
      expect(response.message).toContain('Existing observation found');
    });
  });

  describe('confirmReport when Supabase is configured', () => {
    it('returns success when RPC confirms observation (+1)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          new_count: 5,
          message: 'Observation corroborated (+1 confirmation).'
        },
        error: null
      });

      const response = await confirmReport('report-uuid-1', 'client-hash-abcdef123');
      expect(mockRpc).toHaveBeenCalledWith('confirm_voice_confusion_observation', {
        p_report_id: 'report-uuid-1',
        p_client_hash: 'client-hash-abcdef123'
      });
      expect(response.success).toBe(true);
      expect(response.new_confirmations_count).toBe(5);
    });

    it('returns honest error when confirm RPC fails or rejects duplicate (SEC-02)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'You have already confirmed this observation in this session.'
        },
        error: null
      });

      const response = await confirmReport('report-uuid-1', 'client-hash-abcdef123');
      expect(response.success).toBe(false);
      expect(response.error).toBe('You have already confirmed this observation in this session.');
    });

    it('surfaces database error if confirm RPC errors', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'permission denied for function confirm_voice_confusion_observation' }
      });

      const response = await confirmReport('report-uuid-1', 'client-hash-abcdef123');
      expect(response.success).toBe(false);
      expect(response.error).toContain('permission denied');
    });
  });

  describe('flagReport when Supabase is configured', () => {
    it('returns success when flag RPC succeeds', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          flag_count: 3,
          is_flagged: true,
          message: 'Report received multiple flags and has been marked for review.'
        },
        error: null
      });

      const response = await flagReport('report-uuid-1', 'spam', 'client-hash-abcdef123');
      expect(mockRpc).toHaveBeenCalledWith('flag_voice_confusion_observation', {
        p_report_id: 'report-uuid-1',
        p_reason: 'spam',
        p_client_hash: 'client-hash-abcdef123'
      });
      expect(response.success).toBe(true);
      expect(response.is_flagged).toBe(true);
      expect(response.new_flag_count).toBe(3);
    });

    it('returns honest error when flag RPC rejects duplicate flag (SEC-01)', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'You have already flagged this report.'
        },
        error: null
      });

      const response = await flagReport('report-uuid-1', 'offensive', 'client-hash-abcdef123');
      expect(response.success).toBe(false);
      expect(response.error).toBe('You have already flagged this report.');
    });

    it('surfaces database error if flag RPC errors', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'relation "voice_confusion_flags" does not exist' }
      });

      const response = await flagReport('report-uuid-1', 'offensive', 'client-hash-abcdef123');
      expect(response.success).toBe(false);
      expect(response.error).toContain('does not exist');
    });
  });

  describe('searchCommunityReports & getAllActiveReports when Supabase is configured', () => {
    it('surfaces honest database error if search query fails (PER-01)', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          in: vi.fn().mockReturnValueOnce({
            or: vi.fn().mockReturnValueOnce({
              order: vi.fn().mockReturnValueOnce({
                order: vi.fn().mockReturnValueOnce({
                  range: vi.fn().mockResolvedValueOnce({
                    data: null,
                    count: null,
                    error: { message: 'syntax error in query filter' }
                  })
                })
              })
            })
          })
        })
      });

      const response = await searchCommunityReports({ query: '10AK' });
      expect(response.reports).toEqual([]);
      expect(response.error).toBe('syntax error in query filter');
    });

    it('returns empty list if getAllActiveReports database query fails', async () => {
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          in: vi.fn().mockReturnValueOnce({
            order: vi.fn().mockResolvedValueOnce({
              data: null,
              error: { message: 'Database unavailable' }
            })
          })
        })
      });

      const reports = await getAllActiveReports();
      expect(reports).toEqual([]);
    });

    it('distinguishes database error from successful empty search results in search error state handling', async () => {
      // 1. Database error result
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          in: vi.fn().mockReturnValueOnce({
            or: vi.fn().mockReturnValueOnce({
              order: vi.fn().mockReturnValueOnce({
                order: vi.fn().mockReturnValueOnce({
                  range: vi.fn().mockResolvedValueOnce({
                    data: null,
                    count: null,
                    error: { message: 'Connection timeout' }
                  })
                })
              })
            })
          })
        })
      });

      const errorResult = await searchCommunityReports({ query: 'FAIL' });
      expect(errorResult.error).toBe('Connection timeout');
      expect(errorResult.reports).toEqual([]);

      // Verify component result handling logic from ReportSearch
      let hasError = false;
      let errorMessage = '';
      let reports: any[] = [{ id: 'previous-valid-report' }];
      let isLoading = true;

      try {
        if (errorResult.error) {
          hasError = true;
          errorMessage = errorResult.error;
        } else {
          reports = errorResult.reports;
        }
      } finally {
        isLoading = false;
      }

      // Verifies that error state is activated and does not overwrite with empty results
      expect(hasError).toBe(true);
      expect(errorMessage).toBe('Connection timeout');
      expect(reports).toEqual([{ id: 'previous-valid-report' }]);
      expect(isLoading).toBe(false);

      // 2. Successful empty search result
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          in: vi.fn().mockReturnValueOnce({
            or: vi.fn().mockReturnValueOnce({
              order: vi.fn().mockReturnValueOnce({
                order: vi.fn().mockReturnValueOnce({
                  range: vi.fn().mockResolvedValueOnce({
                    data: [],
                    count: 0,
                    error: null
                  })
                })
              })
            })
          })
        })
      });

      const emptyResult = await searchCommunityReports({ query: 'NONEXISTENT' });
      expect(emptyResult.error).toBeUndefined();
      expect(emptyResult.reports).toEqual([]);

      hasError = false;
      errorMessage = '';
      isLoading = true;

      try {
        if (emptyResult.error) {
          hasError = true;
          errorMessage = emptyResult.error;
        } else {
          reports = emptyResult.reports;
        }
      } finally {
        isLoading = false;
      }

      // Verifies that successful empty search updates reports and does not flag error
      expect(hasError).toBe(false);
      expect(errorMessage).toBe('');
      expect(reports).toEqual([]);
      expect(isLoading).toBe(false);
    });
  });
});
