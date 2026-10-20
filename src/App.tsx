import { useState, useMemo, useEffect, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { CalculatorInput } from './components/CalculatorInput.tsx';
import { ResultCard } from './components/ResultCard.tsx';
import { SimilarLocationsList } from './components/SimilarLocationsList.tsx';
import { CandidateSuggestionsList } from './components/CandidateSuggestionsList.tsx';
import { ReverseLookupView } from './components/ReverseLookupView.tsx';
import { SearchHistory } from './components/SearchHistory.tsx';
import { InfoModal } from './components/InfoModal.tsx';
import { VoiceConfusionView } from './voiceConfusion/VoiceConfusionView.tsx';
import { AuthModal } from './voiceConfusion/components/AuthModal.tsx';
import { getCurrentUser, onAuthStateChange, signOutUser, getAllActiveReports } from './voiceConfusion/service.ts';
import type { AuthUser, VoiceConfusionReport } from './voiceConfusion/types.ts';
import { evaluateQuery } from './logic/index.ts';
import type { CheckMode } from './logic/types.ts';
import { useSearchHistory } from './hooks/useSearchHistory.ts';
import './styles/app.css';
import './styles/voiceConfusion.css';

export function App() {
  const [query, setQuery] = useState('10AK');
  const [activeMode, setActiveMode] = useState<CheckMode>('auto');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isHeaderAuthOpen, setIsHeaderAuthOpen] = useState(false);
  const [communityReports, setCommunityReports] = useState<VoiceConfusionReport[]>([]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
    const unsubscribe = onAuthStateChange(user => {
      setCurrentUser(user);
    });

    getAllActiveReports().then(setCommunityReports);

    return () => unsubscribe();
  }, []);

  const { history, addSearch, removeSearch, clearHistory } = useSearchHistory();
  const lastRecordedQueryRef = useRef<string>('');

  // Evaluate query whenever query or mode changes
  const evaluation = useMemo(() => {
    return evaluateQuery(query, activeMode);
  }, [query, activeMode]);

  // Record valid searches in history with debounce
  useEffect(() => {
    const trimmed = query.trim().toUpperCase();
    if (!trimmed || !evaluation.hasResults) return;

    const timer = setTimeout(() => {
      if (lastRecordedQueryRef.current !== trimmed) {
        lastRecordedQueryRef.current = trimmed;

        let primarySummary = '';
        let spokenSummary = '';

        if (evaluation.reverseResult) {
          primarySummary = `${evaluation.reverseResult.totalMatches} locs`;
          spokenSummary = evaluation.reverseResult.checkChar;
        } else if (evaluation.storeResult && evaluation.rfcResult) {
          primarySummary = `${evaluation.storeResult.checkChar} / ${evaluation.rfcResult.checkChar}`;
          spokenSummary = evaluation.storeResult.spokenText;
        } else if (evaluation.storeResult) {
          primarySummary = evaluation.storeResult.checkChar;
          spokenSummary = evaluation.storeResult.spokenText;
        } else if (evaluation.rfcResult) {
          primarySummary = evaluation.rfcResult.checkChar;
          spokenSummary = evaluation.rfcResult.spokenText;
        }

        if (primarySummary && primarySummary !== 'NULL' && primarySummary !== 'N/A') {
          addSearch(trimmed, primarySummary, spokenSummary, activeMode);
        }
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [query, evaluation, activeMode, addSearch]);

  const [activeAppTab, setActiveAppTab] = useState<'calculator' | 'voice-confusion'>('calculator');
  const [voiceConfusionQuery, setVoiceConfusionQuery] = useState('');

  const handleSelectQuery = (newQuery: string) => {
    setQuery(newQuery);
    setActiveAppTab('calculator');
  };

  const handleOpenVoiceConfusionForLocation = (loc?: string) => {
    setVoiceConfusionQuery(loc || query);
    setActiveAppTab('voice-confusion');
    getAllActiveReports().then(setCommunityReports);
  };

  return (
    <>
      <Header
        onOpenInfo={() => setIsInfoOpen(true)}
        currentUser={currentUser}
        onOpenAuth={() => setIsHeaderAuthOpen(true)}
        onSignOut={signOutUser}
      />

      <main className="app-container">
        {/* Top-Level Navigation Switcher */}
        <nav className="app-nav-tabs" role="tablist" aria-label="Main Application Views">
          <button
            type="button"
            role="tab"
            aria-selected={activeAppTab === 'calculator'}
            className={`app-nav-tab ${activeAppTab === 'calculator' ? 'active' : ''}`}
            onClick={() => {
              setActiveAppTab('calculator');
              getAllActiveReports().then(setCommunityReports);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="16" y1="14" x2="16" y2="18" />
              <line x1="8" y1="10" x2="8.01" y2="10" />
              <line x1="12" y1="10" x2="12.01" y2="10" />
              <line x1="16" y1="10" x2="16.01" y2="10" />
              <line x1="8" y1="14" x2="8.01" y2="14" />
              <line x1="12" y1="14" x2="12.01" y2="14" />
              <line x1="8" y1="18" x2="8.01" y2="18" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            <span>Check Character Calculator</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeAppTab === 'voice-confusion'}
            className={`app-nav-tab ${activeAppTab === 'voice-confusion' ? 'active' : ''}`}
            onClick={() => setActiveAppTab('voice-confusion')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span>Voice Confusion Reference</span>
          </button>
        </nav>

        {activeAppTab === 'calculator' ? (
          <>
            <CalculatorInput
              query={query}
              onQueryChange={setQuery}
              activeMode={activeMode}
              onModeChange={setActiveMode}
              guidanceText={evaluation.guidance}
            />

            {/* Reverse Lookup View */}
            {evaluation.reverseResult ? (
              <ReverseLookupView
                result={evaluation.reverseResult}
                onSelectLocation={handleSelectQuery}
              />
            ) : (
              <>
                {/* Dual Store & RFC Results (e.g. for 4-letter locations like ABCD) */}
                {evaluation.storeResult && evaluation.rfcResult ? (
                  <div className="dual-results-wrapper">
                    <div className="dual-results-banner" role="status">
                      <div className="dual-banner-badge">Dual System Comparison</div>
                      <p className="dual-banner-text">
                        <strong>4-Letter Location Detected:</strong> This code is used in both systems with different check character algorithms.
                        <strong> Store</strong> uses a NATO word (e.g. <em>{evaluation.storeResult.checkChar}</em>), while <strong>RFC</strong> uses two spoken digits (e.g. <em>{evaluation.rfcResult.checkChar}</em>).
                      </p>
                    </div>
                    <div className="dual-results-grid">
                      <ResultCard result={evaluation.storeResult} />
                      <ResultCard result={evaluation.rfcResult} />
                    </div>
                  </div>
                ) : evaluation.storeResult ? (
                  <ResultCard result={evaluation.storeResult} />
                ) : evaluation.rfcResult ? (
                  <ResultCard result={evaluation.rfcResult} />
                ) : null}

                {/* Candidate Suggestions for Voice-Confused / Unreferenced Locations */}
                <CandidateSuggestionsList
                  currentLocation={query}
                  communityReports={communityReports}
                  onSelectLocation={handleSelectQuery}
                  onOpenVoiceConfusionReference={handleOpenVoiceConfusionForLocation}
                />

                {/* Voice Confusion Warnings (Same Check Character Collisions) */}
                <SimilarLocationsList
                  locations={evaluation.similarLocations}
                  onSelectLocation={handleSelectQuery}
                  onOpenVoiceConfusionReports={handleOpenVoiceConfusionForLocation}
                />
              </>
            )}

            {/* Local Storage Search History */}
            <SearchHistory
              history={history}
              onSelectQuery={handleSelectQuery}
              onRemoveItem={removeSearch}
              onClearHistory={clearHistory}
            />
          </>
        ) : (
          <VoiceConfusionView
            onSelectLocation={handleSelectQuery}
            initialLocationQuery={voiceConfusionQuery}
          />
        )}
      </main>

      <footer className="app-footer">
        <div>
          <strong>Check Character by Chandra</strong> &bull; Version 1.1.0
        </div>
        <p className="footer-disclaimer">
          Independent stockroom verification utility. Not affiliated with, endorsed by, or associated with Argos or J Sainsbury plc. Calculations execute 100% locally in your browser.
        </p>
      </footer>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
      <AuthModal
        isOpen={isHeaderAuthOpen}
        onClose={() => setIsHeaderAuthOpen(false)}
      />
    </>
  );
}

export default App;
