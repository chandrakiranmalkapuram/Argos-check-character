import React, { useState, useMemo } from 'react';
import type { ReverseLookupResult } from '../logic/types.ts';

interface ReverseLookupViewProps {
  result: ReverseLookupResult;
  onSelectLocation: (loc: string) => void;
}

export const ReverseLookupView: React.FC<ReverseLookupViewProps> = ({
  result,
  onSelectLocation
}) => {
  const [aisleFilter, setAisleFilter] = useState('');

  const filteredAisles = useMemo(() => {
    if (!aisleFilter.trim()) {
      return result.aisles;
    }
    const cleanFilter = aisleFilter.trim().toLowerCase();
    return result.aisles.filter(a =>
      a.aisle.toLowerCase().includes(cleanFilter) ||
      a.locations.some(loc => loc.toLowerCase().includes(cleanFilter))
    );
  }, [result.aisles, aisleFilter]);

  return (
    <section className="reverse-results-card fade-in" aria-label="Reverse Lookup Results">
      <div className="reverse-header">
        <div>
          <h3 className="reverse-title">
            All Locations with Check Character "{result.checkChar}"
          </h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--slate-500)' }}>
            Total {result.totalMatches} shelf locations across {result.aisles.length} aisles
          </span>
        </div>

        <input
          type="search"
          className="reverse-filter-input"
          placeholder="Filter aisle (e.g. 10)"
          value={aisleFilter}
          onChange={e => setAisleFilter(e.target.value)}
          aria-label="Filter aisles"
        />
      </div>

      <div className="reverse-aisles-list">
        {filteredAisles.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--slate-500)', padding: '1rem', textAlign: 'center' }}>
            No aisles match "{aisleFilter}"
          </p>
        ) : (
          filteredAisles.map(group => (
            <details key={group.aisle} className="aisle-details">
              <summary className="aisle-summary">
                <span>Aisle {group.aisle}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue-600)' }}>
                  {group.locations.length} locations
                </span>
              </summary>
              <div className="aisle-locations">
                {group.locations.map((loc, idx) => (
                  <React.Fragment key={loc}>
                    <button
                      type="button"
                      onClick={() => onSelectLocation(loc)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--navy-900)',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        fontWeight: 600,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: '0 0.15rem'
                      }}
                      title="Inspect this location"
                    >
                      {loc}
                    </button>
                    {idx < group.locations.length - 1 && ', '}
                  </React.Fragment>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
};
