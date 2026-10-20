import React, { useMemo } from 'react';
import { rankCandidatesForLocation, type CandidateSuggestion } from '../logic/candidateRanking.ts';
import type { VoiceConfusionReport } from '../voiceConfusion/types.ts';

interface CandidateSuggestionsListProps {
  currentLocation: string;
  communityReports: readonly VoiceConfusionReport[];
  onSelectLocation: (location: string) => void;
  onOpenVoiceConfusionReference: (location?: string) => void;
}

export const CandidateSuggestionsList: React.FC<CandidateSuggestionsListProps> = ({
  currentLocation,
  communityReports,
  onSelectLocation,
  onOpenVoiceConfusionReference
}) => {
  const cleanCode = currentLocation.trim().toUpperCase().substring(0, 4);

  const candidates: CandidateSuggestion[] = useMemo(() => {
    if (!cleanCode) return [];
    return rankCandidatesForLocation(cleanCode, communityReports);
  }, [cleanCode, communityReports]);

  if (!cleanCode || candidates.length === 0) {
    return null;
  }

  return (
    <section className="similar-locations-container fade-in" aria-label="Voice Confusion Candidate Suggestions">
      <div className="similar-locations-header">
        <div className="similar-header-title">
          <svg
            className="warning-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--blue-600, #2563eb)"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <h3>Voice Confusion Reference Suggestions</h3>
          <span className="similar-count-badge" style={{ background: 'var(--blue-100)', color: 'var(--blue-800)' }}>
            {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
          </span>
        </div>

        <button
          type="button"
          className="link-btn"
          onClick={() => onOpenVoiceConfusionReference(cleanCode)}
          style={{ fontSize: '0.8125rem' }}
        >
          View in Reference Database &rarr;
        </button>
      </div>

      <p className="similar-locations-desc">
        Deterministic candidate locations ranked by community observations, warehouse prefix rules, and documented acoustic substitutions for unreferenced zones.
      </p>

      <div className="similar-grid">
        {candidates.map(cand => {
          const isCommunity = cand.type === 'community_report';
          const isFallback = cand.type === 'reference_fallback';

          return (
            <div
              key={cand.candidateLocation}
              className="similar-card"
              style={{
                borderLeft: isCommunity
                  ? '4px solid var(--emerald-500, #10b981)'
                  : isFallback
                  ? '4px solid var(--amber-500, #f59e0b)'
                  : '4px solid var(--blue-500, #3b82f6)'
              }}
            >
              <div className="similar-card-top">
                <button
                  type="button"
                  className="similar-loc-pill"
                  onClick={() => onSelectLocation(cand.candidateLocation)}
                  title={`Calculate check character for ${cand.candidateLocation}`}
                  aria-label={`Select candidate ${cand.candidateLocation}`}
                >
                  {cand.candidateLocation}
                </button>

                <span
                  className="vc-badge"
                  style={{
                    fontSize: '0.6875rem',
                    background: isCommunity ? 'rgba(16, 185, 129, 0.12)' : isFallback ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                    color: isCommunity ? 'var(--emerald-800)' : isFallback ? 'var(--amber-800)' : 'var(--blue-800)',
                    borderColor: isCommunity ? 'var(--emerald-300)' : isFallback ? 'var(--amber-300)' : 'var(--blue-300)'
                  }}
                >
                  {cand.label}
                </span>
              </div>

              <div className="similar-card-check">
                <span>Check Char:</span>
                <strong>{cand.checkChar}</strong>
                {cand.spokenText && <span style={{ color: 'var(--slate-400)', fontSize: '0.75rem' }}>({cand.spokenText})</span>}
              </div>

              <div className="similar-card-reason">
                <span className="reason-label">Evidence:</span>
                <span className="reason-text">{cand.explanations[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
