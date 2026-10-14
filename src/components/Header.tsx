import React from 'react';
import { OriginalLogo } from './OriginalLogo.tsx';

import type { AuthUser } from '../voiceConfusion/types.ts';

interface HeaderProps {
  onOpenInfo: () => void;
  currentUser?: AuthUser | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenInfo,
  currentUser,
  onOpenAuth,
  onSignOut
}) => {
  return (
    <header className="app-header">
      <div className="header-content">
        <a href="#home" className="header-brand">
          <OriginalLogo size={36} />
          <div className="brand-title">
            <span>Check Character</span>
            <span className="brand-sub">by Chandra</span>
          </div>
        </a>

        <div className="header-actions">
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--slate-300)',
                  maxWidth: '120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={currentUser.email}
              >
                {currentUser.email}
              </span>
              {onSignOut && (
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={onSignOut}
                  title={`Sign out (${currentUser.email})`}
                  aria-label="Sign Out"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            onOpenAuth && (
              <button
                type="button"
                className="header-icon-btn"
                onClick={onOpenAuth}
                title="Sign In with Email Magic Link"
                aria-label="Sign In"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
            )
          )}

          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenInfo}
            aria-label="Algorithm Guide & Documentation"
            title="Algorithm Guide & Documentation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
