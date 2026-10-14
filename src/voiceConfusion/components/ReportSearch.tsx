import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { VoiceConfusionReport } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import { searchApprovedReports } from '../service.ts';

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

  const debounceTimerRef = useRef<any>(null);

  const fetchReports = useCallback(
    async (queryText: string, targetPage: number) => {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');

      try {
        const result = await searchApprovedReports({
          query: queryText.trim(),
          page: targetPage,
          pageSize
        });

        setReports(result.reports);
        setTotalCount(result.totalCount);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (err: any) {
        setHasError(true);
        setErrorMessage(err?.message || 'Could not load reports.');
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  // Debounced search on searchTerm change
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

  const handleRetry = () => {
    fetchReports(searchTerm, page);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      fetchReports(searchTerm, newPage);
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
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: 'var(--navy-900)' }}>
          Search Confusable Stockroom Locations
        </h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
          Enter either the <strong>heard location</strong> (e.g. <code>J7AZ</code>) or the <strong>actual location</strong> (e.g. <code>07AZ</code>).
        </p>
      </div>

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
          placeholder="Search location (e.g. J7AZ or 07AZ)..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value.toUpperCase())}
          aria-label="Search voice confusion reports by heard or actual location"
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
          <span>Searching verified stockroom voice confusion reports...</span>
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
          <button type="button" className="vc-btn vc-btn-secondary" onClick={handleRetry}>
            Retry Search
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
              {searchTerm ? `No verified reports found for "${searchTerm}"` : 'No reports found'}
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Have you experienced voice confusion at this shelf location?
            </p>
          </div>
          {onRequestSubmitNew && (
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              onClick={onRequestSubmitNew}
              style={{ marginTop: '0.5rem' }}
            >
              Submit a Voice Confusion Report
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
              Showing {reports.length} of {totalCount} verified report{totalCount === 1 ? '' : 's'}
            </span>
            {searchTerm && <span>Filter: "{searchTerm}"</span>}
          </div>

          <div className="vc-reports-list" role="feed" aria-label="Voice confusion search results">
            {reports.map(report => (
              <article key={report.id} className="vc-report-card">
                <div className="vc-card-top-row">
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span className="vc-badge vc-badge-community">Community-Submitted</span>
                    <span className="vc-badge vc-badge-approved">Verified by Moderator</span>
                  </div>
                  <span className="vc-report-date">{formatDate(report.created_at)}</span>
                </div>

                {/* Location Comparison */}
                <div className="vc-location-comparison">
                  <div className="vc-loc-box">
                    <span className="vc-loc-label">Heard / Recognised</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="vc-loc-value">{report.heard_location}</span>
                      {onSelectLocation && (
                        <button
                          type="button"
                          className="similar-loc-pill"
                          onClick={() => onSelectLocation(report.heard_location)}
                          title={`Test ${report.heard_location} in calculator`}
                          style={{ cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                        >
                          Check
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
                    <span className="vc-loc-label">Actual Location</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="vc-loc-value">{report.actual_location}</span>
                      {onSelectLocation && (
                        <button
                          type="button"
                          className="similar-loc-pill"
                          onClick={() => onSelectLocation(report.actual_location)}
                          title={`Test ${report.actual_location} in calculator`}
                          style={{ cursor: 'pointer', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                        >
                          Check
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div className="vc-report-reason-row">
                  <strong>Reason:</strong>
                  <span>{getReasonLabel(report.reason)}</span>
                </div>

                {/* Optional Details */}
                {report.details && (
                  <div className="vc-report-details">
                    <strong>Reported Notes:</strong> {report.details}
                  </div>
                )}
              </article>
            ))}
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
