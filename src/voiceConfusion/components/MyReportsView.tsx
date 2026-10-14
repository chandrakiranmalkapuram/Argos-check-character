import React, { useState, useEffect } from 'react';
import type { VoiceConfusionReport, AuthUser } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import { fetchUserReports } from '../service.ts';

interface MyReportsViewProps {
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  onRequestSubmitNew: () => void;
}

export const MyReportsView: React.FC<MyReportsViewProps> = ({
  currentUser,
  onOpenAuth,
  onRequestSubmitNew
}) => {
  const [reports, setReports] = useState<VoiceConfusionReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (currentUser) {
      Promise.resolve().then(() => {
        if (!ignore) {
          setIsLoading(true);
          setError(null);
        }
      });
      fetchUserReports()
        .then(data => {
          if (!ignore) {
            setReports(data);
            setIsLoading(false);
          }
        })
        .catch(err => {
          if (!ignore) {
            setError(err?.message || 'Failed to load your reports.');
            setIsLoading(false);
          }
        });
    } else {
      Promise.resolve().then(() => {
        if (!ignore) setReports([]);
      });
    }
    return () => {
      ignore = true;
    };
  }, [currentUser]);

  const getReasonLabel = (reasonKey: string) => {
    return VOICE_CONFUSION_REASONS.find(r => r.value === reasonKey)?.label || reasonKey;
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // If not signed in: show sign in prompt for tracking
  if (!currentUser) {
    return (
      <div className="vc-card">
        <div className="vc-state-box">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--navy-900)' }}>Track Your Submissions</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Submitting reports is open to everyone without login. If you would like to track the review status of your personal submissions across sessions, sign in with your email.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="vc-btn vc-btn-primary" onClick={onOpenAuth}>
              Sign In with Magic Link
            </button>
            <button type="button" className="vc-btn vc-btn-secondary" onClick={onRequestSubmitNew}>
              Submit a Report (No Login Needed)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: 'var(--navy-900)' }}>
            My Voice Confusion Reports
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
            Logged in as <strong>{currentUser.email}</strong>. Track the review status of your submitted reports.
          </p>
        </div>

        <button type="button" className="vc-btn vc-btn-secondary" onClick={onRequestSubmitNew}>
          + Submit Another Report
        </button>
      </div>

      {isLoading && (
        <div className="vc-state-box">
          <div className="spinner" style={{ width: '28px', height: '28px' }} />
          <span>Retrieving your submissions...</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="vc-disclaimer" style={{ background: 'var(--rose-50)', borderColor: 'var(--rose-500)' }}>
          <span>{error}</span>
        </div>
      )}

      {!isLoading && !error && reports.length === 0 && (
        <div className="vc-state-box">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--slate-800)', marginBottom: '0.25rem' }}>
              No submissions found
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              You haven't submitted any voice confusion reports yet.
            </p>
          </div>
          <button type="button" className="vc-btn vc-btn-primary" onClick={onRequestSubmitNew}>
            Submit Your First Report
          </button>
        </div>
      )}

      {!isLoading && !error && reports.length > 0 && (
        <div className="vc-reports-list">
          {reports.map(report => (
            <article key={report.id} className="vc-report-card">
              <div className="vc-card-top-row">
                <span
                  className={`vc-badge ${
                    report.status === 'approved'
                      ? 'vc-badge-approved'
                      : report.status === 'rejected'
                      ? 'vc-badge-rejected'
                      : 'vc-badge-pending'
                  }`}
                >
                  {report.status === 'approved' && 'Status: Verified & Approved'}
                  {report.status === 'pending' && 'Status: Pending Review'}
                  {report.status === 'rejected' && 'Status: Rejected'}
                </span>
                <span className="vc-report-date">{formatDate(report.created_at)}</span>
              </div>

              <div className="vc-location-comparison">
                <div className="vc-loc-box">
                  <span className="vc-loc-label">Heard</span>
                  <span className="vc-loc-value">{report.heard_location}</span>
                </div>
                <div className="vc-loc-arrow">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
                <div className="vc-loc-box">
                  <span className="vc-loc-label">Actual Location</span>
                  <span className="vc-loc-value">{report.actual_location}</span>
                </div>
              </div>

              <div className="vc-report-reason-row">
                <strong>Reason:</strong>
                <span>{getReasonLabel(report.reason)}</span>
              </div>

              {report.details && (
                <div className="vc-report-details">
                  <strong>Your Notes:</strong> {report.details}
                </div>
              )}

              {report.moderator_notes && (
                <div
                  className="vc-report-details"
                  style={{
                    background: report.status === 'approved' ? 'var(--emerald-50)' : 'var(--rose-50)',
                    borderColor: report.status === 'approved' ? 'var(--emerald-200)' : 'var(--rose-200)',
                    marginTop: '0.5rem'
                  }}
                >
                  <strong style={{ color: report.status === 'approved' ? 'var(--emerald-800)' : 'var(--rose-800)' }}>
                    Moderator Feedback:
                  </strong>{' '}
                  {report.moderator_notes}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
