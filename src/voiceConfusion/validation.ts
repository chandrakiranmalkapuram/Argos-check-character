/**
 * Form validation rules for Voice Confusion Reference reporting.
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
  voiced_location?: string;
  found_location?: string;
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
  fieldName: 'Voiced location' | 'Found location' | 'Heard location' | 'Actual location',
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
    return `${fieldName} contains invalid characters. Permitted characters: letters (A-Z), numbers (0-9), or standard level symbols (+, -).`;
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

  if (payload.honeypot && payload.honeypot.trim()) {
    return {
      isValid: false,
      errors: { general: 'Spam detection triggered. Bot submission rejected.' }
    };
  }

  const voicedInput = payload.voiced_location ?? payload.heard_location ?? '';
  const foundInput = payload.found_location ?? payload.actual_location ?? '';

  // 1. Validate heard / voiced location
  const heardError = validateLocationCode(
    voicedInput,
    payload.voiced_location ? 'Voiced location' : 'Heard location',
    config
  );
  if (heardError) {
    errors.heard_location = heardError;
    errors.voiced_location = heardError;
  }

  // 2. Validate actual / found location
  const actualError = validateLocationCode(
    foundInput,
    payload.found_location ? 'Found location' : 'Actual location',
    config
  );
  if (actualError) {
    errors.actual_location = actualError;
    errors.found_location = actualError;
  }

  // 3. Validate heard and actual are not identical
  if (!heardError && !actualError && areLocationsEquivalent(voicedInput, foundInput)) {
    const isNewNaming = Boolean(payload.voiced_location || payload.found_location);
    errors.general = isNewNaming
      ? 'Voiced location and found location cannot be identical after normalisation.'
      : 'Heard location and actual location cannot be identical after normalisation.';
    errors.actual_location = isNewNaming
      ? 'Found location must differ from the voiced location.'
      : 'Actual location must differ from the heard location.';
    errors.found_location = errors.actual_location;
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
  const cleanVoiced = normaliseLocationCode(voicedInput);
  const cleanFound = normaliseLocationCode(foundInput);

  let cleaned: ReportSubmissionPayload | undefined = undefined;
  if (isValid) {
    const base: any = {
      heard_location: cleanVoiced,
      actual_location: cleanFound,
      reason: payload.reason as VoiceConfusionReason,
      details: payload.details?.trim() || undefined
    };
    if (payload.voiced_location) {
      base.voiced_location = cleanVoiced;
    }
    if (payload.found_location) {
      base.found_location = cleanFound;
    }
    if (payload.client_hash) {
      base.client_hash = payload.client_hash;
    }
    cleaned = base;
  }

  return {
    isValid,
    errors,
    cleanedPayload: cleaned
  };
}
