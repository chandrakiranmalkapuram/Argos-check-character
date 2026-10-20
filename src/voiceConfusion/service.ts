/**
 * Database access, authentication, and service layer for Voice Confusion Reference.
 * Handles:
 * - Supabase Auth with email magic-link authentication (and offline/demo simulation)
 * - Server-verified user roles (admin, moderator, user) from protected database tables
 * - Community report submissions & shared persistence across all visitors
 * - Independent confirmations (+1 corroborations)
 * - Community abuse flagging
 * - Concurrent submission safety & duplicate detection
 * - Client-side rate limiting & anti-spam controls
 * - Idempotent seed observations (08MN->20AN, 16ZG->16JA, 81ZE->50ER, 01MM->Z01B)
 * - Dual-location search by voiced location or found location
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.ts';
import { normaliseLocationCode, getReportCompositeKey } from './normalizer.ts';
import { validateReportSubmission } from './validation.ts';
import type {
  VoiceConfusionReport,
  VoiceConfusionStatus,
  VoiceConfusionReason,
  ReportSubmissionPayload,
  LocationCorrectionPayload,
  SubmissionResponse,
  ConfirmReportResponse,
  FlagReportResponse,
  SearchReportsParams,
  SearchReportsResult,
  AuthUser,
  UserRole,
  MagicLinkResponse
} from './types.ts';

/**
 * Authoritative initial seed observations.
 * 
 * Requirement 3 observations (treated as user-provided reports, not universally verified rules):
 * 1. Voiced: 08MN -> Found: 20AN (Store standard format)
 * 2. Voiced: 16ZG -> Found: 16JA (Store standard format, same aisle)
 * 3. Voiced: 81ZE -> Found: 50ER (Store standard format)
 * 4. Voiced: 01MM -> Found: Z01B (Store Bulk zone with special prefix Z)
 * 
 * Plus legacy sample observations to preserve backward test compatibility.
 */
export const SEED_REFERENCE_OBSERVATIONS: VoiceConfusionReport[] = [
  // 1. Seed Observation 1: 08MN -> 20AN
  {
    id: '5eed0000-0000-4000-8000-000000000001',
    user_id: null,
    voiced_location: '08MN',
    found_location: '20AN',
    raw_voiced_location: '08MN',
    raw_found_location: '20AN',
    voiced_location_norm: '08MN',
    found_location_norm: '20AN',
    heard_location: '08MN',
    actual_location: '20AN',
    heard_location_norm: '08MN',
    actual_location_norm: '20AN',
    reason: 'similar_sounding',
    details: 'Spoken "zero-eight" acoustically confused with "twenty" over radio, combined with nasal M/N confusion.',
    status: 'community_submitted',
    provenance: 'seed_observation',
    confirmations_count: 1,
    flag_count: 0,
    created_at: '2026-10-18T08:00:00.000Z',
    updated_at: '2026-10-18T08:00:00.000Z'
  },
  // 2. Seed Observation 2: 16ZG -> 16JA
  {
    id: '5eed0000-0000-4000-8000-000000000002',
    user_id: null,
    voiced_location: '16ZG',
    found_location: '16JA',
    raw_voiced_location: '16ZG',
    raw_found_location: '16JA',
    voiced_location_norm: '16ZG',
    found_location_norm: '16JA',
    heard_location: '16ZG',
    actual_location: '16JA',
    heard_location_norm: '16ZG',
    actual_location_norm: '16JA',
    reason: 'similar_sounding',
    details: 'Aisle 16 stockroom location: ZG confused with JA due to headset consonant sound compression.',
    status: 'community_submitted',
    provenance: 'seed_observation',
    confirmations_count: 1,
    flag_count: 0,
    created_at: '2026-10-18T08:30:00.000Z',
    updated_at: '2026-10-18T08:30:00.000Z'
  },
  // 3. Seed Observation 3: 81ZE -> 50ER
  {
    id: '5eed0000-0000-4000-8000-000000000003',
    user_id: null,
    voiced_location: '81ZE',
    found_location: '50ER',
    raw_voiced_location: '81ZE',
    raw_found_location: '50ER',
    voiced_location_norm: '81ZE',
    found_location_norm: '50ER',
    heard_location: '81ZE',
    actual_location: '50ER',
    heard_location_norm: '81ZE',
    actual_location_norm: '50ER',
    reason: 'headset_misrecognition',
    details: 'Spoken "eighty-one" masked as "fifty" in ambient stockroom background noise; ZE heard as ER.',
    status: 'community_submitted',
    provenance: 'seed_observation',
    confirmations_count: 1,
    flag_count: 0,
    created_at: '2026-10-18T09:00:00.000Z',
    updated_at: '2026-10-18T09:00:00.000Z'
  },
  // 4. Seed Observation 4: 01MM -> Z01B
  {
    id: '5eed0000-0000-4000-8000-000000000004',
    user_id: null,
    voiced_location: '01MM',
    found_location: 'Z01B',
    raw_voiced_location: '01MM',
    raw_found_location: 'Z01B',
    voiced_location_norm: '01MM',
    found_location_norm: 'Z01B',
    heard_location: '01MM',
    actual_location: 'Z01B',
    heard_location_norm: '01MM',
    actual_location_norm: 'Z01B',
    reason: 'other',
    details: 'Headset phrased Bulk location Z01B as "ZERO ONE BULK BRAVO", which worker mistook for standard aisle 01MM ("ZERO ONE MIKE MIKE").',
    status: 'community_submitted',
    provenance: 'seed_observation',
    confirmations_count: 1,
    flag_count: 0,
    created_at: '2026-10-18T09:30:00.000Z',
    updated_at: '2026-10-18T09:30:00.000Z'
  },
  // Legacy sample reports for backwards compatibility
  {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: '00000000-0000-4000-a000-000000000001',
    voiced_location: 'J7AZ',
    found_location: '07AZ',
    raw_voiced_location: 'J7AZ',
    raw_found_location: '07AZ',
    voiced_location_norm: 'J7AZ',
    found_location_norm: '07AZ',
    heard_location: 'J7AZ',
    actual_location: '07AZ',
    heard_location_norm: 'J7AZ',
    actual_location_norm: '07AZ',
    reason: 'similar_sounding',
    details: 'Voice headset recognized "JEWELLERY SEVEN ALPHA ZULU" instead of "ZERO SEVEN ALPHA ZULU".',
    status: 'approved',
    provenance: 'moderator_confirmed',
    confirmations_count: 4,
    flag_count: 0,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    user_id: '00000000-0000-4000-a000-000000000002',
    voiced_location: 'S1PG',
    found_location: '01PG',
    raw_voiced_location: 'S1PG',
    raw_found_location: '01PG',
    voiced_location_norm: 'S1PG',
    found_location_norm: '01PG',
    heard_location: 'S1PG',
    actual_location: '01PG',
    heard_location_norm: 'S1PG',
    actual_location_norm: '01PG',
    reason: 'headset_misrecognition',
    details: 'Spoken "SECURITY" was confused with "ZERO" in loud aisle background noise.',
    status: 'approved',
    provenance: 'moderator_confirmed',
    confirmations_count: 2,
    flag_count: 0,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    user_id: '00000000-0000-4000-a000-000000000003',
    voiced_location: '10AK',
    found_location: '10KA',
    raw_voiced_location: '10AK',
    raw_found_location: '10KA',
    voiced_location_norm: '10AK',
    found_location_norm: '10KA',
    heard_location: '10AK',
    actual_location: '10KA',
    heard_location_norm: '10AK',
    actual_location_norm: '10KA',
    reason: 'similar_check_character',
    details: 'Adjacent character swap produces the same check character in standard formula.',
    status: 'approved',
    provenance: 'moderator_confirmed',
    confirmations_count: 5,
    flag_count: 0,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 6).toISOString()
  }
];

export const SEED_OBSERVATIONS = SEED_REFERENCE_OBSERVATIONS;

// In-memory store for fallback/test mode
let localReportsStore: VoiceConfusionReport[] = [...SEED_REFERENCE_OBSERVATIONS];
let localAuthUser: AuthUser | null = null;
const localRateLimitMap = new Map<string, number[]>();
const localUserConfirmationsMap = new Map<string, Set<string>>(); // clientHash -> Set of report IDs confirmed
const localUserFlagsMap = new Map<string, Set<string>>(); // clientHash -> Set of report IDs flagged

// Protected mock user roles map (server-authoritative; browser cannot directly mutate this)
const protectedServerRolesMap = new Map<string, UserRole>([
  ['moderator@stockroom.test', 'moderator'],
  ['admin@stockroom.test', 'admin']
]);

/**
 * Resets local test store (used for test teardown).
 */
export function resetTestStore(): void {
  localReportsStore = [...SEED_REFERENCE_OBSERVATIONS];
  localAuthUser = null;
  localRateLimitMap.clear();
  localUserConfirmationsMap.clear();
  localUserFlagsMap.clear();
}

/**
 * Overrides the current user in test environments.
 */
export function setTestCurrentUser(user: AuthUser | null): void {
  localAuthUser = user;
}

/**
 * Generates a mock or browser client fingerprint for basic rate limiting.
 */
export function getClientHash(): string {
  try {
    const raw = `${navigator.userAgent || 'unknown'}::${window.screen?.width || 0}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `cl_${Math.abs(hash).toString(16)}`;
  } catch {
    return 'cl_default';
  }
}

// ============================================================================
// Authentication & Server-Side Roles
// ============================================================================

/**
 * Resolves a user's verified role from the server-protected user_roles table
 * or auth metadata. Never trusts a client-supplied role claim.
 */
async function resolveServerVerifiedRole(userId: string, appMetadataRole?: string): Promise<UserRole> {
  if (appMetadataRole === 'admin') return 'admin';
  if (appMetadataRole === 'moderator') return 'moderator';

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: roleRow, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && roleRow && (roleRow.role === 'admin' || roleRow.role === 'moderator')) {
        return roleRow.role as UserRole;
      }

      const { data: modRow } = await supabase
        .from('moderators')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (modRow) return 'moderator';
    } catch (err) {
      console.warn('Failed to query user_roles table:', err);
    }
  }

  return 'user';
}

/**
 * Returns the currently signed-in user with server-verified role, or null if unauthenticated.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return null;

      const user = session.user;
      const role = await resolveServerVerifiedRole(user.id, user.app_metadata?.role);

      return {
        id: user.id,
        email: user.email || '',
        role,
        isModerator: role === 'moderator' || role === 'admin',
        isAdmin: role === 'admin'
      };
    } catch (err) {
      console.warn('Error reading session:', err);
      return null;
    }
  }

  return localAuthUser;
}

export const DEFAULT_AUTH_REDIRECT_URL = 'https://chandrakiran.dev/checkcharacter/';

/**
 * Resolves an explicit, safe redirect URL for Supabase magic-link authentication.
 */
export function getAuthRedirectUrl(redirectTo?: string): string {
  if (redirectTo) {
    return redirectTo;
  }

  if (typeof window !== 'undefined' && window.location) {
    const { origin, hostname } = window.location;

    if (hostname.endsWith('pages.dev') || hostname.endsWith('workers.dev')) {
      return origin;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return origin;
    }
  }

  return DEFAULT_AUTH_REDIRECT_URL;
}

/**
 * Signs in using Supabase email magic-link.
 */
export async function signInWithMagicLink(
  email: string,
  redirectTo?: string
): Promise<MagicLinkResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      error: 'Please enter a valid email address.'
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const targetRedirect = getAuthRedirectUrl(redirectTo);
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: targetRedirect
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        message: `Magic link sent to ${cleanEmail}. Please check your inbox to sign in.`
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to send magic link.'
      };
    }
  }

  // Offline / Demo fallback
  const role = protectedServerRolesMap.get(cleanEmail) || 'user';
  localAuthUser = {
    id: `local-usr-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
    email: cleanEmail,
    role,
    isModerator: role === 'moderator' || role === 'admin',
    isAdmin: role === 'admin'
  };

  return {
    success: true,
    message: `Signed in as ${cleanEmail} (${role.toUpperCase()} role active in demo mode).`
  };
}

/**
 * Signs the user out and clears session state.
 */
export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  localAuthUser = null;
}

/**
 * Listens to authentication state changes.
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): () => void {
  if (isSupabaseConfigured && supabase) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        callback(null);
        return;
      }
      const user = session.user;
      const role = await resolveServerVerifiedRole(user.id, user.app_metadata?.role);
      callback({
        id: user.id,
        email: user.email || '',
        role,
        isModerator: role === 'moderator' || role === 'admin',
        isAdmin: role === 'admin'
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  callback(localAuthUser);
  return () => {};
}

// ============================================================================
// Report Submission: Legacy & Community Reference APIs
// ============================================================================

/**
 * Legacy submission handler (preserved for existing test suite and admin workflow).
 * Submissions default to 'pending' review status and duplicate reports return is_duplicate: true with an error.
 */
export async function submitVoiceConfusionReport(
  payload: ReportSubmissionPayload
): Promise<SubmissionResponse> {
  const currentUser = await getCurrentUser();

  const validation = validateReportSubmission(payload);
  if (!validation.isValid || !validation.cleanedPayload) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid submission data.';
    return {
      success: false,
      error: firstError
    };
  }

  const cleanHeard = validation.cleanedPayload.heard_location || validation.cleanedPayload.voiced_location || '';
  const cleanActual = validation.cleanedPayload.actual_location || validation.cleanedPayload.found_location || '';
  const cleanReason: VoiceConfusionReason = validation.cleanedPayload.reason || 'similar_sounding';
  const cleanDetails = validation.cleanedPayload.details;
  const clientHash = payload.client_hash || getClientHash();
  const rateLimitKey = currentUser ? currentUser.id : clientHash;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('submit_voice_confusion_report', {
        p_heard_location: cleanHeard,
        p_actual_location: cleanActual,
        p_reason: cleanReason,
        p_details: cleanDetails ?? null,
        p_client_hash: clientHash
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Database submission failed.'
        };
      }

      if (data) {
        const res = data as Record<string, unknown>;
        return {
          success: Boolean(res.success),
          is_duplicate: Boolean(res.is_duplicate),
          error: typeof res.error === 'string' ? res.error : undefined,
          message: typeof res.message === 'string' ? res.message : undefined,
          report: res.id
            ? {
                id: String(res.id),
                user_id: currentUser ? currentUser.id : null,
                voiced_location: cleanHeard,
                found_location: cleanActual,
                heard_location: cleanHeard,
                actual_location: cleanActual,
                reason: cleanReason,
                details: cleanDetails ?? null,
                status: 'pending',
                provenance: 'community_submitted',
                confirmations_count: 1,
                flag_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            : undefined
        };
      }

      return {
        success: false,
        error: 'Database returned an empty response.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Database submission failed.'
      };
    }
  }

  // Local fallback (Only when Supabase is not configured / offline development)
  const now = Date.now();
  const timestamps = (localRateLimitMap.get(rateLimitKey) || []).filter(t => now - t < 10 * 60 * 1000);
  if (timestamps.length >= 5) {
    return {
      success: false,
      error: 'Submission limit reached. Please wait a few minutes before submitting another report.'
    };
  }
  timestamps.push(now);
  localRateLimitMap.set(rateLimitKey, timestamps);

  const existingReport = localReportsStore.find(
    r =>
      getReportCompositeKey(r.heard_location || r.voiced_location || '', r.actual_location || r.found_location || '', r.reason) ===
      getReportCompositeKey(cleanHeard, cleanActual, cleanReason)
  );

  if (existingReport) {
    return {
      success: false,
      is_duplicate: true,
      error: `A report for this heard location, actual location, and reason has already been submitted and is currently ${existingReport.status}.`
    };
  }

  const newReport: VoiceConfusionReport = {
    id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    user_id: currentUser ? currentUser.id : null,
    voiced_location: cleanHeard,
    found_location: cleanActual,
    raw_voiced_location: cleanHeard,
    raw_found_location: cleanActual,
    voiced_location_norm: cleanHeard,
    found_location_norm: cleanActual,
    heard_location: cleanHeard,
    actual_location: cleanActual,
    heard_location_norm: cleanHeard,
    actual_location_norm: cleanActual,
    reason: cleanReason,
    details: cleanDetails ?? null,
    status: 'pending',
    provenance: 'community_submitted',
    confirmations_count: 1,
    flag_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localReportsStore.unshift(newReport);

  return {
    success: true,
    message: '[Local Development] Report submitted successfully. Your report is currently pending admin review.',
    report: newReport
  };
}

/**
 * Community Reference API: Shares a location correction (Voiced location -> Found location).
 * 
 * Guarantees:
 * - Publicly accessible without requiring login.
 * - Newly submitted reports are immediately retrievable by all visitors.
 * - Duplicate detection: if the pair already exists, it corroborates the record
 *   by incrementing its independent confirmation count instead of creating duplicates.
 * - Rate limiting: max 5 submissions per 10 minutes per client hash.
 */
export async function submitLocationCorrection(
  payload: LocationCorrectionPayload,
  clientHashOverride?: string
): Promise<SubmissionResponse> {
  if (payload.honeypot && payload.honeypot.trim()) {
    return {
      success: false,
      error: 'Spam detection triggered. Bot submission rejected.'
    };
  }

  const currentUser = await getCurrentUser();

  const validation = validateReportSubmission({
    voiced_location: payload.voiced_location,
    found_location: payload.found_location,
    reason: payload.reason || 'similar_sounding',
    details: payload.details,
    client_hash: clientHashOverride || payload.client_hash,
    honeypot: payload.honeypot
  });

  if (!validation.isValid || !validation.cleanedPayload) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid submission data.';
    return {
      success: false,
      error: firstError
    };
  }

  const cleanVoiced = normaliseLocationCode(validation.cleanedPayload.voiced_location || validation.cleanedPayload.heard_location || '');
  const cleanFound = normaliseLocationCode(validation.cleanedPayload.found_location || validation.cleanedPayload.actual_location || '');
  const reason = validation.cleanedPayload.reason || 'similar_sounding';
  const details = validation.cleanedPayload.details;
  const rawVoiced = payload.voiced_location;
  const rawFound = payload.found_location;
  const clientHash = clientHashOverride || payload.client_hash || getClientHash();
  const rateLimitKey = currentUser ? currentUser.id : clientHash;

  // Supabase PostgreSQL Execution
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('submit_voice_confusion_reference', {
        p_voiced_location: cleanVoiced,
        p_found_location: cleanFound,
        p_raw_voiced: rawVoiced,
        p_raw_found: rawFound,
        p_reason: reason,
        p_details: details ?? null,
        p_client_hash: clientHash
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Database submission failed. The report could not be saved to the database.'
        };
      }

      if (data) {
        const res = data as Record<string, unknown>;
        if (res.success === false) {
          return {
            success: false,
            is_duplicate: Boolean(res.is_duplicate),
            error: typeof res.error === 'string' ? res.error : 'Submission was rejected by database verification.'
          };
        }

        return {
          success: true,
          is_duplicate: Boolean(res.is_duplicate),
          is_corroboration: Boolean(res.is_duplicate),
          is_new_confirmation: res.is_new_confirmation !== undefined ? Boolean(res.is_new_confirmation) : undefined,
          message: typeof res.message === 'string' ? res.message : 'Location correction shared successfully!',
          report: res.id ? (res as unknown as VoiceConfusionReport) : undefined
        };
      }

      return {
        success: false,
        error: 'Database returned an empty response. Report could not be saved.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Database submission failed unexpectedly.'
      };
    }
  }

  // --- Local In-Memory Fallback Mode (Only when Supabase is not configured / Offline development) ---
  const now = Date.now();
  const timestamps = (localRateLimitMap.get(rateLimitKey) || []).filter(t => now - t < 10 * 60 * 1000);
  if (timestamps.length >= 5) {
    return {
      success: false,
      error: 'Submission limit reached. Please wait a few minutes before sharing another correction.'
    };
  }
  timestamps.push(now);
  localRateLimitMap.set(rateLimitKey, timestamps);

  // Duplicate detection & Corroboration in local memory
  const existingReport = localReportsStore.find(
    r =>
      (r.voiced_location_norm === cleanVoiced && r.found_location_norm === cleanFound) ||
      (r.heard_location_norm === cleanVoiced && r.actual_location_norm === cleanFound) ||
      (normaliseLocationCode(r.voiced_location || r.heard_location || '') === cleanVoiced &&
        normaliseLocationCode(r.found_location || r.actual_location || '') === cleanFound)
  );

  if (existingReport) {
    const cleanClientHash = (clientHash || '').trim();
    const userConfirmations = localUserConfirmationsMap.get(cleanClientHash) || new Set<string>();
    const isNewClient = cleanClientHash.length >= 8 && !userConfirmations.has(existingReport.id);

    if (isNewClient) {
      userConfirmations.add(existingReport.id);
      localUserConfirmationsMap.set(cleanClientHash, userConfirmations);
      existingReport.confirmations_count = (existingReport.confirmations_count || 1) + 1;
      existingReport.updated_at = new Date().toISOString();

      return {
        success: true,
        is_duplicate: true,
        is_corroboration: true,
        is_new_confirmation: true,
        message: `[Local Development] Existing observation found for ${cleanVoiced} -> ${cleanFound}. Corroboration recorded (+1 confirmation, now ${existingReport.confirmations_count}).`,
        report: existingReport
      };
    } else {
      return {
        success: true,
        is_duplicate: true,
        is_corroboration: false,
        is_new_confirmation: false,
        message: cleanClientHash.length >= 8
          ? `[Local Development] Existing observation found for ${cleanVoiced} -> ${cleanFound}. You have already confirmed this location correction in this session.`
          : `[Local Development] Existing observation found for ${cleanVoiced} -> ${cleanFound}. Already recorded in community database.`,
        report: existingReport
      };
    }
  }

  // Insert new report in local memory
  const newReport: VoiceConfusionReport = {
    id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    user_id: currentUser ? currentUser.id : null,
    voiced_location: cleanVoiced,
    found_location: cleanFound,
    raw_voiced_location: rawVoiced,
    raw_found_location: rawFound,
    voiced_location_norm: cleanVoiced,
    found_location_norm: cleanFound,
    heard_location: cleanVoiced,
    actual_location: cleanFound,
    heard_location_norm: cleanVoiced,
    actual_location_norm: cleanFound,
    reason,
    details: details ?? null,
    status: 'community_submitted',
    provenance: 'community_submitted',
    confirmations_count: 1,
    flag_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localReportsStore.unshift(newReport);

  const cleanClientHash = (clientHash || '').trim();
  if (cleanClientHash.length >= 8) {
    const userConfirmations = localUserConfirmationsMap.get(cleanClientHash) || new Set<string>();
    userConfirmations.add(newReport.id);
    localUserConfirmationsMap.set(cleanClientHash, userConfirmations);
  }

  return {
    success: true,
    message: '[Local Development] Location correction saved to local session memory (Supabase is not configured).',
    report: newReport
  };
}

/**
 * Corroborates an existing report (+1 confirmation).
 */
export async function confirmReport(
  reportId: string,
  clientHash: string = getClientHash()
): Promise<ConfirmReportResponse> {
  const cleanClientHash = (clientHash || '').trim();
  if (cleanClientHash.length < 8) {
    return {
      success: false,
      error: 'A valid client identifier is required to confirm an observation.'
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('confirm_voice_confusion_observation', {
        p_report_id: reportId,
        p_client_hash: clientHash
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Database confirmation failed.'
        };
      }

      if (data) {
        const res = data as Record<string, unknown>;
        if (res.success === false) {
          return {
            success: false,
            error: typeof res.error === 'string' ? res.error : 'Confirmation rejected by server.'
          };
        }
        const count = Number(res.new_count);
        return {
          success: true,
          newConfirmationsCount: count,
          new_confirmations_count: count,
          message: String(res.message || 'Observation confirmed (+1).')
        };
      }

      return {
        success: false,
        error: 'Database returned an empty response.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Database confirmation failed unexpectedly.'
      };
    }
  }

  // Local fallback (Only when Supabase is not configured)
  const userConfirmations = localUserConfirmationsMap.get(clientHash) || new Set<string>();
  if (userConfirmations.has(reportId)) {
    return {
      success: false,
      error: 'You have already confirmed this observation in this session.'
    };
  }

  const report = localReportsStore.find(r => r.id === reportId);
  if (!report) {
    return { success: false, error: 'Report not found.' };
  }

  report.confirmations_count = (report.confirmations_count || 1) + 1;
  report.updated_at = new Date().toISOString();

  userConfirmations.add(reportId);
  localUserConfirmationsMap.set(clientHash, userConfirmations);

  return {
    success: true,
    newConfirmationsCount: report.confirmations_count,
    new_confirmations_count: report.confirmations_count,
    message: `[Local Development] Observation corroborated (+1 confirmation, now ${report.confirmations_count}).`
  };
}

/**
 * Flags an incorrect or abusive report for review.
 */
export async function flagReport(
  reportId: string,
  reason?: string,
  clientHash: string = getClientHash()
): Promise<FlagReportResponse> {
  const cleanClientHash = (clientHash || '').trim();
  if (cleanClientHash.length < 8) {
    return {
      success: false,
      error: 'A valid client identifier is required to flag a report.'
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('flag_voice_confusion_observation', {
        p_report_id: reportId,
        p_reason: reason ?? null,
        p_client_hash: clientHash
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Database flagging failed.'
        };
      }

      if (data) {
        const res = data as Record<string, unknown>;
        if (res.success === false) {
          return {
            success: false,
            error: typeof res.error === 'string' ? res.error : 'Flagging rejected by server.'
          };
        }
        const count = Number(res.flag_count);
        return {
          success: true,
          newFlagCount: count,
          new_flag_count: count,
          isFlagged: Boolean(res.is_flagged),
          is_flagged: Boolean(res.is_flagged),
          message: String(res.message || 'Report flagged for review.')
        };
      }

      return {
        success: false,
        error: 'Database returned an empty response.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Database flagging failed unexpectedly.'
      };
    }
  }

  // Local fallback (Only when Supabase is not configured)
  const userFlags = localUserFlagsMap.get(clientHash) || new Set<string>();
  if (userFlags.has(reportId)) {
    return {
      success: false,
      error: 'You have already flagged this report.'
    };
  }

  const report = localReportsStore.find(r => r.id === reportId);
  if (!report) {
    return { success: false, error: 'Report not found.' };
  }

  report.flag_count = (report.flag_count || 0) + 1;
  report.updated_at = new Date().toISOString();

  let isFlagged = false;
  if (report.flag_count >= 3) {
    report.status = 'flagged';
    isFlagged = true;
  }

  userFlags.add(reportId);
  localUserFlagsMap.set(clientHash, userFlags);

  return {
    success: true,
    newFlagCount: report.flag_count,
    new_flag_count: report.flag_count,
    isFlagged,
    is_flagged: isFlagged,
    message: isFlagged
      ? '[Local Development] Report received multiple flags and has been marked for review.'
      : '[Local Development] Thank you for your feedback. Report flagged for review.'
  };
}

// ============================================================================
// Public Search & Shared Reference Retrieval
// ============================================================================

/**
 * Searches community reports accessible to all visitors.
 * Dual-location search matches either voiced location or found location.
 * Omits flagged or rejected reports.
 */
export async function searchCommunityReports(
  params: SearchReportsParams
): Promise<SearchReportsResult> {
  const query = normaliseLocationCode(params.query || '');
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 10);
  const offset = (page - 1) * pageSize;

  if (isSupabaseConfigured && supabase) {
    try {
      let req = supabase
        .from('voice_confusion_reports')
        .select('*', { count: 'exact' })
        .in('status', ['community_submitted', 'confirmed', 'approved']);

      if (query) {
        const cleanSearch = query.replace(/[(),]/g, ' ').trim();
        if (cleanSearch) {
          req = req.or(
            `voiced_location.ilike.%${cleanSearch}%,found_location.ilike.%${cleanSearch}%,heard_location.ilike.%${cleanSearch}%,actual_location.ilike.%${cleanSearch}%,details.ilike.%${cleanSearch}%`
          );
        }
      }

      req = req
        .order('confirmations_count', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      const { data, count, error } = await req;

      if (error) {
        console.error('Supabase searchCommunityReports error:', error);
        return {
          reports: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 1,
          error: error.message || 'Database search failed.'
        };
      }

      const total = count || 0;
      return {
        reports: (data as VoiceConfusionReport[]) || [],
        totalCount: total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1
      };
    } catch (err: any) {
      console.error('Supabase searchCommunityReports failed:', err);
      return {
        reports: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
        error: err?.message || 'Database search failed.'
      };
    }
  }

  // Local fallback: includes all non-flagged, non-rejected, non-pending reports
  let filtered = localReportsStore.filter(
    r => r.status !== 'flagged' && r.status !== 'rejected' && r.status !== 'pending'
  );

  if (query) {
    filtered = filtered.filter(r => {
      const v = (r.voiced_location || r.heard_location || '').toUpperCase();
      const f = (r.found_location || r.actual_location || '').toUpperCase();
      const d = (r.details || '').toUpperCase();
      return v.includes(query) || f.includes(query) || d.includes(query);
    });
  }

  filtered.sort((a, b) => {
    const confDiff = (b.confirmations_count || 0) - (a.confirmations_count || 0);
    if (confDiff !== 0) return confDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + pageSize);

  return {
    reports: paged,
    totalCount: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1
  };
}

/**
 * Backwards compatibility: searches approved voice confusion reports only.
 */
export async function searchApprovedReports(
  params: SearchReportsParams
): Promise<SearchReportsResult> {
  const query = normaliseLocationCode(params.query || '');
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, params.pageSize || 10);
  const offset = (page - 1) * pageSize;

  if (isSupabaseConfigured && supabase) {
    try {
      let req = supabase
        .from('voice_confusion_reports')
        .select('*', { count: 'exact' })
        .eq('status', 'approved');

      if (query) {
        const cleanSearch = query.replace(/[(),]/g, ' ').trim();
        if (cleanSearch) {
          req = req.or(
            `heard_location.ilike.%${cleanSearch}%,actual_location.ilike.%${cleanSearch}%,heard_location_norm.eq.${cleanSearch},actual_location_norm.eq.${cleanSearch}`
          );
        }
      }

      req = req.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
      const { data, count, error } = await req;

      if (error) {
        console.error('Supabase searchApprovedReports error:', error);
        return {
          reports: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 1,
          error: error.message || 'Database search failed.'
        };
      }

      const total = count || 0;
      return {
        reports: (data as VoiceConfusionReport[]) || [],
        totalCount: total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1
      };
    } catch (err: any) {
      console.error('Supabase searchApprovedReports failed:', err);
      return {
        reports: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
        error: err?.message || 'Database search failed.'
      };
    }
  }

  // Local fallback for approved reports
  let filtered = localReportsStore.filter(r => r.status === 'approved');
  if (query) {
    filtered = filtered.filter(
      r =>
        (r.heard_location || r.voiced_location || '').includes(query) ||
        (r.actual_location || r.found_location || '').includes(query)
    );
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + pageSize);

  return {
    reports: paged,
    totalCount: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1
  };
}

/**
 * Returns all active community reports to feed the candidate ranking engine.
 */
export async function getAllActiveReports(): Promise<VoiceConfusionReport[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('voice_confusion_reports')
        .select('*')
        .in('status', ['community_submitted', 'confirmed', 'approved'])
        .order('confirmations_count', { ascending: false });

      if (error) {
        console.error('getAllActiveReports query failed:', error);
        return [];
      }

      return (data as VoiceConfusionReport[]) || [];
    } catch (err) {
      console.error('getAllActiveReports query exception:', err);
      return [];
    }
  }

  return localReportsStore.filter(
    r => r.status !== 'flagged' && r.status !== 'rejected' && r.status !== 'pending'
  );
}

/**
 * Fetches user-submitted reports for "My Submissions" tab.
 */
export async function fetchUserReports(): Promise<VoiceConfusionReport[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return [];
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('voice_confusion_reports')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as VoiceConfusionReport[];
      }
    } catch (err) {
      console.warn('Failed to fetch user reports from Supabase:', err);
    }
  }

  return localReportsStore.filter(r => r.user_id === currentUser.id);
}

// ============================================================================
// Moderator Workflow
// ============================================================================

export async function fetchModerationQueue(
  statusFilter: VoiceConfusionStatus = 'pending'
): Promise<VoiceConfusionReport[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.isModerator) {
    throw new Error('Unauthorized: only verified administrators and moderators can view moderation queues.');
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('voice_confusion_reports')
        .select('*')
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data as VoiceConfusionReport[]) || [];
    } catch (err: any) {
      throw new Error(err.message || 'Failed to fetch moderation queue from Supabase.');
    }
  }

  return localReportsStore.filter(r => r.status === statusFilter);
}

export async function updateReportStatus(
  reportId: string,
  newStatus: VoiceConfusionStatus,
  moderatorNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.isModerator) {
    return {
      success: false,
      error: 'Unauthorized: only administrators and moderators can update report statuses.'
    };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('voice_confusion_reports')
        .update({
          status: newStatus,
          moderator_notes: moderatorNotes || null,
          reviewed_by: currentUser.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Database update failed.' };
    }
  }

  const report = localReportsStore.find(r => r.id === reportId);
  if (!report) return { success: false, error: 'Report not found in local store.' };

  report.status = newStatus;
  report.moderator_notes = moderatorNotes || null;
  report.updated_at = new Date().toISOString();

  return { success: true };
}

export const updateReportModerationStatus = updateReportStatus;
