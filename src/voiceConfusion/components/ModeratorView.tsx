import React, { useState, useEffect, useCallback } from 'react';
import type { VoiceConfusionReport, VoiceConfusionStatus, AuthUser } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import {
  fetchModerationQueue,
  updateReportModerationStatus,
  signOutUser
} from '../service.ts';

interface ModeratorViewProps {
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
}

export const ModeratorView: React.FC<ModeratorViewProps> = ({ currentUser, onOpenAuth }) => {
  const [statusFilter, setStatusFilter] = useState<VoiceConfusionStatus>('pending');
  const [reports, setReports] = useState<VoiceConfusionReport[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Moderator feedback notes per report
  const [notesState, setNotesState] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async (filter: VoiceConfusionStatus) => {
    setIsLoadingQueue(true);
    setActionError(null);
    try {
      const data = await fetchModerationQueue(filter);
      setReports(data);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load moderation queue.');
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  // Reload queue when currentUser or filter changes
  useEffect(() => {
    let ignore = false;
    if (currentUser?.isModerator) {
      Promise.resolve().then(() => {
        if (!ignore) setIsLoadingQueue(true);
      });
      fetchModerationQueue(statusFilter)
        .then(data => {
          if (!ignore) {
            setReports(data);
            setIsLoadingQueue(false);
          }
        })
        .catch(err => {
          if (!ignore) {
            setActionError(err?.message || 'Failed to load moderation queue.');
            setIsLoadingQueue(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [currentUser, statusFilter]);

  const handleStatusChange = async (reportId: string, newStatus: VoiceConfusionStatus) => {
    setActionError(null);
    setActionSuccess(null);

    const notes = notesState[reportId]?.trim() || undefined;
    const res = await updateReportModerationStatus(reportId, newStatus, notes);
    if (!res.success) {
      setActionError(res.error || 'Failed to update report status.');
      return;
    }

    setActionSuccess(`Report successfully marked as ${newStatus}.`);
    // Refresh queue
    loadQueue(statusFilter);
  };

  const getReasonLabel = (reasonKey: string) => {
    return VOICE_CONFUSION_REASONS.find(r => r.value === reasonKey)?.label || reasonKey;
  };

  // 1. Not signed in
  if (!currentUser) {
    return (
      <div className="vc-card">
        <div className="vc-state-box">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--navy-900)' }}>
              Moderation Portal Restricted
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Access to report moderation is strictly restricted to authorized stockroom administrators and moderators.
            </p>
          </div>
          <button type="button" className="vc-btn vc-btn-primary" onClick={onOpenAuth}>
            Sign In with Magic Link
          </button>
        </div>
      </div>
    );
  }

  // 2. Signed in but not an authorized moderator or administrator
  if (!currentUser.isModerator) {
    return (
      <div className="vc-card">
        <div className="vc-state-box" style={{ borderColor: 'var(--rose-300)' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--rose-600)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--rose-700)' }}>Access Denied</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Your account (<strong>{currentUser.email}</strong>) does not have administrator or moderator permissions.
              Privileges are provisioned exclusively on the server and cannot be assigned from the browser.
            </p>
          </div>
          <button type="button" className="vc-btn vc-btn-secondary" onClick={() => signOutUser()}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // 3. Authorized Moderator View
  return (
    <div className="vc-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid var(--slate-200)',
          paddingBottom: '1rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--navy-900)' }}>
              Admin Moderation Portal
            </h2>
            <span className="vc-badge vc-badge-approved">
              {currentUser.isAdmin ? 'ADMINISTRATOR' : 'MODERATOR'}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--slate-500)' }}>
            Signed in as <strong>{currentUser.email}</strong>. Review, approve, or reject field submissions.
          </p>
        </div>

        <button type="button" className="vc-btn vc-btn-secondary" onClick={() => signOutUser()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>

      {actionSuccess && (
        <div
          className="vc-disclaimer fade-in"
          style={{ background: 'var(--emerald-50)', borderColor: 'var(--emerald-500)', marginBottom: '1rem' }}
        >
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div
          className="vc-disclaimer fade-in"
          style={{ background: 'var(--rose-50)', borderColor: 'var(--rose-500)', marginBottom: '1rem' }}
        >
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="vc-subnav" style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className={`vc-subnav-btn ${statusFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <span>Pending Review</span>
        </button>
        <button
          type="button"
          className={`vc-subnav-btn ${statusFilter === 'approved' ? 'active' : ''}`}
          onClick={() => setStatusFilter('approved')}
        >
          <span>Approved</span>
        </button>
        <button
          type="button"
          className={`vc-subnav-btn ${statusFilter === 'rejected' ? 'active' : ''}`}
          onClick={() => setStatusFilter('rejected')}
        >
          <span>Rejected</span>
        </button>
      </div>

      {/* Queue Listing */}
      {isLoadingQueue ? (
        <div className="vc-state-box">
          <div className="spinner" style={{ width: '28px', height: '28px' }} />
          <span>Loading moderation queue...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="vc-state-box">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <div>No {statusFilter} reports found in queue.</div>
        </div>
      ) : (
        <div className="vc-reports-list">
          {reports.map(report => (
            <div key={report.id} className="vc-report-card">
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
                  Status: {report.status.toUpperCase()}
                </span>
                <span className="vc-report-date">{new Date(report.created_at).toLocaleString()}</span>
              </div>

              <div className="vc-location-comparison">
                <div className="vc-loc-box">
                  <span className="vc-loc-label">Heard Location</span>
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
                  <strong>Submitter Notes:</strong> {report.details}
                </div>
              )}

              {/* Feedback Note Input for Moderation */}
              <div style={{ marginTop: '0.75rem' }}>
                <input
                  type="text"
                  className="vc-input"
                  style={{ fontSize: '0.8125rem', padding: '0.45rem 0.65rem' }}
                  placeholder="Optional feedback / moderation note..."
                  value={notesState[report.id] || report.moderator_notes || ''}
                  onChange={e =>
                    setNotesState(prev => ({
                      ...prev,
                      [report.id]: e.target.value
                    }))
                  }
                />
              </div>

              {/* Moderation Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--slate-100)'
                }}
              >
                {report.status !== 'approved' && (
                  <button
                    type="button"
                    className="vc-btn vc-btn-success"
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.8125rem' }}
                    onClick={() => handleStatusChange(report.id, 'approved')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Approve</span>
                  </button>
                )}

                {report.status !== 'rejected' && (
                  <button
                    type="button"
                    className="vc-btn vc-btn-danger"
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.8125rem' }}
                    onClick={() => handleStatusChange(report.id, 'rejected')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Reject</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
