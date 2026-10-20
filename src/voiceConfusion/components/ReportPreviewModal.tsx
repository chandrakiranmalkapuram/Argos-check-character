import React from 'react';
import type { ReportSubmissionPayload } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';

interface ReportPreviewModalProps {
  isOpen: boolean;
  payload: ReportSubmissionPayload;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  payload,
  isSubmitting,
  onConfirm,
  onClose
}) => {
  if (!isOpen) return null;

  const reasonInfo = VOICE_CONFUSION_REASONS.find(r => r.value === payload.reason);
  const voiced = payload.voiced_location || payload.heard_location || '';
  const found = payload.found_location || payload.actual_location || '';

  return (
    <div className="vc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <div className="vc-modal-content">
        <div className="vc-modal-header">
          <h3 id="preview-modal-title" style={{ margin: 0, fontSize: '1.125rem' }}>
            Preview Location Correction
          </h3>
          <button
            type="button"
            className="vc-search-clear"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close preview"
            style={{ color: 'var(--white)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="vc-modal-body">
          <div style={{ marginBottom: '1.25rem' }}>
            <span className="vc-badge vc-badge-community">Shared Community Observation</span>
          </div>

          <div className="vc-location-comparison" style={{ justifyContent: 'center', marginBottom: '1.25rem' }}>
            <div className="vc-loc-box" style={{ textAlign: 'center' }}>
              <span className="vc-loc-label">Voiced Location</span>
              <span className="vc-loc-value">{voiced}</span>
            </div>

            <div className="vc-loc-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="vc-loc-box" style={{ textAlign: 'center' }}>
              <span className="vc-loc-label">Found Location</span>
              <span className="vc-loc-value">{found}</span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
              Reason for Confusion
            </div>
            <div style={{ fontWeight: 600, color: 'var(--slate-800)', marginTop: '0.25rem' }}>
              {reasonInfo?.label || payload.reason}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--slate-500)', marginTop: '0.125rem' }}>
              {reasonInfo?.description}
            </div>
          </div>

          {payload.details && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                Operational Notes
              </div>
              <div className="vc-report-details" style={{ marginTop: '0.25rem' }}>
                {payload.details}
              </div>
            </div>
          )}

          <div className="vc-disclaimer" style={{ marginTop: '1.25rem' }}>
            <svg className="vc-disclaimer-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              <strong>Community Policy:</strong> Contributions record reported observations to aid other workers in finding physical stock. Submissions are immediately retrievable by all visitors as unverified community reports.
            </span>
          </div>
        </div>

        <div className="vc-modal-footer">
          <button
            type="button"
            className="vc-btn vc-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Back to Edit
          </button>
          <button
            type="button"
            className="vc-btn vc-btn-primary"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm and Share Correction'}
          </button>
        </div>
      </div>
    </div>
  );
};
