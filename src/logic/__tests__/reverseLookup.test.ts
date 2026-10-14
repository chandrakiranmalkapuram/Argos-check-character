import { describe, it, expect } from 'vitest';
import { performReverseLookup, isPhoneticWord, buildReverseIndex } from '../reverseLookup.ts';
import { calculateStoreCheckChar } from '../storeCalculator.ts';
import { NATO_PHONETIC_ALPHABET } from '../constants.ts';

describe('Reverse Lookup Calculation', () => {
  it('correctly maps NOVEMBER to store aisle 10 containing 10AK', () => {
    const result = performReverseLookup('november');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.checkChar).toBe('NOVEMBER');
      const aisle10 = result.aisles.find(a => a.aisle === '10');
      expect(aisle10).toBeDefined();
      expect(aisle10?.locations).toContain('10AK');

      // Verify that every location in the result truly evaluates to NOVEMBER
      for (const loc of aisle10?.locations.slice(0, 5) ?? []) {
        const check = calculateStoreCheckChar(loc);
        expect(check.checkChar).toBe('NOVEMBER');
      }
    }
  });

  it('verifies that the total locations across all 26 phonetic characters equals 67,600', () => {
    const index = buildReverseIndex();
    let grandTotal = 0;

    for (const word of NATO_PHONETIC_ALPHABET) {
      const aisleMap = index.get(word);
      expect(aisleMap).toBeDefined();
      if (aisleMap) {
        for (const locs of aisleMap.values()) {
          grandTotal += locs.length;
        }
      }
    }

    // 100 aisles (00..99) * 26 bays (A..Z) * 26 shelves (A..Z) = 67,600
    expect(grandTotal).toBe(100 * 26 * 26);
  });

  it('returns null for unknown phonetic queries', () => {
    expect(performReverseLookup('UNKNOWN')).toBeNull();
    expect(performReverseLookup('1234')).toBeNull();
  });

  it('correctly tests isPhoneticWord helper', () => {
    expect(isPhoneticWord('Alpha')).toBe(true);
    expect(isPhoneticWord('zulu')).toBe(true);
    expect(isPhoneticWord('10AK')).toBe(false);
  });
});
