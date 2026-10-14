import React from 'react';
import type { SimilarLocation } from '../logic/types.ts';

interface SimilarLocationsListProps {
  locations: SimilarLocation[];
  onSelectLocation: (loc: string) => void;
  onOpenVoiceConfusionReports?: (loc?: string) => void;
}

export const SimilarLocationsList: React.FC<SimilarLocationsListProps> = ({
  locations,
  onSelectLocation,
  onOpenVoiceConfusionReports
}) => {
  if (!locations || locations.length === 0) {
    return null;
  }

  return (
    <aside className="similar-alert-card fade-in" aria-live="polite">
      <div className="similar-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Stockroom Warning: Voice Confusion Risk</span>
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'var(--slate-700)', margin: 0 }}>
        The voice headset would accept the same check character for these easily confused locations:
      </p>

      <ul className="similar-list">
        {locations.map(item => (
          <li key={item.location} className="similar-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="similar-loc-pill"
                onClick={() => onSelectLocation(item.location)}
                title={`Inspect location ${item.location}`}
                style={{ cursor: 'pointer', border: '1px solid var(--slate-300)' }}
              >
                {item.location}
              </button>
              <span style={{ fontWeight: 600, color: 'var(--slate-800)' }}>
                "{item.spokenText}"
              </span>
            </div>
            <span className="similar-reason">({item.reason})</span>
          </li>
        ))}
      </ul>

      {onOpenVoiceConfusionReports && (
        <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--amber-200)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="vc-btn vc-btn-secondary"
            onClick={() => onOpenVoiceConfusionReports()}
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem', background: 'var(--white)' }}
          >
            <span>Search Community Voice Confusion Reports &rarr;</span>
          </button>
        </div>
      )}
    </aside>
  );
};
