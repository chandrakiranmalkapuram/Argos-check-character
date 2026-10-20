import React, { useState, useEffect, useMemo } from 'react';
import { rankCandidatesForLocation, type CandidateSuggestion } from '../../logic/candidateRanking.ts';
import { getPlainEnglishReason, getEvidenceLabel } from '../../logic/suggestionFormatters.ts';
import { getAllActiveReports } from '../service.ts';
import type { VoiceConfusionReport } from '../types.ts';

interface UnreferencedZoneLookupProps {
  initialCode?: string;
  onSelectLocation?: (loc: string) => void;
  onRequestShareCorrection?: (code?: string) => void;
}

export const UnreferencedZoneLookup: React.FC<UnreferencedZoneLookupProps> = ({
  initialCode = '',
  onSelectLocation,
  onRequestShareCorrection
}) => {
  const [inputCode, setInputCode] = useState(initialCode);
  const [communityReports, setCommunityReports] = useState<VoiceConfusionReport[]>([]);

  useEffect(() => {
    let isMounted = true;
    getAllActiveReports()
      .then(reports => {
        if (isMounted) setCommunityReports(reports);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const candidates: CandidateSuggestion[] = useMemo(() => {
    if (!inputCode.trim()) return [];
    return rankCandidatesForLocation(inputCode, communityReports);
  }, [inputCode, communityReports]);

  const cleanInput = inputCode.trim().toUpperCase().substring(0, 4);

  return (
    <div className="vc-card">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: 'var(--navy-900)' }}>
          Unreferenced Zone & Voice Candidate Analysis
        </h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--slate-500)' }}>
          Possible alternatives based on community reports and character-hearing patterns.
        </p>
      </div>

      {/* Input Code */}
      <div className="vc-search-bar" role="search" style={{ marginBottom: '1.25rem' }}>
        <svg
          className="vc-search-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        </svg>

        <input
          type="text"
          className="vc-search-input"
          placeholder="Enter voiced or unreferenced location (e.g. 08MN, 16ZG, 81ZE, 01MM, 44ZZ)..."
          value={inputCode}
          onChange={e => setInputCode(e.target.value.toUpperCase())}
          maxLength={10}
          aria-label="Enter voiced or unreferenced location code"
        />

        {inputCode && (
          <button
            type="button"
            className="vc-search-clear"
            onClick={() => setInputCode('')}
            title="Clear code"
            aria-label="Clear code text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Example Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--slate-500)' }}>Try Seed Pairs:</span>
        {['08MN', '16ZG', '81ZE', '01MM', '10AK', '99ZZ'].map(ex => (
          <button
            key={ex}
            type="button"
            className="similar-loc-pill"
            style={{ cursor: 'pointer', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
            onClick={() => setInputCode(ex)}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Candidate Results */}
      {cleanInput && candidates.length > 0 && (
        <div className="vc-candidates-container">
          <div className="vc-suggestions-summary-bar" style={{ marginBottom: '1rem' }}>
            <span className="vc-suggestions-searched-label">
              Searched Code: <span className="vc-suggestions-searched-code">{cleanInput}</span>
            </span>
            <span className="vc-suggestions-divider" aria-hidden="true">&bull;</span>
            <span className="vc-suggestions-count">
              {candidates.length} {candidates.length === 1 ? 'candidate possibility' : 'candidate possibilities'} found
            </span>
            {onRequestShareCorrection && (
              <div style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="vc-btn vc-btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                  onClick={() => onRequestShareCorrection(cleanInput)}
                >
                  Share Correction &rarr;
                </button>
              </div>
            )}
          </div>

          <div className="vc-candidates-list" role="feed" aria-label="Candidate possibilities list">
            {candidates.map(cand => {
              const evidenceLabel = getEvidenceLabel(cand);
              const plainReason = getPlainEnglishReason(cand, cleanInput);

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

                    {onSelectLocation && (
                      <button
                        type="button"
                        className="vc-candidate-select-btn"
                        onClick={() => onSelectLocation(cand.candidateLocation)}
                        title={`Calculate check character for ${cand.candidateLocation}`}
                        aria-label={`Select candidate ${cand.candidateLocation}`}
                      >
                        <span>Check in Calculator</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    )}
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
                            Source: Community Report ({cand.communityReport?.confirmations_count || 1} independent corroboration{(cand.communityReport?.confirmations_count || 1) === 1 ? '' : 's'})
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
                        {cand.candidateLocation.substring(0, 2) === cleanInput.substring(0, 2) && (
                          <span className="vc-why-meta-tag">
                            Same Aisle ({cleanInput.substring(0, 2)})
                          </span>
                        )}
                        <span className="vc-why-meta-tag">
                          Total Score: {cand.totalScore}
                        </span>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* No Results state for searched code */}
      {cleanInput && candidates.length === 0 && (
        <div className="vc-state-box" style={{ marginTop: '1rem' }} role="status">
          <span style={{ fontSize: '0.875rem', color: 'var(--slate-600)' }}>
            No candidate suggestions found for "{cleanInput}". Check the code format or share a new voice confusion report.
          </span>
          {onRequestShareCorrection && (
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}
              onClick={() => onRequestShareCorrection(cleanInput)}
            >
              Share Location Correction &rarr;
            </button>
          )}
        </div>
      )}

      {/* No Input prompt */}
      {!cleanInput && (
        <div className="vc-state-box" style={{ marginTop: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--slate-500)' }}>
            Enter a 4-character shelf code above to view evidence-based candidate locations ranked by community reports and acoustic heuristics.
          </span>
        </div>
      )}
    </div>
  );
};
