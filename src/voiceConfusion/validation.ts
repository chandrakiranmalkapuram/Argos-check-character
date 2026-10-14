/**
 * Form validation rules for Voice Confusion Risk reporting.
 */

import { normaliseLocationCode, areLocationsEquivalent } from './normalizer.ts';
import type { ReportSubmissionPayload, VoiceConfusionReason } from './types.ts';
import { VOICE_CONFUSION_REASONS } from './types.ts';

export interface ValidationConfig {
  minLocationLength: number;
  maxLocationLength: number;
  maxDetailsLength: number;
  /**
   * Permitted location characters: A-Z, 0-9, plus common warehouse symbols like + (mezzanine), - and /
   */
  locationPattern: RegExp;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minLocationLength: 2,
  maxLocationLength: 10,
  maxDetailsLength: 500,
  locationPattern: /^[A-Z0-9+\-/]+$/
};

export interface FormValidationErrors {
  heard_location?: string;
  actual_location?: string;
  reason?: string;
  details?: string;
  general?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: FormValidationErrors;
  cleanedPayload?: ReportSubmissionPayload;
}

/**
 * Validates a single location code string against project constraints.
 */
export function validateLocationCode(
  code: string,
  fieldName: 'Heard location' | 'Actual location',
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): string | null {
  const trimmed = code.trim();

  if (!trimmed) {
    return `${fieldName} is required.`;
  }

  const normalised = normaliseLocationCode(trimmed);

  if (normalised.length < config.minLocationLength) {
    return `${fieldName} must be at least ${config.minLocationLength} characters (e.g. 10AK, J7AZ).`;
  }

  if (normalised.length > config.maxLocationLength) {
    return `${fieldName} must not exceed ${config.maxLocationLength} characters.`;
  }

  if (!config.locationPattern.test(normalised)) {
    return `${fieldName} contains invalid characters. Use letters (A-Z), numbers (0-9), or standard level symbols (+, -).`;
  }

  return null;
}

/**
 * Validates a full voice confusion report submission.
 */
export function validateReportSubmission(
  payload: Partial<ReportSubmissionPayload>,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): FormValidationResult {
  const errors: FormValidationErrors = {};

  // 1. Validate heard_location
  const heardError = validateLocationCode(payload.heard_location ?? '', 'Heard location', config);
  if (heardError) {
    errors.heard_location = heardError;
  }

  // 2. Validate actual_location
  const actualError = validateLocationCode(payload.actual_location ?? '', 'Actual location', config);
  if (actualError) {
    errors.actual_location = actualError;
  }

  // 3. Validate heard and actual are not identical
  const heard = payload.heard_location ?? '';
  const actual = payload.actual_location ?? '';
  if (!errors.heard_location && !errors.actual_location && areLocationsEquivalent(heard, actual)) {
    errors.general = 'Heard location and actual location cannot be identical after normalisation.';
    errors.actual_location = 'Actual location must differ from the heard location.';
  }

  // 4. Validate reason
  const validReasons: VoiceConfusionReason[] = VOICE_CONFUSION_REASONS.map(r => r.value);
  if (!payload.reason) {
    errors.reason = 'Please select a reason for the voice confusion.';
  } else if (!validReasons.includes(payload.reason)) {
    errors.reason = 'Invalid reason selected.';
  }

  // 5. Validate optional details
  if (payload.details && payload.details.trim().length > config.maxDetailsLength) {
    errors.details = `Details must not exceed ${config.maxDetailsLength} characters (currently ${payload.details.trim().length}).`;
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    cleanedPayload: isValid
      ? {
          heard_location: normaliseLocationCode(heard),
          actual_location: normaliseLocationCode(actual),
          reason: payload.reason as VoiceConfusionReason,
          details: payload.details?.trim() || undefined
        }
      : undefined
  };
}
