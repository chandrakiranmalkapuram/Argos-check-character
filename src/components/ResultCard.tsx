import React, { useState } from 'react';
import type { CalculationResult } from '../logic/types.ts';

interface ResultCardProps {
  result: CalculationResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.checkChar);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(result.spokenText);
    utterance.rate = 0.9;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="result-card fade-in" role="region" aria-label={`${result.label ?? 'Calculated'} Check Character Result`}>
      <div className="result-header">
        <span className="result-badge">
          {result.label ? `${result.label} Calculation` : 'Verified Check Character'}
        </span>

        <div className="result-actions">
          {'speechSynthesis' in window && (
            <button
              type="button"
              className="action-btn"
              onClick={handleSpeak}
              aria-label="Listen to spoken headset pronunciation"
              title="Speak phrase"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span>{speaking ? 'Speaking...' : 'Listen'}</span>
            </button>
          )}

          <button
            type="button"
            className={`action-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            aria-label="Copy check character to clipboard"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="check-character-display">
        <div className="check-char-title">Check Character</div>
        <div className="check-char-value" data-testid="check-character-display">
          {result.checkChar}
        </div>
      </div>

      <div className="spoken-text-container">
        <span className="spoken-label">Headset Voice Phrase</span>
        <span className="spoken-phrase">"{result.spokenText}"</span>
      </div>

      <div>
        <button
          type="button"
          className="breakdown-toggle-btn"
          onClick={() => setShowBreakdown(prev => !prev)}
          aria-expanded={showBreakdown}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: showBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{showBreakdown ? 'Hide Formula Breakdown' : 'Show Mathematical Breakdown'}</span>
        </button>

        {showBreakdown && (
          <div className="breakdown-drawer fade-in" style={{ marginTop: '0.5rem' }}>
            <div style={{ color: 'var(--blue-400)', fontWeight: 600, marginBottom: '0.25rem' }}>
              {result.formulaDescription}
            </div>
            {result.breakdown.map((step, idx) => (
              <div key={idx} className="breakdown-step">
                {step}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
