import { describe, it, expect } from 'vitest';
import { calculateStoreCheckChar, calculateStoreCheckCharacter } from '../storeCalculator.ts';
import { performReverseLookup, buildReverseIndex } from '../reverseLookup.ts';
import { NATO_PHONETIC_ALPHABET } from '../constants.ts';

/**
 * Characterisation Tests (Milestone 1)
 *
 * Captures the exact baseline behaviour of the unmodified Store Calculator,
 * the 7 seed observation pairs from migration 4, and the complete 26-word
 * reverse-lookup index.
 *
 * Rule: No production code may be modified in Milestone 1.
 */
describe('Milestone 1: Characterisation Tests', () => {
  describe('1. Store Calculator Baseline for All Supported Location Patterns', () => {
    it('snapshots standard 4-character shelf locations (00AA - 99ZZ)', () => {
      const standardCases: Record<string, { spokenText: string; checkChar: string }> = {
        '00AA': { spokenText: 'ZERO ZERO ALPHA ALPHA', checkChar: 'ECHO' },
        '01AK': { spokenText: 'ZERO ONE ALPHA KILO', checkChar: 'PAPA' },
        '07AZ': { spokenText: 'ZERO SEVEN ALPHA ZULU', checkChar: 'YANKEE' },
        '08MN': { spokenText: 'ZERO EIGHT MIKE NOVEMBER', checkChar: 'BRAVO' },
        '10AK': { spokenText: 'ONE ZERO ALPHA KILO', checkChar: 'NOVEMBER' },
        '10BZ': { spokenText: 'ONE ZERO BRAVO ZULU', checkChar: 'NOVEMBER' },
        '10HL': { spokenText: 'ONE ZERO HOTEL LIMA', checkChar: 'NOVEMBER' },
        '10KA': { spokenText: 'ONE ZERO KILO ALPHA', checkChar: 'BRAVO' },
        '11BZ': { spokenText: 'ONE ONE BRAVO ZULU', checkChar: 'UNIFORM' },
        '16JA': { spokenText: 'ONE SIX JULIET ALPHA', checkChar: 'KILO' },
        '16ZG': { spokenText: 'ONE SIX ZULU GOLF', checkChar: 'KILO' },
        '20AN': { spokenText: 'TWO ZERO ALPHA NOVEMBER', checkChar: 'BRAVO' },
        '21EZ': { spokenText: 'TWO ONE ECHO ZULU', checkChar: 'UNIFORM' },
        '50ER': { spokenText: 'FIVE ZERO ECHO ROMEO', checkChar: 'ECHO' },
        '81ZE': { spokenText: 'EIGHT ONE ZULU ECHO', checkChar: 'ECHO' },
        '91PG': { spokenText: 'NINE ONE PAPA GOLF', checkChar: 'X-RAY' },
        '99ZZ': { spokenText: 'NINE NINE ZULU ZULU', checkChar: 'YANKEE' }
      };

      for (const [code, expected] of Object.entries(standardCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
        expect(calculateStoreCheckCharacter(code)).toBe(expected.checkChar);
      }
    });

    it('snapshots Jewellery (J) and Security (S) prefixed locations', () => {
      const jsCases: Record<string, { spokenText: string; checkChar: string }> = {
        'J1PG': { spokenText: 'JEWELLERY ONE PAPA GOLF', checkChar: 'ECHO' },
        'J7AZ': { spokenText: 'JEWELLERY SEVEN ALPHA ZULU', checkChar: 'YANKEE' },
        'J8MN': { spokenText: 'JEWELLERY EIGHT MIKE NOVEMBER', checkChar: 'BRAVO' },
        'S1PG': { spokenText: 'SECURITY ONE PAPA GOLF', checkChar: 'X-RAY' },
        'S7AZ': { spokenText: 'SECURITY SEVEN ALPHA ZULU', checkChar: 'ROMEO' }
      };

      for (const [code, expected] of Object.entries(jsCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
      }
    });

    it('snapshots Linbin (L) and Bulk (Z) prefixed locations', () => {
      const lzCases: Record<string, { spokenText: string; checkChar: string }> = {
        'L10A': { spokenText: 'ONE ZERO LINBIN ALPHA', checkChar: 'GOLF' },
        'L00A': { spokenText: 'ZERO ZERO LINBIN ALPHA', checkChar: 'ZULU' },
        'L99Z': { spokenText: 'NINE NINE LINBIN ZULU', checkChar: 'SIERRA' },
        'Z10A': { spokenText: 'ONE ZERO BULK ALPHA', checkChar: 'YANKEE' },
        'Z01B': { spokenText: 'ZERO ONE BULK BRAVO', checkChar: 'BRAVO' },
        'Z99Z': { spokenText: 'NINE NINE BULK ZULU', checkChar: 'KILO' }
      };

      for (const [code, expected] of Object.entries(lzCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
      }
    });

    it('snapshots Cash Office (CA) and Collection Point (CP) locations', () => {
      const cacpCases: Record<string, { spokenText: string; checkChar: string }> = {
        'CA10': { spokenText: 'CASH OFFICE ONE ZERO', checkChar: 'DELTA' },
        'CA12': { spokenText: 'CASH OFFICE ONE TWO', checkChar: 'JULIET' },
        'CP10': { spokenText: 'COLLECTION POINT ONE ZERO', checkChar: 'ECHO' },
        'CP12': { spokenText: 'COLLECTION POINT ONE TWO', checkChar: 'KILO' }
      };

      for (const [code, expected] of Object.entries(cacpCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
      }
    });

    it('snapshots relative location suffixes (+ and -)', () => {
      const relCases: Record<string, { spokenText: string; checkChar: string }> = {
        '10A+': { spokenText: 'AFTER ONE ZERO ALPHA', checkChar: 'VICTOR' },
        '10A-': { spokenText: 'BEFORE ONE ZERO ALPHA', checkChar: 'BRAVO' },
        '01M+': { spokenText: 'AFTER ZERO ONE MIKE', checkChar: 'DELTA' },
        '01M-': { spokenText: 'BEFORE ZERO ONE MIKE', checkChar: 'JULIET' }
      };

      for (const [code, expected] of Object.entries(relCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
      }
    });

    it('snapshots fixed system codes and returns aliases', () => {
      const fixedCases: Record<string, { spokenText: string; checkChar: string; kind: string }> = {
        'DPA': { spokenText: 'DPA', checkChar: 'VICTOR', kind: 'fixed' },
        'SOB': { spokenText: 'SOB', checkChar: 'SIERRA', kind: 'fixed' },
        'RETURNS': { spokenText: 'RETURNS', checkChar: 'OSCAR', kind: 'fixed' },
        'RETURN': { spokenText: 'RETURNS', checkChar: 'OSCAR', kind: 'fixed' },
        'RETUR': { spokenText: 'RETURNS', checkChar: 'OSCAR', kind: 'fixed' },
        'RETS': { spokenText: 'RETURNS', checkChar: 'OSCAR', kind: 'fixed' }
      };

      for (const [code, expected] of Object.entries(fixedCases)) {
        const res = calculateStoreCheckChar(code);
        expect(res.isValid).toBe(true);
        expect(res.kind).toBe(expected.kind);
        expect(res.spokenText).toBe(expected.spokenText);
        expect(res.checkChar).toBe(expected.checkChar);
      }
    });

    it('verifies that inputs shorter than 4 characters return empty/invalid result without space-padding', () => {
      for (const shortInput of ['', '   ', '1', '10', '10A', 'AB']) {
        const res = calculateStoreCheckChar(shortInput);
        expect(res.isValid).toBe(false);
        expect(res.kind).toBe('empty');
        expect(res.checkChar).toBe('NULL');
        expect(res.spokenText).toBe('NULL');
        expect(res.errorMessage).toBe('Location code must be at least 4 characters long');
      }
    });
  });

  describe('2. Migration 4 Seed Observation Pairs Characterisation', () => {
    it('verifies the 5 seed pairs that share identical check characters', () => {
      const sameCheckSeedPairs: Array<{
        pair: [string, string];
        expectedCheckChar: string;
        spoken: [string, string];
      }> = [
        {
          pair: ['08MN', '20AN'],
          expectedCheckChar: 'BRAVO',
          spoken: ['ZERO EIGHT MIKE NOVEMBER', 'TWO ZERO ALPHA NOVEMBER']
        },
        {
          pair: ['16ZG', '16JA'],
          expectedCheckChar: 'KILO',
          spoken: ['ONE SIX ZULU GOLF', 'ONE SIX JULIET ALPHA']
        },
        {
          pair: ['81ZE', '50ER'],
          expectedCheckChar: 'ECHO',
          spoken: ['EIGHT ONE ZULU ECHO', 'FIVE ZERO ECHO ROMEO']
        },
        {
          pair: ['01MM', 'Z01B'],
          expectedCheckChar: 'BRAVO',
          spoken: ['ZERO ONE MIKE MIKE', 'ZERO ONE BULK BRAVO']
        },
        {
          pair: ['J7AZ', '07AZ'],
          expectedCheckChar: 'YANKEE',
          spoken: ['JEWELLERY SEVEN ALPHA ZULU', 'ZERO SEVEN ALPHA ZULU']
        }
      ];

      for (const { pair, expectedCheckChar, spoken } of sameCheckSeedPairs) {
        const resA = calculateStoreCheckChar(pair[0]);
        const resB = calculateStoreCheckChar(pair[1]);

        expect(resA.checkChar, `${pair[0]} checkChar`).toBe(expectedCheckChar);
        expect(resB.checkChar, `${pair[1]} checkChar`).toBe(expectedCheckChar);
        expect(resA.checkChar).toBe(resB.checkChar);

        expect(resA.spokenText).toBe(spoken[0]);
        expect(resB.spokenText).toBe(spoken[1]);
      }
    });

    it('verifies the 2 seed pairs that have different check characters', () => {
      // Seed 6: S1PG (X-RAY) vs 01PG (ECHO)
      const resS1 = calculateStoreCheckChar('S1PG');
      const res01 = calculateStoreCheckChar('01PG');
      expect(resS1.checkChar).toBe('X-RAY');
      expect(res01.checkChar).toBe('ECHO');
      expect(resS1.checkChar).not.toBe(res01.checkChar);
      expect(resS1.spokenText).toBe('SECURITY ONE PAPA GOLF');
      expect(res01.spokenText).toBe('ZERO ONE PAPA GOLF');

      // Seed 7: 10AK (NOVEMBER) vs 10KA (BRAVO)
      const res10AK = calculateStoreCheckChar('10AK');
      const res10KA = calculateStoreCheckChar('10KA');
      expect(res10AK.checkChar).toBe('NOVEMBER');
      expect(res10KA.checkChar).toBe('BRAVO');
      expect(res10AK.checkChar).not.toBe(res10KA.checkChar);
      expect(res10AK.spokenText).toBe('ONE ZERO ALPHA KILO');
      expect(res10KA.spokenText).toBe('ONE ZERO KILO ALPHA');
    });
  });

  describe('3. Reverse Lookup Snapshot for All 26 Check Words', () => {
    it('verifies exactly 2,600 locations per check word across 100 aisles (67,600 total)', () => {
      const index = buildReverseIndex();
      expect(index.size).toBe(26);

      let totalLocationsAcrossAllWords = 0;

      for (const word of NATO_PHONETIC_ALPHABET) {
        const aisleMap = index.get(word);
        expect(aisleMap, `Aisle map for ${word}`).toBeDefined();
        if (!aisleMap) continue;

        expect(aisleMap.size, `Aisle count for ${word}`).toBe(100);

        let countForThisWord = 0;
        for (let aisleNum = 0; aisleNum < 100; aisleNum++) {
          const aisleStr = aisleNum.toString().padStart(2, '0');
          const locs = aisleMap.get(aisleStr);
          expect(locs, `Locations for aisle ${aisleStr} in ${word}`).toBeDefined();
          if (locs) {
            countForThisWord += locs.length;
          }
        }

        // Each of the 26 NATO words has exactly 2,600 locations (100 aisles * 26 = 2,600)
        expect(countForThisWord, `Total locations for ${word}`).toBe(2600);
        totalLocationsAcrossAllWords += countForThisWord;
      }

      expect(totalLocationsAcrossAllWords).toBe(67600);
    });

    it('verifies performReverseLookup output fingerprint for all 26 phonetic characters', () => {
      const boundarySnapshots: Record<string, { firstLoc: string; lastLoc: string }> = {};

      for (const word of NATO_PHONETIC_ALPHABET) {
        const lookup = performReverseLookup(word);
        expect(lookup).not.toBeNull();
        if (!lookup) continue;

        expect(lookup.checkChar).toBe(word);
        expect(lookup.phoneticWord).toBe(word);
        expect(lookup.totalMatches).toBe(2600);
        expect(lookup.aisles.length).toBe(100);

        const firstAisle = lookup.aisles[0];
        const lastAisle = lookup.aisles[lookup.aisles.length - 1];

        const firstLoc = firstAisle.locations[0];
        const lastLoc = lastAisle.locations[lastAisle.locations.length - 1];

        boundarySnapshots[word] = { firstLoc, lastLoc };

        // Verify calculator agreement on boundary locations
        expect(calculateStoreCheckChar(firstLoc).checkChar, `${word} firstLoc`).toBe(word);
        expect(calculateStoreCheckChar(lastLoc).checkChar, `${word} lastLoc`).toBe(word);

        // Verify calculator agreement on every aisle's first location
        for (const aisleData of lookup.aisles) {
          expect(aisleData.locations.length).toBeGreaterThan(0);
          const sampleLoc = aisleData.locations[0];
          expect(calculateStoreCheckChar(sampleLoc).checkChar).toBe(word);
        }
      }

      // Assert that all 26 check words generated non-empty, distinct boundaries
      expect(Object.keys(boundarySnapshots).length).toBe(26);
    });

    it('asserts golden SHA-256 hash of complete reverse-lookup index output for all 26 words', async () => {
      const fullData = NATO_PHONETIC_ALPHABET.map(word => performReverseLookup(word));
      const jsonStr = JSON.stringify(fullData);
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jsonStr));
      const hash = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // Golden hash capturing all 26 words, 100 aisles each, 2600 locations each in exact order
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBe('5f19be1adde5fc3ed1e1c57384d0ee1023cbd55f6749eb7d0eb7790ce5c4df03');
    });
  });

  describe('4. Non-Grammar Inputs and Formatting Quirks Characterisation', () => {
    it('characterises whitespace trimming and lowercase normalisation', () => {
      const res = calculateStoreCheckChar('  10ak  ');
      expect(res.isValid).toBe(true);
      expect(res.location).toBe('10AK');
      expect(res.spokenText).toBe('ONE ZERO ALPHA KILO');
      expect(res.checkChar).toBe('NOVEMBER');
    });

    it('characterises truncation of inputs longer than 4 characters', () => {
      const res = calculateStoreCheckChar('10AKEXTRA');
      expect(res.isValid).toBe(true);
      expect(res.location).toBe('10AK');
      expect(res.spokenText).toBe('ONE ZERO ALPHA KILO');
      expect(res.checkChar).toBe('NOVEMBER');
    });

    it('characterises non-alphanumeric characters producing ? in spokenText', () => {
      const res = calculateStoreCheckChar('10*K');
      expect(res.isValid).toBe(true);
      expect(res.spokenText).toBe('ONE ZERO ? KILO');
      // '1' (49)*5 + '0' (48)*7 + '*' (42)*7 + 'K' (75)*3 = 245 + 336 + 294 + 225 = 1100
      // 1100 % 26 = 8 -> INDIA
      expect(res.checkChar).toBe('INDIA');
    });

    it('characterises prefix quirks on 4-letter words (L, Z, J, S, CA, CP)', () => {
      // LAKE: firstChar 'L' with >= 4 words triggers Linbin rule (pos 1,2 before LINBIN, pos 3 after)
      const lake = calculateStoreCheckChar('LAKE');
      expect(lake.spokenText).toBe('ALPHA KILO LINBIN ECHO');
      expect(lake.checkChar).toBe('HOTEL');

      // ZEST: firstChar 'Z' with >= 4 words triggers Bulk rule
      const zest = calculateStoreCheckChar('ZEST');
      expect(zest.spokenText).toBe('ECHO SIERRA BULK TANGO');
      expect(zest.checkChar).toBe('YANKEE');

      // JADE: firstChar 'J' triggers Jewellery prefix replacement
      const jade = calculateStoreCheckChar('JADE');
      expect(jade.spokenText).toBe('JEWELLERY ALPHA DELTA ECHO');
      expect(jade.checkChar).toBe('ALPHA');

      // SAND: firstChar 'S' triggers Security prefix replacement
      const sand = calculateStoreCheckChar('SAND');
      expect(sand.spokenText).toBe('SECURITY ALPHA NOVEMBER DELTA');
      expect(sand.checkChar).toBe('INDIA');

      // CAMP: prefix 'CA' triggers Cash Office rule
      const camp = calculateStoreCheckChar('CAMP');
      expect(camp.spokenText).toBe('CASH OFFICE MIKE PAPA');
      expect(camp.checkChar).toBe('JULIET');
    });
  });
});
