/**
 * Database access, authentication, and service layer for Voice Confusion Risk reporting.
 * Handles:
 * - Supabase Auth with email magic-link authentication (and offline/demo simulation)
 * - Server-verified user roles (admin, moderator, user) from protected database tables
 * - Authenticated submissions linked to user_id
 * - "My Reports" view for signed-in users showing their own submissions & moderation statuses
 * - Case-insensitive dual-location search (public visitors only see approved reports)
 * - Server-side & database-level duplicate detection
 * - Protected moderation workflow restricted to verified administrators and moderators
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.ts';
import { normaliseLocationCode, getReportCompositeKey } from './normalizer.ts';
import { validateReportSubmission } from './validation.ts';
import type {
  VoiceConfusionReport,
  VoiceConfusionStatus,
  ReportSubmissionPayload,
  SubmissionResponse,
  SearchReportsParams,
  SearchReportsResult,
  AuthUser,
  UserRole,
  MagicLinkResponse
} from './types.ts';

/**
 * Initial sample seed reports for offline development and initial state.
 * Includes the prompt's canonical example: Heard J7AZ vs Actual 07AZ.
 */
const INITIAL_APPROVED_REPORTS: VoiceConfusionReport[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: '00000000-0000-4000-a000-000000000001',
    heard_location: 'J7AZ',
    actual_location: '07AZ',
    reason: 'similar_sounding',
    details: 'Voice headset recognized "JEWELLERY SEVEN ALPHA ZULU" instead of "ZERO SEVEN ALPHA ZULU".',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    user_id: '00000000-0000-4000-a000-000000000002',
    heard_location: 'S1PG',
    actual_location: '01PG',
    reason: 'headset_misrecognition',
    details: 'Spoken "SECURITY" was confused with "ZERO" in loud aisle background noise.',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    user_id: '00000000-0000-4000-a000-000000000003',
    heard_location: '10AK',
    actual_location: '10KA',
    reason: 'similar_check_character',
    details: 'Adjacent character swap produces the same check character in standard formula.',
    status: 'approved',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 6).toISOString()
  }
];

// In-memory store for fallback/test mode
let localReportsStore: VoiceConfusionReport[] = [...INITIAL_APPROVED_REPORTS];
let localAuthUser: AuthUser | null = null;
const localRateLimitMap = new Map<string, number[]>();

// Protected mock user roles map (server-authoritative; browser cannot directly mutate this)
const protectedServerRolesMap = new Map<string, UserRole>([
  ['moderator@stockroom.test', 'moderator'],
  ['admin@stockroom.test', 'admin']
]);

/**
 * Resets local test store (used for test teardown).
 */
export function resetTestStore(): void {
  localReportsStore = [...INITIAL_APPROVED_REPORTS];
  localAuthUser = null;
  localRateLimitMap.clear();
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

      // Check legacy moderators table fallback
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
 * Handles session expiration gracefully.
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

/**
 * Signs in using Supabase email magic-link.
 * In production: dispatches an OTP magic link to the user's inbox with emailRedirectTo.
 * In local/demo mode: simulates immediate magic link completion for frictionless testing.
 */
export async function signInWithMagicLink(
  email: string,
  redirectTo?: string
): Promise<MagicLinkResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const targetRedirect = redirectTo || window.location.origin;
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
        message: `Magic link dispatched to ${cleanEmail}. Click the link in your email to sign in.`
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to send magic link.' };
    }
  }

  // --- Local / Offline Simulation Mode ---
  const role: UserRole = protectedServerRolesMap.get(cleanEmail) || 'user';
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
 * Listens to authentication state changes (session established, refreshed, or expired).
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

  // Local mode: immediate callback
  callback(localAuthUser);
  return () => {};
}

// ============================================================================
// Report Submission & Ownership
// ============================================================================

/**
 * Submits a new voice confusion report.
 * Public visitors can submit reports without creating an account or logging in.
 * All submissions automatically receive a 'pending' status and require administrator review.
 */
export async function submitVoiceConfusionReport(
  payload: ReportSubmissionPayload
): Promise<SubmissionResponse> {
  const currentUser = await getCurrentUser();

  // Validate input format
  const validation = validateReportSubmission(payload);
  if (!validation.isValid || !validation.cleanedPayload) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid submission data.';
    return {
      success: false,
      error: firstError
    };
  }

  const { heard_location, actual_location, reason, details } = validation.cleanedPayload;
  const clientHash = payload.client_hash || getClientHash();
  const rateLimitKey = currentUser ? currentUser.id : clientHash;

  // If Supabase is configured, use the PostgreSQL RPC function
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('submit_voice_confusion_report', {
        p_heard_location: heard_location,
        p_actual_location: actual_location,
        p_reason: reason,
        p_details: details ?? null,
        p_client_hash: clientHash
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to submit report. Please try again.'
        };
      }

      if (data && typeof data === 'object') {
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
                heard_location: String(res.heard_location),
                actual_location: String(res.actual_location),
                reason: res.reason as any,
                details: details ?? null,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            : undefined
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error while contacting the report service.'
      };
    }
  }

  // --- Local / Offline Fallback Mode ---
  // Rate limiting (max 5 per 10 minutes per user or client fingerprint)
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

  // Duplicate detection
  const existingReport = localReportsStore.find(
    r =>
      getReportCompositeKey(r.heard_location, r.actual_location, r.reason) ===
      getReportCompositeKey(heard_location, actual_location, reason)
  );

  if (existingReport) {
    return {
      success: false,
      is_duplicate: true,
      error: `A report for this heard location, actual location, and reason has already been submitted and is currently ${existingReport.status}.`
    };
  }

  // Insert report with default 'pending' status (user_id is assigned if authenticated)
  const newReport: VoiceConfusionReport = {
    id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    user_id: currentUser ? currentUser.id : null,
    heard_location,
    actual_location,
    reason,
    details: details ?? null,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localReportsStore.unshift(newReport);

  return {
    success: true,
    message: 'Report submitted successfully. Your report is currently pending admin review and will appear in public search results once approved.',
    report: newReport
  };
}

/**
 * Fetches the signed-in user's own submitted reports with their moderation statuses.
 * Protected: requires an active user session.
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

      if (error) throw new Error(error.message);
      return (data as VoiceConfusionReport[]) || [];
    } catch (err) {
      console.warn('Failed to fetch user reports from Supabase:', err);
      return [];
    }
  }

  // Local fallback
  return localReportsStore.filter(r => r.user_id === currentUser.id);
}

// ============================================================================
// Public Search (Approved Only)
// ============================================================================

/**
 * Searches approved voice confusion reports.
 * Public search accepts either the heard location or the actual location.
 * ONLY approved reports are returned to public/unauthenticated users.
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
        .select('id, user_id, heard_location, actual_location, reason, details, status, created_at, updated_at', {
          count: 'exact'
        })
        .eq('status', 'approved');

      if (query) {
        req = req.or(
          `heard_location.ilike.%${query}%,actual_location.ilike.%${query}%,heard_location_norm.eq.${query},actual_location_norm.eq.${query}`
        );
      }

      req = req.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

      const { data, count, error } = await req;

      if (error) {
        throw new Error(error.message);
      }

      const totalCount = count || 0;
      return {
        reports: (data as VoiceConfusionReport[]) || [],
        totalCount,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
      };
    } catch (err: any) {
      console.warn('Supabase search failed, falling back to local store:', err);
    }
  }

  // Local / Fallback Search:
  // Strictly filter status === 'approved'
  let matches = localReportsStore.filter(r => r.status === 'approved');

  if (query) {
    matches = matches.filter(r => {
      const heardNorm = normaliseLocationCode(r.heard_location);
      const actualNorm = normaliseLocationCode(r.actual_location);
      return heardNorm.includes(query) || actualNorm.includes(query);
    });
  }

  const totalCount = matches.length;
  const paginated = matches.slice(offset, offset + pageSize);

  return {
    reports: paginated,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
  };
}

// ============================================================================
// Protected Moderation Workflow
// ============================================================================

/**
 * Checks if the current user possesses moderator or administrator privileges.
 */
export async function checkModeratorSession(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user?.isModerator);
}

/**
 * Fetches reports for the moderation queue (includes pending, approved, rejected).
 * Protected: requires server-verified moderator or admin privileges.
 */
export async function fetchModerationQueue(
  statusFilter?: VoiceConfusionStatus
): Promise<VoiceConfusionReport[]> {
  const user = await getCurrentUser();
  if (!user || !user.isModerator) {
    throw new Error('Unauthorized: Administrator or moderator privileges required.');
  }

  if (isSupabaseConfigured && supabase) {
    let req = supabase
      .from('voice_confusion_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      req = req.eq('status', statusFilter);
    }

    const { data, error } = await req;
    if (error) throw new Error(error.message);
    return (data as VoiceConfusionReport[]) || [];
  }

  // Local mode
  if (statusFilter) {
    return localReportsStore.filter(r => r.status === statusFilter);
  }
  return [...localReportsStore];
}

/**
 * Updates a report's moderation status (approve or reject).
 * Protected: requires server-verified moderator or admin privileges.
 */
export async function updateReportModerationStatus(
  reportId: string,
  newStatus: VoiceConfusionStatus,
  moderatorNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !user.isModerator) {
    return { success: false, error: 'Unauthorized: Administrator or moderator privileges required.' };
  }

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('voice_confusion_reports')
      .update({
        status: newStatus,
        moderator_notes: moderatorNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  // Local mode
  const index = localReportsStore.findIndex(r => r.id === reportId);
  if (index === -1) {
    return { success: false, error: 'Report not found.' };
  }

  localReportsStore[index] = {
    ...localReportsStore[index],
    status: newStatus,
    moderator_notes: moderatorNotes || null,
    updated_at: new Date().toISOString()
  };

  return { success: true };
}
