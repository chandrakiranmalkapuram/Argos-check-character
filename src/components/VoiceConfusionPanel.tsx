import React, { useState, useEffect, useMemo, useRef } from 'react';
import { suggestConfusions } from '../logic/voiceConfusion/engine.ts';
import { parseLocationCode } from '../logic/voiceConfusion/grammar.ts';
import { fetchEvidenceForLocation } from '../voiceConfusion/evidenceAdapter.ts';
import type {
  SuggestionResult,
  ConfusionCandidate,
  ReportedPairEntry
} from '../logic/voiceConfusion/types.ts';
import type { EvidenceResult } from '../voiceConfusion/evidenceAdapter.ts';

export interface VoiceConfusionPanelProps {
  currentLocation: string;
  onSelectLocation?: (location: string) => void;
  onOpenVoiceConfusionReports?: (location: string) => void;
  debounceMs?: number;
}

export const VoiceConfusionPanel: React.FC<VoiceConfusionPanelProps> = ({
  currentLocation,
  onSelectLocation,
  onOpenVoiceConfusionReports,
  debounceMs = 300
}) => {
  // Committed location state debounced from input (default 300ms)
  const [committedLocation, setCommittedLocation] = useState<string>('');
  const [evidence, setEvidence] = useState<EvidenceResult | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(false);

  // Arithmetic pool lazy computation & pagination state
  const [isArithmeticOpen, setIsArithmeticOpen] = useState<boolean>(false);
  const [arithmeticFilter, setArithmeticFilter] = useState<string>('');
  const [arithmeticPage, setArithmeticPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  // Stale request guard
  const activeFetchIdRef = useRef<number>(0);

  // Debounce input commits: zero network calls per keystroke
  useEffect(() => {
    const trimmed = currentLocation.trim().toUpperCase();
    const timer = setTimeout(() => {
      setCommittedLocation(trimmed);
      setEvidence(null);
      setIsLoadingEvidence(trimmed.length > 0 && parseLocationCode(trimmed).kind === 'supported');
      setArithmeticPage(1);
      setArithmeticFilter('');
      setIsArithmeticOpen(false);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [currentLocation, debounceMs]);

  // When committed location changes, fetch evidence while engine computes phonetic results immediately
  useEffect(() => {
    if (!committedLocation) {
      return;
    }

    const parsed = parseLocationCode(committedLocation);
    if (parsed.kind !== 'supported') {
      return;
    }

    const fetchId = ++activeFetchIdRef.current;

    fetchEvidenceForLocation(committedLocation)
      .then(res => {
        if (fetchId === activeFetchIdRef.current) {
          setEvidence(res);
          setIsLoadingEvidence(false);
        }
      })
      .catch(() => {
        if (fetchId === activeFetchIdRef.current) {
          setEvidence({
            kind: 'unavailable',
            reason: 'network_error',
            userMessage: 'community evidence unavailable'
          });
          setIsLoadingEvidence(false);
        }
      });
  }, [committedLocation]);

  // Compute base suggestions (NATO phonetics + community reports if available)
  const suggestionResult: SuggestionResult | null = useMemo(() => {
    if (!committedLocation) return null;

    const communityReports = evidence?.kind === 'available' ? evidence.reports : undefined;
    return suggestConfusions(committedLocation, {
      communityReports,
      includeArithmeticCollisions: false
    });
  }, [committedLocation, evidence]);

  // Compute arithmetic collisions lazily ONLY when the arithmetic pool disclosure is opened
  const arithmeticCollisions: ConfusionCandidate[] = useMemo(() => {
    if (!isArithmeticOpen || !committedLocation || !suggestionResult?.isValid) {
      return [];
    }

    const communityReports = evidence?.kind === 'available' ? evidence.reports : undefined;
    const fullResult = suggestConfusions(committedLocation, {
      communityReports,
      includeArithmeticCollisions: true
    });

    return fullResult.candidates.filter(c => c.tier === 'arithmetic_collision');
  }, [isArithmeticOpen, committedLocation, evidence, suggestionResult?.isValid]);

  // Filtered arithmetic candidates for text search
  const filteredArithmetic = useMemo(() => {
    if (!arithmeticFilter.trim()) return arithmeticCollisions;
    const q = arithmeticFilter.trim().toUpperCase();
    return arithmeticCollisions.filter(
      c => c.location.includes(q) || c.spokenText.toUpperCase().includes(q)
    );
  }, [arithmeticCollisions, arithmeticFilter]);

  // Paginate arithmetic candidates (50 per page, never render 2,600 nodes at once)
  const paginatedArithmetic = useMemo(() => {
    const start = (arithmeticPage - 1) * PAGE_SIZE;
    return filteredArithmetic.slice(start, start + PAGE_SIZE);
  }, [filteredArithmetic, arithmeticPage]);

  const totalArithmeticPages = Math.max(1, Math.ceil(filteredArithmetic.length / PAGE_SIZE));

  if (!committedLocation) {
    return null;
  }

  // State: Unsupported or invalid input
  if (!suggestionResult || !suggestionResult.isValid) {
    const errorMsg =
      (suggestionResult?.parsed?.kind === 'unsupported' ? suggestionResult.parsed.message : null) ||
      (committedLocation.length > 4
        ? 'Store location codes are exactly 4 characters. Longer codes are unsupported.'
        : 'Invalid or unsupported store location format.');

    return (
      <section
        className="vc-panel vc-panel--invalid"
        aria-labelledby="vc-panel-heading"
        role="region"
      >
        <div className="vc-panel-header">
          <h3 id="vc-panel-heading" className="vc-panel-title">
            Voice Confusion Risk Analysis
          </h3>
        </div>
        <div className="vc-alert vc-alert--warning" role="alert">
          <svg className="vc-alert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="vc-alert-text">{errorMsg}</span>
        </div>
      </section>
    );
  }

  const closeSoundAlikes = suggestionResult.candidates.filter(
    c => c.tier === 'tier1_reported' || c.tier === 'tier2_model_similar'
  );
  const possibleMatches = suggestionResult.candidates.filter(c => c.tier === 'tier3_possible');
  const reportedPairs = suggestionResult.reportedPairs || [];
  const differentCheckReports = suggestionResult.differentCheckCommunityReports || [];

  const isSpecialFacilityInput =
    suggestionResult.parsed?.kind === 'supported' &&
    suggestionResult.parsed.pattern === 'cash_office_collection_point';

  return (
    <section
      className="vc-panel"
      aria-labelledby="vc-panel-heading"
      role="region"
    >
      <div className="vc-panel-header">
        <div className="vc-panel-title-group">
          <h3 id="vc-panel-heading" className="vc-panel-title">
            Voice Confusion Risk Analysis
          </h3>
          <span className="vc-panel-subtitle">
            Acoustic sound-alikes sharing check character <strong>{suggestionResult.checkChar}</strong>
          </span>
        </div>

        {/* Live Region for Evidence Loading / Status */}
        <div className="vc-live-status" aria-live="polite" aria-atomic="true">
          {isLoadingEvidence && (
            <span className="vc-badge vc-badge--loading" id="evidence-loading-indicator">
              Loading community evidence...
            </span>
          )}
        </div>
      </div>

      {/* State Alerts */}
      {evidence?.kind === 'unavailable' && (
        <div className="vc-alert vc-alert--info" role="status">
          <svg className="vc-alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="vc-alert-text">community evidence unavailable</span>
        </div>
      )}

      {evidence?.kind === 'available' && evidence.isTruncated && (
        <div className="vc-alert vc-alert--warning" role="status">
          <svg className="vc-alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="vc-alert-text">
            {evidence.isHighTrustTruncated && evidence.isUnverifiedTruncated
              ? 'results may be incomplete: some approved reports and older unverified reports are not shown'
              : evidence.isHighTrustTruncated
              ? 'results may be incomplete: some approved reports may be missing'
              : 'results may be incomplete: some older unverified reports are not shown'}
          </span>
        </div>
      )}

      {/* SECTION (a): Reported pairs (only when non-empty) */}
      {reportedPairs.length > 0 && (
        <div className="vc-section vc-section--reported-pairs" aria-labelledby="vc-sec-reported-heading">
          <h4 id="vc-sec-reported-heading" className="vc-section-title">
            Reported pairs ({reportedPairs.length})
          </h4>
          <div className="vc-candidates-list" role="list">
            {reportedPairs.map((pair, idx) => (
              <ReportedPairCard
                key={`${pair.reportedLocation}-${idx}`}
                pair={pair}
                onSelectLocation={onSelectLocation}
                onOpenVoiceConfusionReports={onOpenVoiceConfusionReports}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECTION (b): Close sound-alikes (Tier 1 + Tier 2) */}
      <div className="vc-section vc-section--close" aria-labelledby="vc-sec-close-heading">
        <h4 id="vc-sec-close-heading" className="vc-section-title">
          Close sound-alikes
        </h4>

        {closeSoundAlikes.length === 0 ? (
          <div className="vc-empty-notice" role="note">
            {isSpecialFacilityInput ? (
              <p>
                Special facility codes (Cash Office / Collection Point) use 3 spoken words and have
                no close 4-word standard sound-alikes under the model threshold.
              </p>
            ) : (
              <p>
                No same-check-character code is phonetically close enough under the current model. This does not mean none exists.
              </p>
            )}
          </div>
        ) : (
          <div className="vc-candidates-list" role="list">
            {closeSoundAlikes.map(cand => (
              <CandidateCard
                key={cand.location}
                candidate={cand}
                searchedSpokenText={suggestionResult.spokenText || ''}
                onSelectLocation={onSelectLocation}
              />
            ))}
          </div>
        )}
      </div>

      {/* SECTION (c): Possible matches (Tier 3), collapsed with count */}
      {possibleMatches.length > 0 && (
        <details
          key={`possible-${committedLocation}`}
          className="vc-disclosure vc-disclosure--possible"
        >
          <summary className="vc-disclosure-summary">
            <span className="vc-disclosure-title">
              Possible sound-alikes ({possibleMatches.length})
            </span>
            <svg className="vc-disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="vc-disclosure-content">
            <div className="vc-candidates-list" role="list">
              {possibleMatches.map(cand => (
                <CandidateCard
                  key={cand.location}
                  candidate={cand}
                  searchedSpokenText={suggestionResult.spokenText || ''}
                  onSelectLocation={onSelectLocation}
                />
              ))}
            </div>
          </div>
        </details>
      )}

      {/* SECTION (d): All same-check codes (arithmetic pool), collapsed, computed only when opened */}
      <details
        key={`pool-${committedLocation}`}
        className="vc-disclosure vc-disclosure--pool"
        onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => {
          setIsArithmeticOpen(e.currentTarget.open);
        }}
      >
        <summary className="vc-disclosure-summary">
          <span className="vc-disclosure-title">
            Remaining same-check codes (arithmetic pool)
          </span>
          <svg className="vc-disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="vc-disclosure-content">
          <p className="vc-pool-intro">
            Arithmetic collisions that share check character <strong>{suggestionResult.checkChar}</strong>,
            but differ acoustically by 2 or more far tokens.
          </p>

          {/* Text filter */}
          <div className="vc-pool-filter-group">
            <input
              type="text"
              className="vc-pool-filter-input"
              placeholder="Filter same-check codes (e.g. 11BZ)..."
              value={arithmeticFilter}
              onChange={e => {
                setArithmeticFilter(e.target.value);
                setArithmeticPage(1);
              }}
              aria-label="Filter same-check codes"
            />
            {arithmeticFilter && (
              <button
                type="button"
                className="vc-pool-filter-clear"
                onClick={() => {
                  setArithmeticFilter('');
                  setArithmeticPage(1);
                }}
                aria-label="Clear filter"
              >
                Clear
              </button>
            )}
          </div>

          <div className="vc-pool-meta">
            <span>Showing {filteredArithmetic.length === 0 ? 0 : (arithmeticPage - 1) * PAGE_SIZE + 1}–{Math.min(arithmeticPage * PAGE_SIZE, filteredArithmetic.length)} of {filteredArithmetic.length} codes</span>
          </div>

          <div className="vc-candidates-list" role="list">
            {paginatedArithmetic.map(cand => (
              <CandidateCard
                key={cand.location}
                candidate={cand}
                searchedSpokenText={suggestionResult.spokenText || ''}
                onSelectLocation={onSelectLocation}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalArithmeticPages > 1 && (
            <div className="vc-pagination" role="navigation" aria-label="Arithmetic pool pagination">
              <button
                type="button"
                className="vc-pagination-btn"
                disabled={arithmeticPage <= 1}
                onClick={() => setArithmeticPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                &larr; Previous
              </button>
              <span className="vc-pagination-status">
                Page {arithmeticPage} of {totalArithmeticPages}
              </span>
              <button
                type="button"
                className="vc-pagination-btn"
                disabled={arithmeticPage >= totalArithmeticPages}
                onClick={() => setArithmeticPage(p => Math.min(totalArithmeticPages, p + 1))}
                aria-label="Next page"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      </details>

      {/* SECTION (e): Reported confusions with a different check character */}
      {differentCheckReports.length > 0 && (
        <details
          key={`diff-${committedLocation}`}
          className="vc-disclosure vc-disclosure--diff-check"
        >
          <summary className="vc-disclosure-summary">
            <span className="vc-disclosure-title">
              Reported confusions with a different check character: the headset would normally reject these ({differentCheckReports.length})
            </span>
            <svg className="vc-disclosure-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="vc-disclosure-content">
            <div className="vc-candidates-list" role="list">
              {differentCheckReports.map((diff, idx) => (
                <article key={`${diff.reportedLocation}-${idx}`} className="vc-diff-check-card" role="listitem">
                  <div className="vc-candidate-header">
                    <span className="vc-candidate-code">{diff.reportedLocation}</span>
                    <span className="vc-badge vc-badge--diff-check">
                      Check: {diff.reportedCheckChar} (different check character)
                    </span>
                  </div>
                  <p className="vc-diff-check-explanation">{diff.explanation}</p>
                  {diff.provenance !== 'seed_observation' && diff.details && (
                    <details className="vc-reporter-note-disclosure">
                      <summary className="vc-reporter-note-summary">
                        Reporter&apos;s note (free text, unverified)
                      </summary>
                      <p className="vc-reporter-note-text">{diff.details.slice(0, 200)}</p>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
};

/**
 * Subcomponent rendering an individual Reported Pair in Section (a)
 */
interface ReportedPairCardProps {
  pair: ReportedPairEntry;
  onSelectLocation?: (location: string) => void;
  onOpenVoiceConfusionReports?: (location: string) => void;
}

const ReportedPairCard: React.FC<ReportedPairCardProps> = ({
  pair,
  onSelectLocation,
  onOpenVoiceConfusionReports
}) => {
  const reasonMap: Record<string, string> = {
    similar_sounding: 'Similar sounding',
    headset_misrecognition: 'Headset misrecognition',
    similar_check_character: 'Similar check character',
    other: 'Other'
  };

  const reasonLabel = pair.reason ? (reasonMap[pair.reason] || pair.reason) : 'Reported';

  return (
    <article className="vc-candidate-card vc-candidate-card--reported" role="listitem">
      <div className="vc-candidate-header">
        <div className="vc-candidate-code-group">
          <span className="vc-candidate-code" aria-label={`Reported location ${pair.reportedLocation}`}>
            {pair.reportedLocation}
          </span>
          <span className="vc-badge vc-badge--fact">
            Check character: {pair.checkChar} (same check character)
          </span>
        </div>

        <div className="vc-candidate-actions">
          {onSelectLocation && (
            <button
              type="button"
              className="vc-btn vc-btn--secondary"
              onClick={() => onSelectLocation(pair.reportedLocation)}
              aria-label={`Calculate check character for ${pair.reportedLocation}`}
            >
              Check in Calculator
            </button>
          )}
          {onOpenVoiceConfusionReports && (
            <button
              type="button"
              className="vc-btn vc-btn--ghost"
              onClick={() => onOpenVoiceConfusionReports(pair.reportedLocation)}
              aria-label={`View reports for ${pair.reportedLocation}`}
            >
              View Reports
            </button>
          )}
        </div>
      </div>

      <div className="vc-badge-row">
        {/* Status / Provenance Label */}
        <span className="vc-badge vc-badge--evidence">
          {pair.label}
        </span>

        {/* Opposite-direction badge */}
        {pair.direction === 'opposite_direction' && (
          <span className="vc-badge vc-badge--opposite">
            Reported, opposite direction
          </span>
        )}

        {/* Reason label */}
        <span className="vc-badge vc-badge--reason">
          {reasonLabel}
        </span>

        {/* Confirmations count for unverified reports */}
        {pair.label === 'Reported, unverified' && pair.reportCount > 0 && (
          <span className="vc-badge vc-badge--confirmations">
            {pair.reportCount} confirmation{pair.reportCount === 1 ? '' : 's'}
          </span>
        )}

        {/* Existence Badge */}
        <span className="vc-badge vc-badge--existence">
          possible code, not verified to exist in your store
        </span>
      </div>

      <div className="vc-candidate-spoken">
        <span className="vc-spoken-label">Phonetic:</span>
        <span className="vc-spoken-text">&ldquo;{pair.spokenText}&rdquo;</span>
      </div>

      {pair.provenance !== 'seed_observation' && pair.details && (
        <details className="vc-reporter-note-disclosure">
          <summary className="vc-reporter-note-summary">
            Reporter&apos;s note (free text, unverified)
          </summary>
          <p className="vc-reporter-note-text">{pair.details.slice(0, 200)}</p>
        </details>
      )}
    </article>
  );
};

/**
 * Subcomponent rendering an individual Candidate Row in Sections (b), (c), (d)
 */
interface CandidateCardProps {
  candidate: ConfusionCandidate;
  searchedSpokenText?: string;
  onSelectLocation?: (location: string) => void;
}

const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  searchedSpokenText: _searchedSpokenText,
  onSelectLocation
}) => {
  const [isModelDetailsOpen, setIsModelDetailsOpen] = useState(false);

  // Evidence badge label
  let evidenceBadgeLabel: string | null = null;
  if (candidate.isReferenceExample) {
    evidenceBadgeLabel = 'Reference example';
  } else if (candidate.tier === 'tier1_reported') {
    evidenceBadgeLabel = 'Approved report';
  } else if (candidate.tier === 'tier2_model_similar') {
    evidenceBadgeLabel = 'Model similar';
  } else if (candidate.tier === 'tier3_possible') {
    evidenceBadgeLabel = 'Possible match';
  } else {
    evidenceBadgeLabel = 'Arithmetic pool';
  }

  return (
    <article className={`vc-candidate-card vc-candidate-card--${candidate.tier}`} role="listitem">
      {/* 1. Header with Code and Calculator Button */}
      <div className="vc-candidate-header">
        <div className="vc-candidate-code-group">
          <span className="vc-candidate-code" aria-label={`Candidate location ${candidate.location}`}>
            {candidate.location}
          </span>
          {/* Arithmetic Fact: Same Check Character */}
          <span className="vc-badge vc-badge--fact">
            Check character: {candidate.checkChar} (same check character)
          </span>
        </div>

        {onSelectLocation && (
          <button
            type="button"
            className="vc-btn vc-btn--secondary"
            onClick={() => onSelectLocation(candidate.location)}
            aria-label={`Calculate check character for ${candidate.location}`}
          >
            Check in Calculator
          </button>
        )}
      </div>

      {/* 2. Visual Separation of Badges */}
      <div className="vc-badge-row">
        {/* Model assessment badge */}
        <span className="vc-badge vc-badge--model">
          Phonetic similarity (model assessment)
        </span>

        {/* Observed evidence badge */}
        {evidenceBadgeLabel && (
          <span className="vc-badge vc-badge--evidence">
            {evidenceBadgeLabel}
          </span>
        )}

        {/* Existence: unknown */}
        <span className="vc-badge vc-badge--existence">
          possible code, not verified to exist in your store
        </span>
      </div>

      {/* 3. Spoken Forms Token-by-Token Alignment with Differing Tokens Highlighted */}
      <div className="vc-alignment-container" aria-label="Spoken token alignment">
        <div className="vc-alignment-table" role="table">
          <div className="vc-alignment-row" role="row">
            <span className="vc-row-label" role="rowheader">Searched:</span>
            <div className="vc-token-slots">
              {candidate.alignment.map((slot, idx) => {
                const isDiff = slot.distance > 0;
                return (
                  <span
                    key={idx}
                    className={`vc-token-box ${isDiff ? 'vc-token-box--diff' : ''}`}
                    title={slot.tokenA ? `Spoken word: ${slot.tokenA}` : 'Omitted in searched location'}
                  >
                    {slot.tokenA ?? '—'}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="vc-alignment-row" role="row">
            <span className="vc-row-label" role="rowheader">Candidate:</span>
            <div className="vc-token-slots">
              {candidate.alignment.map((slot, idx) => {
                const isDiff = slot.distance > 0;
                return (
                  <span
                    key={idx}
                    className={`vc-token-box ${isDiff ? 'vc-token-box--diff' : ''}`}
                    title={slot.tokenB ? `Spoken word: ${slot.tokenB}` : 'Omitted in candidate location'}
                  >
                    {slot.tokenB ?? '—'}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="vc-alignment-row vc-alignment-row--verbal" role="row">
            <span className="vc-row-label" role="rowheader">Relation:</span>
            <div className="vc-token-slots">
              {candidate.alignment.map((slot, idx) => {
                const isDiff = slot.distance > 0;
                const verbal = !isDiff ? 'identical' : slot.distance <= 0.55 ? 'close' : 'far';
                return (
                  <span
                    key={idx}
                    className={`vc-verbal-tag vc-verbal-tag--${verbal}`}
                  >
                    {verbal}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Optional Model details disclosure (numeric distances kept strictly inside) */}
      <details
        className="vc-model-details"
        onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => {
          setIsModelDetailsOpen(e.currentTarget.open);
        }}
      >
        <summary className="vc-model-details-summary">
          Model details (model assessment, not a probability)
        </summary>
        {isModelDetailsOpen && (
          <div className="vc-model-details-content">
            <p className="vc-model-distances">
              Mean distance: {candidate.meanDistance.toFixed(4)} | Total distance: {candidate.totalDistance.toFixed(4)}
            </p>
            <ul className="vc-model-alignment-list">
              {candidate.alignment.map((slot, idx) => (
                <li key={idx}>
                  Slot {idx + 1}: &ldquo;{slot.tokenA ?? '(gap)'}&rdquo; vs &ldquo;{slot.tokenB ?? '(gap)'}&rdquo;
                  &mdash; acoustic distance: {slot.distance.toFixed(4)} ({slot.distance === 0 ? 'identical' : slot.distance <= 0.55 ? 'close' : 'far'})
                </li>
              ))}
            </ul>
            <p className="vc-model-plain-explanation">{candidate.explanation}</p>
          </div>
        )}
      </details>
    </article>
  );
};
