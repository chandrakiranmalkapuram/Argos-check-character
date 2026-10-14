import React, { useState, useEffect } from 'react';
import { ReportSearch } from './components/ReportSearch.tsx';
import { ReportSubmissionForm } from './components/ReportSubmissionForm.tsx';
import { MyReportsView } from './components/MyReportsView.tsx';
import { ModeratorView } from './components/ModeratorView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { getCurrentUser, onAuthStateChange, signOutUser } from './service.ts';
import type { AuthUser } from './types.ts';

interface VoiceConfusionViewProps {
  onSelectLocation?: (location: string) => void;
  initialLocationQuery?: string;
}

type SubTab = 'search' | 'submit' | 'my-reports' | 'moderator';

export const VoiceConfusionView: React.FC<VoiceConfusionViewProps> = ({
  onSelectLocation,
  initialLocationQuery = ''
}) => {
  const [activeTab, setActiveTab] = useState<SubTab>('search');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Initial user fetch
    getCurrentUser().then(setCurrentUser);

    // Reactive subscription to auth state changes
    const unsubscribe = onAuthStateChange(user => {
      setCurrentUser(user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenAuth = (prompt?: string) => {
    setAuthPrompt(prompt);
    setIsAuthModalOpen(true);
  };

  return (
    <div className="vc-container fade-in">
      {/* Header Banner */}
      <div className="vc-header-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="vc-header-title">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span>Voice Confusion Risk</span>
            </h1>
            <p className="vc-header-subtitle">
              Community-driven reporting for stockroom locations frequently misrecognized by voice headsets. Search verified confusable pairs or submit new field reports.
            </p>
          </div>

          {/* User Status in Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.1)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.8125rem' }}>
                  <span>{currentUser.email}</span>
                  {currentUser.isModerator && (
                    <span className="vc-badge vc-badge-approved" style={{ marginLeft: '0.5rem', fontSize: '0.6875rem' }}>
                      {currentUser.isAdmin ? 'ADMIN' : 'MOD'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="vc-btn vc-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.2)', color: 'var(--white)', border: 'none' }}
                  onClick={() => signOutUser()}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="vc-btn vc-btn-primary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8125rem' }}
                onClick={() => handleOpenAuth('Sign in with your email to track your submitted reports or access admin moderation.')}
              >
                Sign In (Magic Link)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accuracy & Voice Variation Disclaimer */}
      <div className="vc-disclaimer">
        <svg
          className="vc-disclaimer-icon"
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
          <strong>Operational Notice:</strong> Voice recognition fidelity and acoustic interpretation vary across headset models and ambient aisle noise. Community reports reflect observed warehouse misrecognitions and must always be verified against the official store inventory terminal.
        </div>
      </div>

      {/* Sub-view Navigation */}
      <div className="vc-subnav" role="tablist" aria-label="Voice confusion sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'search'}
          className={`vc-subnav-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search Approved Reports</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'submit'}
          className={`vc-subnav-btn ${activeTab === 'submit' ? 'active' : ''}`}
          onClick={() => setActiveTab('submit')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Submit a Report</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my-reports'}
          className={`vc-subnav-btn ${activeTab === 'my-reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-reports')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>My Reports</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'moderator'}
          className={`vc-subnav-btn ${activeTab === 'moderator' ? 'active' : ''}`}
          onClick={() => setActiveTab('moderator')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Admin Moderation</span>
          {currentUser?.isModerator && (
            <span className="vc-badge vc-badge-approved" style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}>
              PRO
            </span>
          )}
        </button>
      </div>

      {/* Sub-view Content */}
      {activeTab === 'search' && (
        <ReportSearch
          initialQuery={initialLocationQuery}
          onSelectLocation={onSelectLocation}
          onRequestSubmitNew={() => setActiveTab('submit')}
        />
      )}

      {activeTab === 'submit' && (
        <ReportSubmissionForm
          currentUser={currentUser}
          onOpenAuth={() => handleOpenAuth('Sign in with your email to track your submitted reports.')}
          onSuccessSubmission={() => setActiveTab('my-reports')}
        />
      )}

      {activeTab === 'my-reports' && (
        <MyReportsView
          currentUser={currentUser}
          onOpenAuth={() => handleOpenAuth('Sign in with your email to view your submitted reports.')}
          onRequestSubmitNew={() => setActiveTab('submit')}
        />
      )}

      {activeTab === 'moderator' && (
        <ModeratorView
          currentUser={currentUser}
          onOpenAuth={() => handleOpenAuth('Sign in with an authorized administrator or moderator account.')}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        promptMessage={authPrompt}
        onSuccess={() => {}}
      />
    </div>
  );
};
