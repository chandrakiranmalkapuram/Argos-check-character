import React, { useState } from 'react';
import { signInWithMagicLink } from '../service.ts';
import { isSupabaseConfigured } from '../supabaseClient.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  promptMessage?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  promptMessage
}) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const res = await signInWithMagicLink(email);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to dispatch magic link.');
        return;
      }

      setSuccessMessage(res.message || 'Magic link sent! Check your inbox.');
      if (onSuccess) {
        onSuccess();
      }

      // In local mode, close after short delay so user sees confirmation
      if (!isSupabaseConfigured) {
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected authentication error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="vc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="vc-modal-content">
        <div className="vc-modal-header">
          <h3 id="auth-modal-title" style={{ margin: 0, fontSize: '1.125rem' }}>
            Sign In with Email Magic Link
          </h3>
          <button
            type="button"
            className="vc-search-clear"
            onClick={onClose}
            aria-label="Close authentication modal"
            style={{ color: 'var(--white)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="vc-modal-body">
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--blue-50)',
                color: 'var(--blue-600)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-600)' }}>
              {promptMessage ||
                'Enter your email address to receive a secure passwordless magic link to submit reports and track your submissions.'}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div
              className="vc-disclaimer"
              style={{
                background: 'var(--blue-50)',
                borderColor: 'var(--blue-300)',
                marginBottom: '1rem',
                fontSize: '0.75rem'
              }}
            >
              <span>
                <strong>Demo / Offline Mode:</strong> Instant sign-in is simulated. Try any email (e.g. <code>picker@store.co.uk</code>) or test moderator access with <code>moderator@stockroom.test</code> or <code>admin@stockroom.test</code>.
              </span>
            </div>
          )}

          {successMessage && (
            <div
              className="vc-disclaimer fade-in"
              style={{
                background: 'var(--emerald-50)',
                borderColor: 'var(--emerald-500)',
                marginBottom: '1rem'
              }}
            >
              <svg className="vc-disclaimer-icon" style={{ color: 'var(--emerald-600)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ color: 'var(--emerald-800)' }}>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              className="vc-disclaimer fade-in"
              style={{
                background: 'var(--rose-50)',
                borderColor: 'var(--rose-500)',
                marginBottom: '1rem'
              }}
            >
              <svg className="vc-disclaimer-icon" style={{ color: 'var(--rose-600)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span style={{ color: 'var(--rose-800)' }}>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="vc-form-group">
              <label htmlFor="auth-email-input" className="vc-form-label">
                <span>Email Address</span>
              </label>
              <input
                id="auth-email-input"
                type="email"
                className="vc-input"
                placeholder="colleague@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="vc-btn vc-btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isLoading}
            >
              {isLoading ? 'Sending Magic Link...' : 'Send Magic Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
