import React, { useState } from 'react';
import type { VoiceConfusionReason, AuthUser } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import { validateReportSubmission } from '../validation.ts';
import { normaliseLocationCode, detectAmbiguousCharacters } from '../normalizer.ts';
import { submitVoiceConfusionReport } from '../service.ts';
import { ReportPreviewModal } from './ReportPreviewModal.tsx';

interface ReportSubmissionFormProps {
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  onSuccessSubmission?: () => void;
}

export const ReportSubmissionForm: React.FC<ReportSubmissionFormProps> = ({
  currentUser,
  onOpenAuth,
  onSuccessSubmission
}) => {
  const [heardLocation, setHeardLocation] = useState('');
  const [actualLocation, setActualLocation] = useState('');
  const [reason, setReason] = useState<VoiceConfusionReason>('similar_sounding');
  const [details, setDetails] = useState('');

  // Form states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Ambiguity detection for character clarity (O vs 0, I vs 1)
  const heardAmbiguity = detectAmbiguousCharacters(heardLocation);
  const actualAmbiguity = detectAmbiguousCharacters(actualLocation);

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsDuplicateWarning(false);
    setSuccessMessage(null);

    const validation = validateReportSubmission({
      heard_location: heardLocation,
      actual_location: actualLocation,
      reason,
      details
    });

    if (!validation.isValid) {
      setErrors(validation.errors as Record<string, string>);
      return;
    }

    setErrors({});
    setIsPreviewOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setServerError(null);
    setIsDuplicateWarning(false);

    try {
      const response = await submitVoiceConfusionReport({
        heard_location: normaliseLocationCode(heardLocation),
        actual_location: normaliseLocationCode(actualLocation),
        reason,
        details: details.trim() || undefined
      });

      if (!response.success) {
        setIsDuplicateWarning(Boolean(response.is_duplicate));
        setServerError(response.error || 'Failed to submit report.');
        setIsPreviewOpen(false);
        return;
      }

      // Success
      setIsPreviewOpen(false);
      setSuccessMessage(
        response.message ||
          'Report submitted successfully. Your report is currently pending review and is not yet verified.'
      );

      // Reset form
      setHeardLocation('');
      setActualLocation('');
      setReason('similar_sounding');
      setDetails('');
      setErrors({});

      if (onSuccessSubmission) {
        onSuccessSubmission();
      }
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred.');
      setIsPreviewOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="vc-card">
        <div className="vc-state-box">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--navy-900)' }}>Sign In Required</h3>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              To prevent abuse and track review status, authentication is required to submit a report.
            </p>
          </div>
          <button type="button" className="vc-btn vc-btn-primary" onClick={onOpenAuth}>
            Sign In with Magic Link to Submit
          </button>
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
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: 'var(--navy-900)' }}>
            Report a Voice Confusion Risk
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
            Help fellow stockroom pickers identify locations easily misheard by voice headsets.
          </p>
        </div>
        <div className="vc-badge vc-badge-community" style={{ padding: '0.3rem 0.6rem' }}>
          <span>Signed in as <strong>{currentUser.email}</strong></span>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="vc-disclaimer fade-in"
          style={{
            background: 'var(--emerald-50)',
            borderColor: 'var(--emerald-500)',
            marginBottom: '1.25rem'
          }}
        >
          <svg className="vc-disclaimer-icon" style={{ color: 'var(--emerald-600)' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <div>
            <strong style={{ color: 'var(--emerald-700)' }}>Report Received:</strong>{' '}
            {successMessage}
          </div>
        </div>
      )}

      {/* Server or Duplicate Error Notification */}
      {serverError && (
        <div
          className="vc-disclaimer fade-in"
          style={{
            background: isDuplicateWarning ? 'var(--amber-50)' : 'var(--rose-50)',
            borderColor: isDuplicateWarning ? 'var(--amber-500)' : 'var(--rose-500)',
            marginBottom: '1.25rem'
          }}
        >
          <svg
            className="vc-disclaimer-icon"
            style={{ color: isDuplicateWarning ? 'var(--amber-600)' : 'var(--rose-600)' }}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong style={{ color: isDuplicateWarning ? 'var(--amber-800)' : 'var(--rose-800)' }}>
              {isDuplicateWarning ? 'Duplicate Report Detected:' : 'Submission Error:'}
            </strong>{' '}
            {serverError}
          </div>
        </div>
      )}

      <form onSubmit={handleOpenPreview} noValidate>
        {/* Dual Location Inputs */}
        <div className="vc-location-pair-inputs">
          {/* Heard Location */}
          <div className="vc-form-group">
            <label htmlFor="heard-location-input" className="vc-form-label">
              <span>Heard / Headset Location <span style={{ color: 'var(--rose-500)' }}>*</span></span>
              <span className="vc-form-hint">e.g. J7AZ, S1PG, 10AK</span>
            </label>
            <input
              id="heard-location-input"
              type="text"
              className={`vc-input vc-input-code ${errors.heard_location ? 'has-error' : ''}`}
              placeholder="e.g. J7AZ"
              value={heardLocation}
              onChange={e => {
                setHeardLocation(e.target.value.toUpperCase());
                if (errors.heard_location) {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.heard_location;
                    return next;
                  });
                }
              }}
              maxLength={10}
              required
            />
            {errors.heard_location && (
              <div className="vc-error-msg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.heard_location}</span>
              </div>
            )}
            {(heardAmbiguity.hasDigitZero || heardAmbiguity.hasLetterO) && (
              <div className="vc-ambiguity-notice">
                <span>Note: Contains {heardAmbiguity.hasDigitZero ? 'digit 0' : ''}{heardAmbiguity.hasDigitZero && heardAmbiguity.hasLetterO ? ' and ' : ''}{heardAmbiguity.hasLetterO ? 'letter O' : ''} (preserved strictly).</span>
              </div>
            )}
          </div>

          {/* Actual Location */}
          <div className="vc-form-group">
            <label htmlFor="actual-location-input" className="vc-form-label">
              <span>Actual Found Location <span style={{ color: 'var(--rose-500)' }}>*</span></span>
              <span className="vc-form-hint">e.g. 07AZ, 01PG, 10KA</span>
            </label>
            <input
              id="actual-location-input"
              type="text"
              className={`vc-input vc-input-code ${errors.actual_location ? 'has-error' : ''}`}
              placeholder="e.g. 07AZ"
              value={actualLocation}
              onChange={e => {
                setActualLocation(e.target.value.toUpperCase());
                if (errors.actual_location) {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.actual_location;
                    return next;
                  });
                }
              }}
              maxLength={10}
              required
            />
            {errors.actual_location && (
              <div className="vc-error-msg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.actual_location}</span>
              </div>
            )}
            {(actualAmbiguity.hasDigitZero || actualAmbiguity.hasLetterO) && (
              <div className="vc-ambiguity-notice">
                <span>Note: Contains {actualAmbiguity.hasDigitZero ? 'digit 0' : ''}{actualAmbiguity.hasDigitZero && actualAmbiguity.hasLetterO ? ' and ' : ''}{actualAmbiguity.hasLetterO ? 'letter O' : ''} (preserved strictly).</span>
              </div>
            )}
          </div>
        </div>

        {/* General Form Error (e.g. identical locations) */}
        {errors.general && (
          <div className="vc-error-msg" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errors.general}</span>
          </div>
        )}

        {/* Reason for Confusion */}
        <div className="vc-form-group">
          <label className="vc-form-label">
            <span>Reason for Confusion <span style={{ color: 'var(--rose-500)' }}>*</span></span>
          </label>
          <div className="vc-reason-grid" role="radiogroup" aria-label="Reason for confusion">
            {VOICE_CONFUSION_REASONS.map(item => (
              <label
                key={item.value}
                className={`vc-reason-option ${reason === item.value ? 'selected' : ''}`}
              >
                <div className="vc-reason-header">
                  <input
                    type="radio"
                    name="reason"
                    value={item.value}
                    checked={reason === item.value}
                    onChange={() => setReason(item.value)}
                    style={{ accentColor: 'var(--blue-600)' }}
                  />
                  <span>{item.label}</span>
                </div>
                <span className="vc-reason-desc">{item.description}</span>
              </label>
            ))}
          </div>
          {errors.reason && <div className="vc-error-msg">{errors.reason}</div>}
        </div>

        {/* Details (Optional) */}
        <div className="vc-form-group">
          <label htmlFor="details-textarea" className="vc-form-label">
            <span>Operational Details (Optional)</span>
            <span className="vc-form-hint">Aisle noise, mezzanine acoustics, etc.</span>
          </label>
          <textarea
            id="details-textarea"
            className={`vc-textarea ${errors.details ? 'has-error' : ''}`}
            rows={3}
            placeholder="Explain what happened (do not include personal names or customer information)..."
            value={details}
            onChange={e => setDetails(e.target.value)}
            maxLength={500}
          />
          <div className="vc-char-counter">{details.length} / 500 characters</div>
          {errors.details && <div className="vc-error-msg">{errors.details}</div>}
        </div>

        {/* Submit Action */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="submit" className="vc-btn vc-btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Preview Report</span>
          </button>
        </div>
      </form>

      {/* Preview Confirmation Modal */}
      <ReportPreviewModal
        isOpen={isPreviewOpen}
        payload={{
          heard_location: normaliseLocationCode(heardLocation),
          actual_location: normaliseLocationCode(actualLocation),
          reason,
          details: details.trim() || undefined
        }}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmSubmit}
        onClose={() => setIsPreviewOpen(false)}
      />
    </div>
  );
};
