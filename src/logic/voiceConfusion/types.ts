/**
 * Pure TypeScript types and domain definitions for Voice Confusion Engine.
 * This module is strictly pure: no Supabase, no network, no browser or Node globals.
 */

import type { ParsedLocationCode, UnsupportedReason, SupportedStorePattern } from './grammar.ts';
import type { TokenAlignmentPair } from './phonetics/comparators.ts';

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

export interface VoiceConfusionReport {
  id: string;
  user_id?: string | null;
  voiced_location: string;
  found_location: string;
  voiced_location_norm?: string;
  found_location_norm?: string;
  raw_voiced_location?: string;
  raw_found_location?: string;
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

export type CandidateTier =
  | 'tier1_reported'
  | 'tier2_model_similar'
  | 'tier3_possible'
  | 'arithmetic_collision';

export type CandidateExistence = 'unknown';

export interface ConfusionCandidate {
  location: string;
  pattern: SupportedStorePattern;
  spokenText: string;
  checkChar: string;
  tier: CandidateTier;
  existence: CandidateExistence;
  totalDistance: number;
  meanDistance: number;
  alignment: TokenAlignmentPair[];
  explanation: string;
  isReferenceExample?: boolean;
  hasCommunityReport?: boolean;
  communityReportStatus?: VoiceConfusionStatus;
  provenance?: ReportProvenance;
  reportCount?: number;
}

export interface DifferentCheckReport {
  inputLocation: string;
  inputCheckChar: string;
  reportedLocation: string;
  reportedCheckChar: string;
  reportCount: number;
  provenance?: ReportProvenance;
  details?: string;
  explanation: string;
}

export interface ReportedPairEntry {
  reportedLocation: string;
  spokenText?: string;
  checkChar: string;
  status: VoiceConfusionStatus;
  provenance: ReportProvenance;
  reportCount: number;
  label:
    | 'Reference example'
    | 'Reported, unverified'
    | 'Approved'
    | 'Confirmed'
    | 'Reported (layout / check-character), does not affect ranking';
  direction: 'voiced_to_found' | 'opposite_direction';
  reason?: VoiceConfusionReason;
  details?: string;
}

export interface SuggestionOptions {
  includeArithmeticCollisions?: boolean;
  communityReports?: VoiceConfusionReport[];
  maxDifferingTokensTier2?: number;
  maxDifferingTokensTier3?: number;
  maxFarTokenDistanceTier3?: number;
}

export interface SuggestionResult {
  isValid: boolean;
  inputLocation: string;
  normalizedLocation: string;
  parsed: ParsedLocationCode;
  checkChar?: string;
  spokenText?: string;
  candidates: ConfusionCandidate[];
  /**
   * Separate section for all same-check reported/seed pairs involving this input
   * per Decision D9.
   */
  reportedPairs: ReportedPairEntry[];
  differentCheckCommunityReports: DifferentCheckReport[];
  totalCheckedLocations: number;
  unsupportedReason?: UnsupportedReason;
  errorMessage?: string;
}
