import React, { useMemo } from 'react';
import { rankCandidatesForLocation } from '../logic/candidateRanking.ts';
import type { VoiceConfusionReport } from '../voiceConfusion/types.ts';

interface CandidateSuggestionsListProps {
  currentLocation: string;
  communityReports: readonly VoiceConfusionReport[];
  onSelectLocation: (location: string) => void;
  onOpenVoiceConfusionReference: (location?: string) => void;
}

import { getPlainEnglishReason, getEvidenceLabel } from '../logic/suggestionFormatters.ts';

export const CandidateSuggestionsList: React.FC<CandidateSuggestionsListProps> = ({
  currentLocation,
  communityReports,
  onSelectLocation,
  onOpenVoiceConfusionReference
}) => {
  const cleanCode = currentLocation.trim().toUpperCase().substring(0, 4);

  const { candidates, error } = useMemo(() => {
    if (!cleanCode) return { candidates: [], error: null };
    try {
      const results = rankCandidatesForLocation(cleanCode, communityReports);
      return { candidates: results, error: null };
    } catch (err: any) {
      return { candidates: [], error: err?.message || 'Error calculating candidate suggestions.' };
    }
  }, [cleanCode, communityReports]);

  if (!cleanCode) {
    return null;
  }

  if (error) {
    return (
      <section className="vc-suggestions-container fade-in" aria-label="Voice Confusion Candidate Suggestions">
        <div className="vc-state-box" role="alert" style={{ color: 'var(--rose-600)', borderColor: 'var(--rose-300)' }}>
          <strong>Error loading suggestions:</strong> {error}
        </div>
      </section>
    );
  }

  if (candidates.length === 0) {
    return null;
  }

  return (
    <section className="vc-suggestions-container fade-in" aria-labelledby="vc-suggestions-title">
      <div className="vc-suggestions-header">
        <div className="vc-suggestions-header-main">
          <div className="vc-suggestions-title-group">
            <div className="vc-suggestions-icon-box" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div>
              <h3 id="vc-suggestions-title" className="vc-suggestions-title">
                Voice Confusion Reference Suggestions
              </h3>
              <p className="vc-suggestions-desc">
                Possible alternatives based on community reports and character-hearing patterns.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="vc-btn vc-btn-secondary vc-suggestions-db-btn"
            onClick={() => onOpenVoiceConfusionReference(cleanCode)}
            aria-label={`View ${cleanCode} in Reference Database`}
          >
            <span>View in Reference Database</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        <div className="vc-suggestions-summary-bar">
          <span className="vc-suggestions-searched-label">
            Searched Code: <span className="vc-suggestions-searched-code">{cleanCode}</span>
          </span>
          <span className="vc-suggestions-divider" aria-hidden="true">&bull;</span>
          <span className="vc-suggestions-count">
            {candidates.length} {candidates.length === 1 ? 'suggestion' : 'suggestions'} found
          </span>
        </div>
      </div>

      <div className="vc-candidates-list" role="feed" aria-label="Candidate suggestions list">
        {candidates.map(cand => {
          const evidenceLabel = getEvidenceLabel(cand);
          const plainReason = getPlainEnglishReason(cand, cleanCode);

          return (
            <article
              key={cand.candidateLocation}
              className={`vc-candidate-card vc-candidate-card--${cand.type}`}
            >
              <div className="vc-candidate-header">
                <div className="vc-candidate-code-group">
                  <span className="vc-candidate-code" aria-label={`Candidate location ${cand.candidateLocation}`}>
                    {cand.candidateLocation}
                  </span>
                  <span className={`vc-evidence-badge vc-evidence-badge--${cand.type}`}>
                    {evidenceLabel}
                  </span>
                </div>

                <button
                  type="button"
                  className="vc-candidate-select-btn"
                  onClick={() => onSelectLocation(cand.candidateLocation)}
                  title={`Calculate check character for ${cand.candidateLocation}`}
                  aria-label={`Select candidate ${cand.candidateLocation}`}
                >
                  <span>Select Location</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="vc-candidate-check-info">
                <div className="vc-candidate-check-char">
                  <span className="vc-candidate-check-label">Check Character:</span>
                  <span className="vc-candidate-check-val">{cand.checkChar}</span>
                </div>
                {cand.spokenText && (
                  <div className="vc-candidate-spoken">
                    <span className="vc-candidate-spoken-label">Phonetic:</span>
                    <span className="vc-candidate-spoken-val">"{cand.spokenText}"</span>
                  </div>
                )}
              </div>

              <div className="vc-candidate-explanation">
                <p className="vc-candidate-plain-reason">{plainReason}</p>
              </div>

              <details className="vc-candidate-why-details">
                <summary className="vc-candidate-why-summary">
                  <svg className="vc-why-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>Why this suggestion?</span>
                </summary>
                <div className="vc-candidate-why-content">
                  <ul className="vc-why-list">
                    {cand.explanations.map((exp, idx) => (
                      <li key={idx}>{exp}</li>
                    ))}
                  </ul>
                  <div className="vc-why-meta">
                    {cand.type === 'community_report' && (
                      <span className="vc-why-meta-tag">
                        Source: Community Report ({cand.communityReport?.confirmations_count || 1} independent {(cand.communityReport?.confirmations_count || 1) === 1 ? 'corroboration' : 'corroborations'})
                      </span>
                    )}
                    {cand.type === 'inferred_heuristic' && (
                      <span className="vc-why-meta-tag">
                        Source: Documented Warehouse Acoustic Rule
                      </span>
                    )}
                    {cand.type === 'reference_fallback' && (
                      <span className="vc-why-meta-tag">
                        Source: Valid Aisle Baseline Reference
                      </span>
                    )}
                    {cand.candidateLocation.substring(0, 2) === cleanCode.substring(0, 2) && (
                      <span className="vc-why-meta-tag">
                        Same Aisle ({cleanCode.substring(0, 2)})
                      </span>
                    )}
                  </div>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
};
