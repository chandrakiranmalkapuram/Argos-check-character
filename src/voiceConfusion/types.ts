/**
 * TypeScript types and domain definitions for Voice Confusion Reference.
 * Supports community-shared location corrections, independent confirmations,
 * provenance tracking, and candidate ranking.
 */

import type {
  VoiceConfusionReason,
  ReportProvenance,
  VoiceConfusionStatus,
  VoiceConfusionReport
} from '../logic/voiceConfusion/types.ts';

export type {
  VoiceConfusionReason,
  ReportProvenance,
  VoiceConfusionStatus,
  VoiceConfusionReport
};

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

