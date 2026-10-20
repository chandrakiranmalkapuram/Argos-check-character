/**
 * TypeScript types and domain definitions for Voice Confusion Reference.
 * Supports community-shared location corrections, independent confirmations,
 * provenance tracking, and candidate ranking.
 */

export type VoiceConfusionReason =
  | 'similar_sounding'
  | 'headset_misrecognition'
  | 'similar_check_character'
  | 'other';

export type ReportProvenance =
  | 'community_submitted'
  | 'seed_observation'
  | 'moderator_confirmed';

export type VoiceConfusionStatus =
  | 'community_submitted'
  | 'confirmed'
  | 'flagged'
  | 'archived'
  | 'approved'
  | 'rejected'
  | 'pending';

export interface ReasonOption {
  value: VoiceConfusionReason;
  label: string;
  description: string;
}

export const VOICE_CONFUSION_REASONS: readonly ReasonOption[] = [
  {
    value: 'similar_sounding',
    label: 'Similar-sounding characters',
    description: 'Phonetic confusion between spoken characters (e.g. "J" vs "0", "08" vs "20", "B" vs "D").'
  },
  {
    value: 'headset_misrecognition',
    label: 'Headset misrecognition',
    description: 'The automated voice recognition engine misheard ambient warehouse noise.'
  },
  {
    value: 'similar_check_character',
    label: 'Similar check-character result',
    description: 'Both locations produce identical or easily confusable check characters.'
  },
  {
    value: 'other',
    label: 'Other physical / zone layout',
    description: 'Bulk, Linbin or other operational warehouse confusion.'
  }
] as const;

export interface VoiceConfusionReport {
  id: string;
  user_id?: string | null;

  // Primary terminology (Voice Confusion Reference)
  voiced_location: string;
  found_location: string;

  // Stored normalized values
  voiced_location_norm?: string;
  found_location_norm?: string;

  // Raw original submitted values for audit trail
  raw_voiced_location?: string;
  raw_found_location?: string;

  // Backward compatibility aliases for existing views/tests
  heard_location?: string;
  actual_location?: string;
  heard_location_norm?: string;
  actual_location_norm?: string;

  reason: VoiceConfusionReason;
  details?: string | null;

  status: VoiceConfusionStatus;
  provenance: ReportProvenance;

  confirmations_count: number;
  flag_count: number;

  created_at: string;
  updated_at: string;
  moderator_notes?: string | null;
}

export type UserRole = 'admin' | 'moderator' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isModerator: boolean;
  isAdmin: boolean;
}

export interface MagicLinkResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface LocationCorrectionPayload {
  voiced_location: string;
  found_location: string;
  reason?: VoiceConfusionReason;
  details?: string;
  client_hash?: string;
  honeypot?: string;
}

export interface ReportSubmissionPayload {
  voiced_location?: string;
  found_location?: string;
  heard_location?: string;
  actual_location?: string;
  reason?: VoiceConfusionReason;
  details?: string;
  client_hash?: string;
  honeypot?: string;
}

export interface SubmissionResponse {
  success: boolean;
  is_duplicate?: boolean;
  is_corroboration?: boolean;
  is_new_confirmation?: boolean;
  error?: string;
  report?: VoiceConfusionReport;
  message?: string;
}

export interface ConfirmReportResponse {
  success: boolean;
  newConfirmationsCount?: number;
  new_confirmations_count?: number;
  message?: string;
  error?: string;
}

export interface FlagReportResponse {
  success: boolean;
  newFlagCount?: number;
  new_flag_count?: number;
  isFlagged?: boolean;
  is_flagged?: boolean;
  message?: string;
  error?: string;
}

export interface SearchReportsParams {
  query: string;
  status?: VoiceConfusionStatus;
  provenance?: ReportProvenance;
  page?: number;
  pageSize?: number;
}

export interface SearchReportsResult {
  reports: VoiceConfusionReport[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

