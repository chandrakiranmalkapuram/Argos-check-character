/**
 * TypeScript types and domain definitions for Voice Confusion Risk reporting.
 */

export type VoiceConfusionReason =
  | 'similar_sounding'
  | 'headset_misrecognition'
  | 'similar_check_character'
  | 'other';

export type VoiceConfusionStatus = 'pending' | 'approved' | 'rejected';

export interface ReasonOption {
  value: VoiceConfusionReason;
  label: string;
  description: string;
}

export const VOICE_CONFUSION_REASONS: readonly ReasonOption[] = [
  {
    value: 'similar_sounding',
    label: 'Similar-sounding characters',
    description: 'Phonetic confusion between spoken characters (e.g. "J" vs "0", "B" vs "D").'
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
    label: 'Other',
    description: 'Other physical shelf layout or operational confusion.'
  }
] as const;

export interface VoiceConfusionReport {
  id: string;
  user_id?: string | null;
  heard_location: string;
  actual_location: string;
  reason: VoiceConfusionReason;
  details?: string | null;
  status: VoiceConfusionStatus;
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

export interface ReportSubmissionPayload {
  heard_location: string;
  actual_location: string;
  reason: VoiceConfusionReason;
  details?: string;
  client_hash?: string;
}

export interface SubmissionResponse {
  success: boolean;
  is_duplicate?: boolean;
  error?: string;
  report?: VoiceConfusionReport;
  message?: string;
}

export interface SearchReportsParams {
  query: string;
  status?: VoiceConfusionStatus;
  page?: number;
  pageSize?: number;
}

export interface SearchReportsResult {
  reports: VoiceConfusionReport[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
