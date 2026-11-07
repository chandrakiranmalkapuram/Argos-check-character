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
import { LOCATION_FILTER_ALLOWLIST_REGEX } from './validation.ts';
import { suggestConfusions } from '../logic/voiceConfusion/engine.ts';
import type { VoiceConfusionReport, SuggestionOptions, SuggestionResult } from '../logic/voiceConfusion/types.ts';

export type EvidenceResult =
  | {
      kind: 'available';
      reports: VoiceConfusionReport[];
      isTruncated: boolean;
      isHighTrustTruncated: boolean;
      isUnverifiedTruncated: boolean;
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

/**
 * Default cache TTL: 5 minutes.
 */
export const EVIDENCE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedEvidenceEntry {
  result: EvidenceResult;
  timestamp: number;
}

// In-memory cache keyed by normalised location with timestamp for TTL expiry
const evidenceCache = new Map<string, CachedEvidenceEntry>();

/**
 * Clears the evidence cache (useful for testing or cache invalidation).
 */
export function clearEvidenceCache(): void {
  evidenceCache.clear();
}

/**
 * Retrieves cached evidence for a given location code if present and not expired.
 */
export function getCachedEvidence(location: string, ttlMs: number = EVIDENCE_CACHE_TTL_MS): EvidenceResult | undefined {
  const clean = normaliseLocationCode(location);
  const entry = evidenceCache.get(clean);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > ttlMs) {
    evidenceCache.delete(clean);
    return undefined;
  }
  return entry.result;
}

/**
 * Manually populates the cache (primarily for unit testing mocked scenarios).
 */
export function setCachedEvidence(location: string, evidence: EvidenceResult, timestamp?: number): void {
  const clean = normaliseLocationCode(location);
  evidenceCache.set(clean, {
    result: evidence,
    timestamp: timestamp ?? Date.now()
  });
}

/**
 * Fetches community reports for a location with caching, TTL expiry, and graceful degradation.
 *
 * Rules:
 * - Input Hardening: Validates input against strict allow-list (^[A-Z0-9+/-]{2,10}$).
 *   Invalid/hostile strings immediately return 'unavailable' and never reach the database.
 * - Cache TTL: Respects TTL (default 5 minutes). Bypasses cache when bypassCache = true.
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
    ttlMs?: number;
  }
): Promise<EvidenceResult> {
  const clean = normaliseLocationCode(location);
  if (!clean) {
    return {
      kind: 'available',
      reports: [],
      isTruncated: false,
      isHighTrustTruncated: false,
      isUnverifiedTruncated: false
    };
  }

  // Input hardening: validate against strict allow-list before querying
  if (!LOCATION_FILTER_ALLOWLIST_REGEX.test(clean)) {
    return {
      kind: 'unavailable',
      reason: 'invalid_location_format',
      userMessage: 'community evidence unavailable'
    };
  }

  const ttl = options?.ttlMs ?? EVIDENCE_CACHE_TTL_MS;
  const now = Date.now();

  if (!options?.bypassCache) {
    const cachedEntry = evidenceCache.get(clean);
    if (cachedEntry && now - cachedEntry.timestamp < ttl) {
      return cachedEntry.result;
    }
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
    const limit = options?.limit ?? 50;
    const { reports, isTruncated, isHighTrustTruncated, isUnverifiedTruncated } = await fetchLocationReports(clean, limit);

    const available: EvidenceResult = {
      kind: 'available',
      reports,
      isTruncated,
      isHighTrustTruncated,
      isUnverifiedTruncated
    };

    evidenceCache.set(clean, {
      result: available,
      timestamp: Date.now()
    });
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
 * Manual refresh path for a location's evidence.
 * Bypasses the cache and updates it with fresh database results.
 */
export async function refreshEvidenceForLocation(
  location: string,
  options?: {
    limit?: number;
    forceConfigured?: boolean;
  }
): Promise<EvidenceResult> {
  return fetchEvidenceForLocation(location, {
    ...options,
    bypassCache: true
  });
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
