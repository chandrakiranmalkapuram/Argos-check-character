import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { VoiceConfusionReport } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import { searchCommunityReports, confirmReport, flagReport } from '../service.ts';

interface ReportSearchProps {
  initialQuery?: string;
  onSelectLocation?: (loc: string) => void;
  onRequestSubmitNew?: () => void;
}

export const ReportSearch: React.FC<ReportSearchProps> = ({
  initialQuery = '',
  onSelectLocation,
  onRequestSubmitNew
}) => {
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [reports, setReports] = useState<VoiceConfusionReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Track reports confirmed or flagged in the current session
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const debounceTimerRef = useRef<any>(null);

  const fetchReports = useCallback(
    async (queryText: string, targetPage: number) => {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');

      try {
        const result = await searchCommunityReports({
          query: queryText.trim(),
          page: targetPage,
          pageSize
        });

        if (result.error) {
          setHasError(true);
          setErrorMessage(result.error);
        } else {
          setReports(result.reports);
          setTotalCount(result.totalCount);
          setPage(result.page);
          setTotalPages(result.totalPages);
        }
      } catch (err: any) {
        setHasError(true);
        setErrorMessage(err?.message || 'Could not load community reference database.');
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setPage(1);
      fetchReports(searchTerm, 1);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, fetchReports]);

  const handleClear = () => {
    setSearchTerm('');
  };

  const handleRefresh = () => {
    fetchReports(searchTerm, page);
    setActionNotice('Reference database refreshed.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      fetchReports(searchTerm, newPage);
    }
  };

  const handleConfirm = async (reportId: string) => {
    try {
      const res = await confirmReport(reportId);
      if (res.success && res.newConfirmationsCount !== undefined) {
        setConfirmedIds(prev => new Set(prev).add(reportId));
        setReports(prev =>
          prev.map(r =>
            r.id === reportId
              ? {
                  ...r,
                  confirmations_count: res.newConfirmationsCount!,
                  status: res.newConfirmationsCount! >= 3 && r.status === 'community_submitted' ? 'confirmed' : r.status
                }
              : r
          )
        );
        setActionNotice(res.message || 'Observation confirmed (+1).');
        setTimeout(() => setActionNotice(null), 4000);
      } else if (res.error) {
        setActionNotice(res.error);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch {
      setActionNotice('Failed to record confirmation.');
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleFlag = async (reportId: string) => {
    if (!window.confirm('Flag this report as incorrect, abusive, or spam for review?')) {
      return;
    }

    try {
      const res = await flagReport(reportId, 'Reported by community user');
      if (res.success) {
        setFlaggedIds(prev => new Set(prev).add(reportId));
        if (res.isFlagged) {
          // Demote or remove from current list
          setReports(prev => prev.filter(r => r.id !== reportId));
          setTotalCount(prev => Math.max(0, prev - 1));
        }
        setActionNotice(res.message || 'Report flagged for review.');
        setTimeout(() => setActionNotice(null), 4000);
      } else if (res.error) {
        setActionNotice(res.error);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch {
      setActionNotice('Failed to flag report.');
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const getReasonLabel = (reasonKey: string) => {
    return VOICE_CONFUSION_REASONS.find(r => r.value === reasonKey)?.label || reasonKey;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="vc-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: 'var(--navy-900)' }}>
            Shared Voice Confusion Reference Database
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
            Community-reported observations of voice-confused and unreferenced locations across stockroom zones.
          </p>
        </div>

        <button
          type="button"
          className="vc-btn vc-btn-secondary"
          onClick={handleRefresh}
          title="Refresh latest community submissions"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Notice Banner */}
      {actionNotice && (
        <div
          className="vc-disclaimer fade-in"
          style={{
            background: 'var(--blue-50)',
            borderColor: 'var(--blue-300)',
            marginBottom: '1rem',
            padding: '0.6rem 0.9rem'
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: 'var(--blue-900)' }}>{actionNotice}</span>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="vc-search-bar" role="search">
        <svg
          className="vc-search-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          type="text"
          className="vc-search-input"
          placeholder="Filter by voiced code or found code (e.g. 08MN, 20AN, 16ZG, Z01B)..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value.toUpperCase())}
          aria-label="Filter voice confusion reports by voiced or found location"
        />

        {searchTerm && (
          <button
            type="button"
            className="vc-search-clear"
            onClick={handleClear}
            title="Clear search"
            aria-label="Clear search text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="vc-state-box" style={{ marginTop: '1.5rem' }}>
          <div className="spinner" style={{ width: '28px', height: '28px' }} />
          <span>Loading shared community voice confusion records...</span>
        </div>
      )}

      {/* Error State with Retry */}
      {!isLoading && hasError && (
        <div className="vc-state-box" style={{ marginTop: '1.5rem', borderColor: 'var(--rose-300)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--rose-600)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ fontWeight: 600, color: 'var(--rose-700)' }}>{errorMessage}</div>
          <button type="button" className="vc-btn vc-btn-secondary" onClick={() => fetchReports(searchTerm, page)}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !hasError && reports.length === 0 && (
        <div className="vc-state-box" style={{ marginTop: '1.5rem' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--slate-800)', marginBottom: '0.25rem' }}>
              {searchTerm ? `No reference reports found matching "${searchTerm}"` : 'No community reports recorded yet'}
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Have you experienced a voice misrecognition or unreferenced location for this shelf?
            </p>
          </div>
          {onRequestSubmitNew && (
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              onClick={onRequestSubmitNew}
              style={{ marginTop: '0.5rem' }}
            >
              Share Location Correction
            </button>
          )}
        </div>
      )}

      {/* Results List */}
      {!isLoading && !hasError && reports.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: '1.25rem',
              marginBottom: '0.5rem',
              fontSize: '0.8125rem',
              color: 'var(--slate-500)'
            }}
          >
            <span>
              Showing {reports.length} of {totalCount} shared reference report{totalCount === 1 ? '' : 's'}
            </span>
            {searchTerm && <span>Filtered by: "{searchTerm}"</span>}
          </div>

          <div className="vc-reports-list" role="feed" aria-label="Shared voice confusion records">
            {reports.map(report => {
              const voicedCode = report.voiced_location || report.heard_location || '';
              const foundCode = report.found_location || report.actual_location || '';
              const confirmations = report.confirmations_count || 1;
              const isConfirmed = report.status === 'confirmed' || confirmations >= 3;
              const isSeed = report.provenance === 'seed_observation';
              const hasUserConfirmed = confirmedIds.has(report.id);
              const hasUserFlagged = flaggedIds.has(report.id);

              return (
                <article key={report.id} className="vc-report-card">
                  <div className="vc-card-top-row">
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {isSeed ? (
                        <span className="vc-badge vc-badge-pending" style={{ background: 'var(--slate-100)', color: 'var(--slate-700)', borderColor: 'var(--slate-300)' }}>
                          Seed Observation
                        </span>
                      ) : isConfirmed ? (
                        <span className="vc-badge vc-badge-approved">
                          Independently Corroborated ({confirmations} confirmations)
                        </span>
                      ) : (
                        <span className="vc-badge vc-badge-community">
                          Community Report (Unverified — {confirmations} report{confirmations > 1 ? 's' : ''})
                        </span>
                      )}

                      <span
                        className="vc-badge"
                        style={{
                          background: 'rgba(37, 99, 235, 0.08)',
                          color: 'var(--blue-700, #1d4ed8)',
                          borderColor: 'var(--blue-200, #bfdbfe)'
                        }}
                      >
                        {confirmations} Confirmation{confirmations > 1 ? 's' : ''}
                      </span>
                    </div>

                    <span className="vc-report-date">{formatDate(report.created_at)}</span>
                  </div>

                  {/* Location Comparison */}
                  <div className="vc-location-comparison">
                    <div className="vc-loc-box">
                      <span className="vc-loc-label">Voiced Location (Heard)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="vc-loc-value">{voicedCode}</span>
                        {onSelectLocation && (
                          <button
                            type="button"
                            className="similar-loc-pill"
                            onClick={() => onSelectLocation(voicedCode)}
                            title={`Calculate check character for ${voicedCode}`}
                            style={{ cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            Calculate
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="vc-loc-arrow" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </div>

                    <div className="vc-loc-box">
                      <span className="vc-loc-label">Found Location (Physical)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="vc-loc-value">{foundCode}</span>
                        {onSelectLocation && (
                          <button
                            type="button"
                            className="similar-loc-pill"
                            onClick={() => onSelectLocation(foundCode)}
                            title={`Calculate check character for ${foundCode}`}
                            style={{ cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            Calculate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reason & Details */}
                  <div className="vc-report-reason-row">
                    <strong>Operational Reason:</strong>
                    <span>{getReasonLabel(report.reason)}</span>
                  </div>

                  {report.details && (
                    <div className="vc-report-details">
                      <strong>Worker Notes:</strong> {report.details}
                    </div>
                  )}

                  {/* Interactive Community Actions: Corroboration & Flagging */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--slate-100)'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="vc-btn vc-btn-secondary"
                        disabled={hasUserConfirmed}
                        onClick={() => handleConfirm(report.id)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.6rem',
                          color: hasUserConfirmed ? 'var(--emerald-700)' : undefined,
                          borderColor: hasUserConfirmed ? 'var(--emerald-300)' : undefined
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{hasUserConfirmed ? 'Confirmed (+1)' : 'Confirm observation (+1)'}</span>
                      </button>

                      <button
                        type="button"
                        className="vc-btn vc-btn-secondary"
                        disabled={hasUserFlagged}
                        onClick={() => handleFlag(report.id)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          color: hasUserFlagged ? 'var(--rose-600)' : 'var(--slate-500)',
                          border: 'none',
                          background: 'transparent'
                        }}
                        title="Flag incorrect or abusive report"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                        <span>{hasUserFlagged ? 'Flagged' : 'Flag'}</span>
                      </button>
                    </div>

                    <span style={{ fontSize: '0.6875rem', color: 'var(--slate-400)' }}>
                      ID: {report.id.substring(0, 13)}...
                    </span>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="vc-pagination">
              <button
                type="button"
                className="vc-btn vc-btn-secondary"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="vc-btn vc-btn-secondary"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
