/**
 * Milestone 5: Read-Only Evidence Adapter
 *
 * Connects the pure suggestion engine in src/logic/voiceConfusion/ with live
 * warehouse community reports from Supabase / service layer.
 *
 * Invariants & Architecture Guarantees:
 * 1. Read-Only: Uses existing service functions read-only (SELECT only).
 *    Never performs database writes, migrations, RLS changes, or mutations.
 * 2. Pure Engine Separation: Lives in src/voiceConfusion/ and does NOT pollute
 *    src/logic/voiceConfusion/. The pure engine static import gate remains 100% satisfied.
 * 3. Degraded Offline / Unconfigured Handling:
 *    When Supabase is unconfigured or a network fetch error occurs, returns
 *    { kind: 'unavailable', userMessage: 'community evidence unavailable' }.
 *    NEVER shows "no reports" when unavailable.
 *    The engine continues to return NATO phonetic results.
 * 4. Performance & Caching:
 *    Zero network calls per keystroke. One fetch per committed input,
 *    cached by normalised location, with stale response discarding.
 * 5. Bounded Reads:
 *    Uses targeted exact-location lookup (fetchLocationReports) with explicit limit (default 100).
 *    Detects truncation to signal "results may be incomplete" state.
 */

import { isPersistenceConfigured, fetchLocationReports } from './service.ts';
import { normaliseLocationCode } from './normalizer.ts';
import { suggestConfusions } from '../logic/voiceConfusion/engine.ts';
import type { VoiceConfusionReport, SuggestionOptions, SuggestionResult } from '../logic/voiceConfusion/types.ts';

export type EvidenceResult =
  | {
      kind: 'available';
      reports: VoiceConfusionReport[];
      isTruncated: boolean;
    }
  | {
      kind: 'unavailable';
      reason: string;
      userMessage: 'community evidence unavailable';
    };

export interface EvidenceSuggestionsResult {
  suggestionResult: SuggestionResult;
  evidence: EvidenceResult;
}

// In-memory cache keyed by normalised location
const evidenceCache = new Map<string, EvidenceResult>();

/**
 * Clears the evidence cache (useful for testing or cache invalidation).
 */
export function clearEvidenceCache(): void {
  evidenceCache.clear();
}

/**
 * Retrieves cached evidence for a given location code if present.
 */
export function getCachedEvidence(location: string): EvidenceResult | undefined {
  const clean = normaliseLocationCode(location);
  return evidenceCache.get(clean);
}

/**
 * Manually populates the cache (primarily for unit testing mocked scenarios).
 */
export function setCachedEvidence(location: string, evidence: EvidenceResult): void {
  const clean = normaliseLocationCode(location);
  evidenceCache.set(clean, evidence);
}

/**
 * Fetches community reports for a location with caching and graceful degradation.
 *
 * Rules:
 * - If Supabase persistence is not configured: returns 'unavailable' with message 'community evidence unavailable'.
 * - If network or query error occurs: returns 'unavailable' with message 'community evidence unavailable'.
 * - If successful: returns 'available' with reports and isTruncated indicator.
 */
export async function fetchEvidenceForLocation(
  location: string,
  options?: {
    limit?: number;
    bypassCache?: boolean;
    forceConfigured?: boolean; // For testing unconfigured override
  }
): Promise<EvidenceResult> {
  const clean = normaliseLocationCode(location);
  if (!clean) {
    return {
      kind: 'available',
      reports: [],
      isTruncated: false
    };
  }

  if (!options?.bypassCache && evidenceCache.has(clean)) {
    return evidenceCache.get(clean)!;
  }

  // Check if live persistence is configured (unless test overrides)
  const isConfigured = options?.forceConfigured !== undefined
    ? options.forceConfigured
    : isPersistenceConfigured();

  if (!isConfigured) {
    const unavail: EvidenceResult = {
      kind: 'unavailable',
      reason: 'database_not_configured',
      userMessage: 'community evidence unavailable'
    };
    // Do not cache unconfigured status permanently so reconnecting can work
    return unavail;
  }

  try {
    const limit = options?.limit ?? 100;
    const { reports, isTruncated } = await fetchLocationReports(clean, limit);

    const available: EvidenceResult = {
      kind: 'available',
      reports,
      isTruncated
    };

    evidenceCache.set(clean, available);
    return available;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const unavail: EvidenceResult = {
      kind: 'unavailable',
      reason: errorMsg,
      userMessage: 'community evidence unavailable'
    };
    return unavail;
  }
}

/**
 * Combines evidence lookup with phonetic suggestion engine.
 *
 * Always returns a valid engine suggestion result (NATO phonetic results),
 * elevating candidates to Tier 1 ONLY when community evidence is available,
 * approved/confirmed, and acoustic.
 */
export async function getEvidenceSuggestions(
  location: string,
  options?: SuggestionOptions & {
    limit?: number;
    bypassCache?: boolean;
    forceConfigured?: boolean;
  }
): Promise<EvidenceSuggestionsResult> {
  const evidence = await fetchEvidenceForLocation(location, options);

  // If evidence is available, pass community reports into the engine.
  // If unavailable, pass undefined so engine runs on NATO phonetics alone.
  const communityReports = evidence.kind === 'available' ? evidence.reports : undefined;

  const suggestionResult = suggestConfusions(location, {
    ...options,
    communityReports
  });

  return {
    suggestionResult,
    evidence
  };
}

/**
 * Debounced committed input fetch coordinator with stale-response protection.
 *
 * Guarantees:
 * - No network call per keystroke.
 * - One fetch triggered once input is committed or debounced.
 * - Out-of-order or stale in-flight responses are strictly ignored.
 */
export class CommittedEvidenceCoordinator {
  private currentRequestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Schedules a debounced fetch for committed input.
   * Returns a cancellation function.
   */
  public scheduleFetch(
    location: string,
    onComplete: (result: EvidenceSuggestionsResult) => void,
    delayMs: number = 300,
    options?: SuggestionOptions & { limit?: number; bypassCache?: boolean; forceConfigured?: boolean }
  ): () => void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const requestId = ++this.currentRequestId;

    this.debounceTimer = setTimeout(async () => {
      try {
        const result = await getEvidenceSuggestions(location, options);
        // Only deliver if this is still the latest active request
        if (requestId === this.currentRequestId) {
          onComplete(result);
        }
      } catch {
        // If an unexpected exception escapes, ignore if stale
      }
    }, delayMs);

    return () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    };
  }

  /**
   * Immediately executes a fetch for a committed input (e.g. on Enter key or button click),
   * cancelling any pending debounced timers.
   */
  public async executeImmediate(
    location: string,
    options?: SuggestionOptions & { limit?: number; bypassCache?: boolean; forceConfigured?: boolean }
  ): Promise<EvidenceSuggestionsResult | null> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const requestId = ++this.currentRequestId;
    const result = await getEvidenceSuggestions(location, options);

    if (requestId === this.currentRequestId) {
      return result;
    }

    // Discard stale response
    return null;
  }
}
