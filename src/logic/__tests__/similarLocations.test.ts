import { describe, it, expect } from 'vitest';
import { findSimilarLocations } from '../similarLocations.ts';
import { calculateStoreCheckChar } from '../storeCalculator.ts';

describe('Similar / Easily Confused Locations Detection', () => {
  it('detects jewellery heard as zero for 07AZ and J7AZ', () => {
    const from07 = findSimilarLocations('07AZ');
    expect(from07.map(r => r.location)).toContain('J7AZ');
    expect(from07.find(r => r.location === 'J7AZ')?.reason).toBe('JEWELLERY heard as ZERO');

    const fromJ7 = findSimilarLocations('J7AZ');
    expect(fromJ7.map(r => r.location)).toContain('07AZ');
  });

  it('detects security heard as nine for 97AZ and S7AZ', () => {
    const from97 = findSimilarLocations('97AZ');
    expect(from97.map(r => r.location)).toContain('S7AZ');

    const fromS7 = findSimilarLocations('S7AZ');
    expect(fromS7.map(r => r.location)).toContain('97AZ');
  });

  it('detects swapped adjacent characters for 10AN -> 10NA and L10A -> L01A', () => {
    const from10AN = findSimilarLocations('10AN');
    expect(from10AN.map(r => r.location)).toContain('10NA');

    const fromL10A = findSimilarLocations('L10A');
    expect(fromL10A.map(r => r.location)).toContain('L01A');
  });

  it('ensures all detected similar locations share the identical check character', () => {
    const testCases = ['07AZ', '97AZ', '10AN', 'J7AZ', 'S7AZ', 'L10A', 'S1PG'];

    for (const testLoc of testCases) {
      const originalCheck = calculateStoreCheckChar(testLoc).checkChar;
      const similar = findSimilarLocations(testLoc);

      for (const sim of similar) {
        expect(sim.checkChar).toBe(originalCheck);
        expect(sim.location).not.toBe(testLoc);
      }
    }
  });

  it('returns empty array for locations with no similar confusions or unknown patterns', () => {
    for (const loc of ['10AK', 'Z99Z', 'CA12', 'ABCD', '10A+', 'DPA', '']) {
      expect(findSimilarLocations(loc)).toEqual([]);
    }
  });
});
