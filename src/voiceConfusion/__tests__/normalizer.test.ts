import { describe, it, expect } from 'vitest';
import {
  normaliseLocationCode,
  areLocationsEquivalent,
  getReportCompositeKey,
  detectAmbiguousCharacters
} from '../normalizer.ts';

describe('Voice Confusion Normalizer', () => {
  it('normalises lowercase to uppercase', () => {
    expect(normaliseLocationCode('j7az')).toBe('J7AZ');
    expect(normaliseLocationCode('07az')).toBe('07AZ');
    expect(normaliseLocationCode('abcd')).toBe('ABCD');
  });

  it('removes surrounding leading and trailing whitespace', () => {
    expect(normaliseLocationCode('  10AK  ')).toBe('10AK');
    expect(normaliseLocationCode('\tJ7AZ\n')).toBe('J7AZ');
    expect(normaliseLocationCode('   07az   ')).toBe('07AZ');
  });

  it('handles empty or nullish strings safely', () => {
    expect(normaliseLocationCode('')).toBe('');
    expect(normaliseLocationCode('   ')).toBe('');
  });

  it('strictly PRESERVES ambiguous characters (does NOT convert O to 0 or I to 1)', () => {
    // Letter O must remain letter O
    expect(normaliseLocationCode('O7AZ')).toBe('O7AZ');
    expect(normaliseLocationCode('o7az')).toBe('O7AZ');

    // Digit 0 must remain digit 0
    expect(normaliseLocationCode('07AZ')).toBe('07AZ');

    // Letter O and Digit 0 must NOT be treated as identical
    expect(normaliseLocationCode('O7AZ')).not.toBe(normaliseLocationCode('07AZ'));
    expect(areLocationsEquivalent('O7AZ', '07AZ')).toBe(false);

    // Letter I must remain letter I
    expect(normaliseLocationCode('I0AK')).toBe('I0AK');
    expect(normaliseLocationCode('10AK')).toBe('10AK');
    expect(normaliseLocationCode('I0AK')).not.toBe(normaliseLocationCode('10AK'));
    expect(areLocationsEquivalent('I0AK', '10AK')).toBe(false);
  });

  it('correctly determines equivalence between case/whitespace variants', () => {
    expect(areLocationsEquivalent(' j7az ', 'J7AZ')).toBe(true);
    expect(areLocationsEquivalent('07AZ', '  07az  ')).toBe(true);
    expect(areLocationsEquivalent('10AK', '10ka')).toBe(false);
  });

  it('generates consistent composite keys for duplicate detection', () => {
    const key1 = getReportCompositeKey(' j7az ', ' 07az ', 'similar_sounding');
    const key2 = getReportCompositeKey('J7AZ', '07AZ', 'similar_sounding');
    const key3 = getReportCompositeKey('J7AZ', '07AZ', 'headset_misrecognition');

    expect(key1).toBe('J7AZ::07AZ::similar_sounding');
    expect(key2).toBe('J7AZ::07AZ::similar_sounding');
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('detects ambiguous characters correctly for assistive UI prompts', () => {
    const check1 = detectAmbiguousCharacters('07AZ');
    expect(check1.hasDigitZero).toBe(true);
    expect(check1.hasLetterO).toBe(false);

    const check2 = detectAmbiguousCharacters('O7AZ');
    expect(check2.hasDigitZero).toBe(false);
    expect(check2.hasLetterO).toBe(true);

    const check3 = detectAmbiguousCharacters('10AK');
    expect(check3.hasDigitOne).toBe(true);
    expect(check3.hasDigitZero).toBe(true);
    expect(check3.hasLetterI).toBe(false);
  });
});
