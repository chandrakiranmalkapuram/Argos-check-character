import { describe, it, expect } from 'vitest';
import {
  validateLocationCode,
  validateReportSubmission,
  DEFAULT_VALIDATION_CONFIG
} from '../validation.ts';

describe('Voice Confusion Validation', () => {
  describe('validateLocationCode', () => {
    it('rejects empty or whitespace-only location codes', () => {
      expect(validateLocationCode('', 'Heard location')).toBe('Heard location is required.');
      expect(validateLocationCode('   ', 'Actual location')).toBe('Actual location is required.');
    });

    it('rejects codes shorter than minimum allowed length', () => {
      expect(validateLocationCode('A', 'Heard location')).toContain('at least 2 characters');
    });

    it('rejects codes longer than maximum allowed length', () => {
      expect(validateLocationCode('12345678901', 'Heard location')).toContain('must not exceed 10 characters');
    });

    it('rejects invalid characters', () => {
      expect(validateLocationCode('10@AK', 'Heard location')).toContain('contains invalid characters');
      expect(validateLocationCode('J7 AZ', 'Heard location')).toContain('contains invalid characters');
      expect(validateLocationCode('10*AK', 'Heard location')).toContain('contains invalid characters');
    });

    it('accepts valid store and RFC location codes', () => {
      expect(validateLocationCode('10AK', 'Heard location')).toBeNull();
      expect(validateLocationCode('J7AZ', 'Heard location')).toBeNull();
      expect(validateLocationCode('07AZ', 'Actual location')).toBeNull();
      expect(validateLocationCode('ABCD', 'Heard location')).toBeNull();
      expect(validateLocationCode('10A+', 'Actual location')).toBeNull(); // mezzanine code
      expect(validateLocationCode('CA12', 'Actual location')).toBeNull();
    });
  });

  describe('validateReportSubmission', () => {
    it('accepts valid, well-formed report payload', () => {
      const result = validateReportSubmission({
        heard_location: 'J7AZ',
        actual_location: '07AZ',
        reason: 'similar_sounding',
        details: 'Phonetic misunderstanding between J and 0.'
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.cleanedPayload).toEqual({
        heard_location: 'J7AZ',
        actual_location: '07AZ',
        reason: 'similar_sounding',
        details: 'Phonetic misunderstanding between J and 0.'
      });
    });

    it('rejects identical heard and actual locations', () => {
      const result = validateReportSubmission({
        heard_location: '10AK',
        actual_location: '10AK',
        reason: 'headset_misrecognition'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.general).toContain('cannot be identical');
      expect(result.errors.actual_location).toContain('must differ');
    });

    it('rejects identical heard and actual locations differing only in casing or whitespace', () => {
      const result = validateReportSubmission({
        heard_location: '  j7az  ',
        actual_location: 'J7AZ',
        reason: 'similar_sounding'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.general).toContain('cannot be identical');
    });

    it('rejects missing or invalid reason', () => {
      const missing = validateReportSubmission({
        heard_location: 'J7AZ',
        actual_location: '07AZ'
      });
      expect(missing.isValid).toBe(false);
      expect(missing.errors.reason).toContain('Please select a reason');

      const invalid = validateReportSubmission({
        heard_location: 'J7AZ',
        actual_location: '07AZ',
        reason: 'unknown_reason' as any
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.reason).toContain('Invalid reason');
    });

    it('rejects details exceeding maximum character length', () => {
      const longDetails = 'a'.repeat(501);
      const result = validateReportSubmission({
        heard_location: 'J7AZ',
        actual_location: '07AZ',
        reason: 'other',
        details: longDetails
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.details).toContain('must not exceed 500 characters');
    });

    it('supports custom validation configuration', () => {
      const customConfig = {
        ...DEFAULT_VALIDATION_CONFIG,
        minLocationLength: 4,
        maxLocationLength: 4
      };

      const resultShort = validateReportSubmission(
        {
          heard_location: '10A',
          actual_location: '10AK',
          reason: 'other'
        },
        customConfig
      );

      expect(resultShort.isValid).toBe(false);
      expect(resultShort.errors.heard_location).toContain('at least 4 characters');
    });
  });
});
