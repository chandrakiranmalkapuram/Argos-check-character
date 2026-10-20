import React, { useState, useEffect, useMemo } from 'react';
import { rankCandidatesForLocation, type CandidateSuggestion } from '../../logic/candidateRanking.ts';
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
          Deterministic, evidence-based candidate suggestions for voice-confused and unreferenced stockroom zones.
          Ranks community observations, warehouse prefix rules, and documented acoustic substitutions.
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '0.75rem',
              fontSize: '0.8125rem',
              color: 'var(--slate-600)'
            }}
          >
            <span>
              <strong>{candidates.length} Candidate Possibilit{candidates.length === 1 ? 'y' : 'ies'}</strong> found for "{cleanInput}"
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>Deterministic Ranking</span>
              {onRequestShareCorrection && (
                <button
                  type="button"
                  className="vc-btn vc-btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => onRequestShareCorrection(cleanInput)}
                >
                  Share Correction &rarr;
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {candidates.map(cand => {
              const isCommunity = cand.type === 'community_report';
              const isFallback = cand.type === 'reference_fallback';

              return (
                <div
                  key={cand.candidateLocation}
                  style={{
                    background: isFallback ? 'var(--amber-50, #fffbeb)' : 'var(--white, #fff)',
                    border: isFallback
                      ? '1px dashed var(--amber-300, #fcd34d)'
                      : isCommunity
                      ? '1px solid var(--emerald-300, #6ee7b7)'
                      : '1px solid var(--slate-200, #e2e8f0)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '0.9rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: 'var(--navy-900)'
                        }}
                      >
                        {cand.candidateLocation}
                      </span>

                      <span
                        className="vc-badge"
                        style={{
                          background: isCommunity ? 'rgba(16, 185, 129, 0.12)' : isFallback ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                          color: isCommunity ? 'var(--emerald-800)' : isFallback ? 'var(--amber-800)' : 'var(--blue-800)',
                          borderColor: isCommunity ? 'var(--emerald-300)' : isFallback ? 'var(--amber-300)' : 'var(--blue-300)'
                        }}
                      >
                        {cand.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--slate-500)' }}>
                        Rank Score: {cand.totalScore}
                      </span>

                      {onSelectLocation && (
                        <button
                          type="button"
                          className="vc-btn vc-btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => onSelectLocation(cand.candidateLocation)}
                          title={`Calculate check character for ${cand.candidateLocation}`}
                        >
                          Check in Calculator
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Phonetic & Check Character Data */}
                  <div style={{ fontSize: '0.8125rem', color: 'var(--slate-700)', marginBottom: '0.5rem' }}>
                    <strong>Check Character:</strong>{' '}
                    <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{cand.checkChar}</span>
                    {cand.spokenText && (
                      <span style={{ marginLeft: '0.75rem', color: 'var(--slate-500)' }}>
                        (Spoken: <em>{cand.spokenText}</em>)
                      </span>
                    )}
                  </div>

                  {/* Evidence Explanations */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    {cand.explanations.map((exp, idx) => (
                      <div key={idx} style={{ fontSize: '0.8125rem', color: isFallback ? 'var(--amber-900)' : 'var(--slate-700)', lineHeight: 1.4 }}>
                        &bull; {exp}
                      </div>
                    ))}
                  </div>

                  {/* Score Breakdown Detail */}
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--slate-400)',
                      paddingTop: '0.35rem',
                      borderTop: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span>Base: {cand.scoreBreakdown.communityBase}</span>
                    {cand.scoreBreakdown.confirmationBoost > 0 && <span>Confirmations: +{cand.scoreBreakdown.confirmationBoost}</span>}
                    {cand.scoreBreakdown.acousticHeuristic > 0 && <span>Acoustic Heuristic: +{cand.scoreBreakdown.acousticHeuristic}</span>}
                    {cand.scoreBreakdown.sameAisleBoost > 0 && <span>Same Aisle: +{cand.scoreBreakdown.sameAisleBoost}</span>}
                    {cand.scoreBreakdown.checkCharCollisionBoost > 0 && <span>Check Character Collision: +{cand.scoreBreakdown.checkCharCollisionBoost}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Input state */}
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
