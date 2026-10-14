import React from 'react';
import type { CheckMode } from '../logic/types.ts';
import { MODE_INPUT_CONFIG, type ModeInputConfig } from '../logic/constants.ts';

export const MODE_CONFIG: Record<CheckMode, ModeInputConfig> = MODE_INPUT_CONFIG;

interface CalculatorInputProps {
  query: string;
  onQueryChange: (val: string) => void;
  activeMode: CheckMode;
  onModeChange: (mode: CheckMode) => void;
  guidanceText?: string;
}

const EXAMPLE_QUICK_CHIPS = [
  { label: '10AK', title: 'Standard Store Shelf (Aisle 10)' },
  { label: '07AZ', title: 'Confusable Store location' },
  { label: 'J1PG', title: 'Jewellery Zone' },
  { label: 'S1PG', title: 'Security Zone' },
  { label: 'L10A', title: 'Linbin Shelf' },
  { label: 'ABCD', title: 'Dual 4-Letter: Store (ECHO) vs RFC (SEVEN FIVE)' },
  { label: '10A+', title: 'After Location' },
  { label: 'RETS', title: 'Returns Zone: Store (OSCAR) vs RFC (FOUR EIGHT)' },
  { label: 'NOVEMBER', title: 'NATO Reverse Lookup' }
];

export const CalculatorInput: React.FC<CalculatorInputProps> = ({
  query,
  onQueryChange,
  activeMode,
  onModeChange,
  guidanceText
}) => {
  const modeConfig = MODE_CONFIG[activeMode] ?? MODE_CONFIG.auto;

  return (
    <section className="input-card" aria-label="Location or Check Character Input">
      <div className="input-label-row">
        <label htmlFor="location-query-input" className="input-label">
          {activeMode === 'reverse' ? 'Phonetic Check Character' : 'Shelf Location Code'}
        </label>
        <span className="input-hint-badge">
          {activeMode === 'auto' && '⚡ Auto Detect'}
          {activeMode === 'store' && '🏪 Store Only'}
          {activeMode === 'rfc' && '🏢 RFC Only'}
          {activeMode === 'reverse' && '🔄 Reverse Lookup'}
        </span>
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Calculation Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'auto'}
          className={`tab-btn ${activeMode === 'auto' ? 'active' : ''}`}
          onClick={() => onModeChange('auto')}
        >
          Auto Detect
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'store'}
          className={`tab-btn ${activeMode === 'store' ? 'active' : ''}`}
          onClick={() => onModeChange('store')}
        >
          Store
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'rfc'}
          className={`tab-btn ${activeMode === 'rfc' ? 'active' : ''}`}
          onClick={() => onModeChange('rfc')}
        >
          RFC
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'reverse'}
          className={`tab-btn ${activeMode === 'reverse' ? 'active' : ''}`}
          onClick={() => onModeChange('reverse')}
        >
          Reverse
        </button>
      </div>

      <div className="input-field-wrapper">
        <input
          id="location-query-input"
          data-testid="location-query-input"
          type="text"
          className="location-input"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={modeConfig.placeholder}
          maxLength={12}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck="false"
          aria-describedby="guidance-hint mode-helper-text"
        />

        {query && (
          <button
            type="button"
            className="clear-input-btn"
            onClick={() => onQueryChange('')}
            aria-label="Clear input"
            title="Clear"
          >
            ×
          </button>
        )}
      </div>

      <div className="input-feedback-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <p
          id="guidance-hint"
          data-testid="mode-helper-text"
          className="input-helper-text"
          style={{ fontSize: '0.8rem', color: 'var(--slate-500)', margin: 0 }}
        >
          {modeConfig.helperText}
        </p>

        {guidanceText && guidanceText !== modeConfig.helperText && (
          <p
            id="calculation-status"
            data-testid="calculation-status"
            className="input-status-hint"
            style={{ fontSize: '0.775rem', color: 'var(--blue-600)', margin: 0, fontWeight: 500 }}
          >
            {guidanceText}
          </p>
        )}
      </div>

      <div className="chips-row">
        <span className="chips-label">Quick test:</span>
        {EXAMPLE_QUICK_CHIPS.map(chip => (
          <button
            key={chip.label}
            type="button"
            className="chip-btn"
            title={chip.title}
            onClick={() => onQueryChange(chip.label)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
};
