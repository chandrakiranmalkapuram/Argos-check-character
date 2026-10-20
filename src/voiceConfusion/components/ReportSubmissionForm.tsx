import React, { useState } from 'react';
import type { VoiceConfusionReason, AuthUser } from '../types.ts';
import { VOICE_CONFUSION_REASONS } from '../types.ts';
import { validateReportSubmission } from '../validation.ts';
import { normaliseLocationCode, detectAmbiguousCharacters } from '../normalizer.ts';
import { submitLocationCorrection } from '../service.ts';
import { ReportPreviewModal } from './ReportPreviewModal.tsx';

interface ReportSubmissionFormProps {
  currentUser: AuthUser | null;
  onOpenAuth?: () => void;
  onSuccessSubmission?: () => void;
}

export const ReportSubmissionForm: React.FC<ReportSubmissionFormProps> = ({
  currentUser,
  onOpenAuth,
  onSuccessSubmission
}) => {
  const [voicedLocation, setVoicedLocation] = useState('');
  const [foundLocation, setFoundLocation] = useState('');
  const [reason, setReason] = useState<VoiceConfusionReason>('similar_sounding');
  const [details, setDetails] = useState('');

  // Form states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [honeyTrap, setHoneyTrap] = useState('');

  // Ambiguity detection for character clarity (O vs 0, I vs 1)
  const voicedAmbiguity = detectAmbiguousCharacters(voicedLocation);
  const foundAmbiguity = detectAmbiguousCharacters(foundLocation);

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsDuplicateWarning(false);
    setSuccessMessage(null);

    // Anti-spam honeypot detection
    if (honeyTrap) {
      setServerError('Automated spam submission detected.');
      return;
    }

    const validation = validateReportSubmission({
      voiced_location: voicedLocation,
      found_location: foundLocation,
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
      const response = await submitLocationCorrection({
        voiced_location: normaliseLocationCode(voicedLocation),
        found_location: normaliseLocationCode(foundLocation),
        reason,
        details: details.trim() || undefined
      });

      if (!response.success) {
        setIsDuplicateWarning(Boolean(response.is_duplicate));
        setServerError(response.error || 'Failed to submit report.');
        setIsPreviewOpen(false);
        return;
      }

      // Success (whether new or duplicate corroboration)
      setIsPreviewOpen(false);
      setIsDuplicateWarning(Boolean(response.is_duplicate));
      setSuccessMessage(
        response.message ||
          'Location correction shared successfully! Newly submitted reports are immediately visible to all visitors as unverified community reports.'
      );

      // Reset form
      setVoicedLocation('');
      setFoundLocation('');
      setReason('similar_sounding');
      setDetails('');
      setHoneyTrap('');
      setErrors({});

      if (onSuccessSubmission) {
        onSuccessSubmission();
      }
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected network error occurred.');
      setIsPreviewOpen(false);
    } finally {
      setIsSubmitting(false);
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
            Share Location Correction
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
            Record what you heard versus what you found to help all pickers navigate confusable or unreferenced zones.
          </p>
        </div>
        {currentUser ? (
          <div className="vc-badge vc-badge-community" style={{ padding: '0.3rem 0.6rem' }}>
            <span>Signed in as <strong>{currentUser.email}</strong></span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="vc-badge vc-badge-pending" style={{ padding: '0.3rem 0.6rem', background: 'var(--slate-100)', color: 'var(--slate-700)', borderColor: 'var(--slate-300)' }}>
              <span>Public Submission (No login required)</span>
            </div>
            {onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--blue-600)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Sign in (Optional)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Observation Explanation Notice */}
      <div
        className="vc-disclaimer"
        style={{
          marginBottom: '1.25rem',
          background: 'var(--blue-50, #eff6ff)',
          borderColor: 'var(--blue-200, #bfdbfe)'
        }}
      >
        <svg
          className="vc-disclaimer-icon"
          style={{ color: 'var(--blue-600, #2563eb)' }}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div style={{ fontSize: '0.8125rem', color: 'var(--blue-900, #1e3a8a)', lineHeight: 1.45 }}>
          <strong>Reported Observation:</strong> A contribution records a reported stockroom observation,
          not guaranteed proof of a universal pronunciation rule. Newly submitted reports are immediately
          saved to the shared database and visible to all visitors as unverified community reports until independently corroborated.
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          className="vc-disclaimer fade-in"
          style={{
            background: 'var(--emerald-50)',
            borderColor: 'var(--emerald-500)',
            marginBottom: '1.25rem',
            padding: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}
        >
          <svg className="vc-disclaimer-icon" style={{ color: 'var(--emerald-600)', marginTop: '2px' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--emerald-800)', fontSize: '0.9375rem' }}>
              {isDuplicateWarning ? 'Observation Corroborated (+1 Confirmation)' : 'Correction Shared with Community'}
            </h4>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--emerald-900)', lineHeight: 1.4 }}>
              {successMessage}
            </p>
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
        {/* Anti-spam honeypot */}
        <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
          <label htmlFor="form-honeypot-field">Leave this empty</label>
          <input
            id="form-honeypot-field"
            type="text"
            name="system_check"
            tabIndex={-1}
            autoComplete="off"
            value={honeyTrap}
            onChange={e => setHoneyTrap(e.target.value)}
          />
        </div>

        {/* Dual Location Inputs: Voiced location & Found location */}
        <div className="vc-location-pair-inputs">
          {/* Voiced Location */}
          <div className="vc-form-group">
            <label htmlFor="voiced-location-input" className="vc-form-label">
              <span>Voiced location <span style={{ color: 'var(--rose-500)' }}>*</span></span>
              <span className="vc-form-hint">Heard/spoken verbally (e.g. 08MN, 16ZG, 81ZE, 01MM)</span>
            </label>
            <input
              id="voiced-location-input"
              type="text"
              className={`vc-input vc-input-code ${errors.voiced_location ? 'has-error' : ''}`}
              placeholder="e.g. 08MN"
              value={voicedLocation}
              onChange={e => {
                setVoicedLocation(e.target.value.toUpperCase());
                if (errors.voiced_location) {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.voiced_location;
                    return next;
                  });
                }
              }}
              maxLength={10}
              required
            />
            {errors.voiced_location && (
              <div className="vc-error-msg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.voiced_location}</span>
              </div>
            )}
            {(voicedAmbiguity.hasDigitZero || voicedAmbiguity.hasLetterO) && (
              <div className="vc-ambiguity-notice">
                <span>Note: Contains {voicedAmbiguity.hasDigitZero ? 'digit 0' : ''}{voicedAmbiguity.hasDigitZero && voicedAmbiguity.hasLetterO ? ' and ' : ''}{voicedAmbiguity.hasLetterO ? 'letter O' : ''} (preserved strictly).</span>
              </div>
            )}
          </div>

          {/* Found Location */}
          <div className="vc-form-group">
            <label htmlFor="found-location-input" className="vc-form-label">
              <span>Found location <span style={{ color: 'var(--rose-500)' }}>*</span></span>
              <span className="vc-form-hint">Physical shelf confirmed (e.g. 20AN, 16JA, 50ER, Z01B)</span>
            </label>
            <input
              id="found-location-input"
              type="text"
              className={`vc-input vc-input-code ${errors.found_location ? 'has-error' : ''}`}
              placeholder="e.g. 20AN"
              value={foundLocation}
              onChange={e => {
                setFoundLocation(e.target.value.toUpperCase());
                if (errors.found_location) {
                  setErrors(prev => {
                    const next = { ...prev };
                    delete next.found_location;
                    return next;
                  });
                }
              }}
              maxLength={10}
              required
            />
            {errors.found_location && (
              <div className="vc-error-msg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.found_location}</span>
              </div>
            )}
            {(foundAmbiguity.hasDigitZero || foundAmbiguity.hasLetterO) && (
              <div className="vc-ambiguity-notice">
                <span>Note: Contains {foundAmbiguity.hasDigitZero ? 'digit 0' : ''}{foundAmbiguity.hasDigitZero && foundAmbiguity.hasLetterO ? ' and ' : ''}{foundAmbiguity.hasLetterO ? 'letter O' : ''} (preserved strictly).</span>
              </div>
            )}
          </div>
        </div>

        {/* General Form Error */}
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
            <span>Operational Reason for Confusion</span>
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
        </div>

        {/* Details (Optional) */}
        <div className="vc-form-group">
          <label htmlFor="details-textarea" className="vc-form-label">
            <span>Context / Warehouse Observation (Optional)</span>
            <span className="vc-form-hint">E.g., Headset phrasing difference, radio noise, aisle echo</span>
          </label>
          <textarea
            id="details-textarea"
            className={`vc-textarea ${errors.details ? 'has-error' : ''}`}
            rows={3}
            placeholder="Describe what occurred (e.g., Heard 'zero-eight' but stock was in aisle 20; bulk prefix confusion)..."
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>Share location correction</span>
          </button>
        </div>
      </form>

      {/* Preview Confirmation Modal */}
      <ReportPreviewModal
        isOpen={isPreviewOpen}
        payload={{
          voiced_location: normaliseLocationCode(voicedLocation),
          found_location: normaliseLocationCode(foundLocation),
          heard_location: normaliseLocationCode(voicedLocation),
          actual_location: normaliseLocationCode(foundLocation),
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
