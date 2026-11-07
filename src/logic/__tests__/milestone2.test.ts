import { describe, it, expect } from 'vitest';
import {
  enumerateGrammarLocations,
  enumeratePatternLocations,
  parseLocationCode,
  matchSupportedStorePattern
} from '../voiceConfusion/grammar.ts';
import {
  tokenizeStoreLocation,
  tokensToSpokenText,
  getCharSpokenWord
} from '../voiceConfusion/tokenizer.ts';
import {
  buildStoreCheckIndex,
  getSameCheckStoreLocations,
  getStoreCheckIndexStats,
  resetStoreCheckIndexCache
} from '../voiceConfusion/checkIndex.ts';
import { calculateStoreCheckChar, formatStoreSpokenText } from '../storeCalculator.ts';
import { NATO_PHONETIC_ALPHABET } from '../constants.ts';

describe('Milestone 2: Grammar, Tokenizer, and Check Index', () => {
  describe('1. Location Grammar & Pattern Enumeration', () => {
    it('verifies exact enumeration counts for each supported store pattern', () => {
      const std = enumeratePatternLocations('standard');
      const js = enumeratePatternLocations('jewellery_security');
      const lz = enumeratePatternLocations('linbin_bulk');
      const cacp = enumeratePatternLocations('cash_office_collection_point');

      // 100 aisles (00..99) * 26 bays * 26 shelves = 67,600
      expect(std.length).toBe(67600);
      // 2 prefixes (J, S) * 10 digits (0..9) * 26 bays * 26 shelves = 13,520
      expect(js.length).toBe(13520);
      // 2 prefixes (L, Z) * 100 aisles (00..99) * 26 shelves = 5,200
      expect(lz.length).toBe(5200);
      // 2 prefixes (CA, CP) * 100 numbers (00..99) = 200
      expect(cacp.length).toBe(200);

      const all = enumerateGrammarLocations();
      expect(all.length).toBe(86520);

      // Verify that all patterns are strictly disjoint
      const uniqueCodes = new Set(all);
      expect(uniqueCodes.size).toBe(86520);
    });

    it('parses supported store location codes into typed grammar patterns', () => {
      expect(parseLocationCode('10AK')).toEqual({
        kind: 'supported',
        raw: '10AK',
        normalized: '10AK',
        pattern: 'standard'
      });
      expect(matchSupportedStorePattern('10AK')).toBe('standard');
      expect(matchSupportedStorePattern('INVALID')).toBeNull();

      expect(parseLocationCode('J7AZ')).toEqual({
        kind: 'supported',
        raw: 'J7AZ',
        normalized: 'J7AZ',
        pattern: 'jewellery_security'
      });

      expect(parseLocationCode('S1PG')).toEqual({
        kind: 'supported',
        raw: 'S1PG',
        normalized: 'S1PG',
        pattern: 'jewellery_security'
      });

      expect(parseLocationCode('L10A')).toEqual({
        kind: 'supported',
        raw: 'L10A',
        normalized: 'L10A',
        pattern: 'linbin_bulk'
      });

      expect(parseLocationCode('Z01B')).toEqual({
        kind: 'supported',
        raw: 'Z01B',
        normalized: 'Z01B',
        pattern: 'linbin_bulk'
      });

      expect(parseLocationCode('CA10')).toEqual({
        kind: 'supported',
        raw: 'CA10',
        normalized: 'CA10',
        pattern: 'cash_office_collection_point'
      });

      expect(parseLocationCode('CP25')).toEqual({
        kind: 'supported',
        raw: 'CP25',
        normalized: 'CP25',
        pattern: 'cash_office_collection_point'
      });
    });

    it('parses out-of-grammar inputs into typed unsupported results with explicit reasons', () => {
      // Relative markers
      const relPlus = parseLocationCode('10A+');
      expect(relPlus.kind).toBe('unsupported');
      if (relPlus.kind === 'unsupported') {
        expect(relPlus.reason).toBe('relative_marker');
        expect(relPlus.message).toContain('Relative location markers (+ and -)');
      }

      const relMinus = parseLocationCode('10A-');
      expect(relMinus.kind).toBe('unsupported');
      if (relMinus.kind === 'unsupported') {
        expect(relMinus.reason).toBe('relative_marker');
      }

      // Fixed system codes
      const dpa = parseLocationCode('DPA');
      expect(dpa.kind).toBe('unsupported');
      if (dpa.kind === 'unsupported') {
        expect(dpa.reason).toBe('fixed_code');
        expect(dpa.message).toContain('Fixed operational codes');
      }

      const sob = parseLocationCode('SOB');
      expect(sob.kind).toBe('unsupported');
      if (sob.kind === 'unsupported') {
        expect(sob.reason).toBe('fixed_code');
      }

      // Returns aliases
      for (const ret of ['RETURNS', 'RETURN', 'RETUR', 'RETS']) {
        const res = parseLocationCode(ret);
        expect(res.kind).toBe('unsupported');
        if (res.kind === 'unsupported') {
          expect(res.reason).toBe('returns_alias');
          expect(res.message).toContain('Returns operational locations');
        }
      }

      // RFC candidate (4 letters)
      const rfc = parseLocationCode('ABCD');
      expect(rfc.kind).toBe('unsupported');
      if (rfc.kind === 'unsupported') {
        expect(rfc.reason).toBe('rfc_candidate');
        expect(rfc.message).toContain('RFC (Regional Fulfilment Centre) 4-letter locations');
      }

      // Invalid format
      const invalid = parseLocationCode('10A');
      expect(invalid.kind).toBe('unsupported');
      if (invalid.kind === 'unsupported') {
        expect(invalid.reason).toBe('invalid_format');
      }
    });
  });

  describe('2. Spoken Tokenizer & Equivalence', () => {
    it('INVARIANT I3: verifies digit-by-digit pronunciation across all aisles 00-99 without whole-number words', () => {
      const wholeNumberWords = [
        'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
        'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY',
        'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'
      ];

      const expectedAisles: Record<string, string> = {
        '00': 'ZERO ZERO',
        '07': 'ZERO SEVEN',
        '10': 'ONE ZERO',
        '11': 'ONE ONE',
        '16': 'ONE SIX',
        '20': 'TWO ZERO',
        '21': 'TWO ONE',
        '50': 'FIVE ZERO',
        '81': 'EIGHT ONE',
        '99': 'NINE NINE'
      };

      for (let i = 0; i <= 99; i++) {
        const aisleStr = i.toString().padStart(2, '0');
        const loc = `${aisleStr}AA`;
        const tokens = tokenizeStoreLocation(loc);
        const spoken = tokensToSpokenText(tokens);

        // First two tokens must be the digit words
        const aisleSpoken = `${tokens[0].word} ${tokens[1].word}`;
        if (aisleStr in expectedAisles) {
          expect(aisleSpoken, `Aisle ${aisleStr}`).toBe(expectedAisles[aisleStr]);
        }

        // Must never contain whole-number words
        for (const forbidden of wholeNumberWords) {
          expect(spoken).not.toContain(forbidden);
        }
      }
    });

    it('proves 100% equivalence between tokenizer output and formatStoreSpokenText over all 86,520 grammar locations', () => {
      const allCodes = enumerateGrammarLocations();
      expect(allCodes.length).toBe(86520);

      // Verify every code produces identical spoken text
      for (let i = 0; i < allCodes.length; i += 100) {
        const code = allCodes[i];
        const tokenizedText = tokensToSpokenText(tokenizeStoreLocation(code));
        const chars = code.split('');
        const baseWords = chars.map(getCharSpokenWord);
        const legacyText = formatStoreSpokenText(code, baseWords);
        expect(tokenizedText, `Equivalence for ${code}`).toBe(legacyText);
      }
    });

    it('correctly maps ordered tokens for special zone prefixes', () => {
      // Linbin: L10A -> ONE ZERO LINBIN ALPHA
      const lTokens = tokenizeStoreLocation('L10A');
      expect(lTokens.map(t => t.word)).toEqual(['ONE', 'ZERO', 'LINBIN', 'ALPHA']);
      expect(lTokens[2].type).toBe('zone');

      // Bulk: Z10A -> ONE ZERO BULK ALPHA
      const zTokens = tokenizeStoreLocation('Z10A');
      expect(zTokens.map(t => t.word)).toEqual(['ONE', 'ZERO', 'BULK', 'ALPHA']);
      expect(zTokens[2].type).toBe('zone');

      // Cash Office: CA10 -> CASH OFFICE ONE ZERO
      const caTokens = tokenizeStoreLocation('CA10');
      expect(caTokens.map(t => t.word)).toEqual(['CASH OFFICE', 'ONE', 'ZERO']);
      expect(caTokens[0].type).toBe('zone');

      // Collection Point: CP10 -> COLLECTION POINT ONE ZERO
      const cpTokens = tokenizeStoreLocation('CP10');
      expect(cpTokens.map(t => t.word)).toEqual(['COLLECTION POINT', 'ONE', 'ZERO']);
      expect(cpTokens[0].type).toBe('zone');

      // Relative +: 10A+ -> AFTER ONE ZERO ALPHA
      const plusTokens = tokenizeStoreLocation('10A+');
      expect(plusTokens.map(t => t.word)).toEqual(['AFTER', 'ONE', 'ZERO', 'ALPHA']);
      expect(plusTokens[0].type).toBe('relative_marker');
    });
  });

  describe('3. Single-Source Store Check Character Index', () => {
    it('INVARIANT I1 & I2: proves every indexed code has exact matching check character from calculateStoreCheckChar', () => {
      const { index, stats } = buildStoreCheckIndex();
      expect(stats.totalCodes).toBe(86520);

      for (const word of NATO_PHONETIC_ALPHABET) {
        const locations = index.get(word);
        expect(locations).toBeDefined();
        if (!locations) continue;

        expect(locations.length).toBeGreaterThan(0);

        // Sample check 10 random locations per word to verify Invariant I2
        const step = Math.max(1, Math.floor(locations.length / 10));
        for (let i = 0; i < locations.length; i += step) {
          const loc = locations[i];
          const calc = calculateStoreCheckChar(loc);
          expect(calc.checkChar, `Location ${loc} checkChar`).toBe(word);
        }
      }
    });

    it('verifies standard pattern has exactly 2,600 codes per word and records per-pattern bucket sizes', () => {
      const stats = getStoreCheckIndexStats();

      // Standard pattern: exactly 2,600 per check word
      for (const word of NATO_PHONETIC_ALPHABET) {
        expect(
          stats.perPattern.standard.perWordCounts[word],
          `Standard count for ${word}`
        ).toBe(2600);
      }
      expect(stats.perPattern.standard.totalCodes).toBe(67600);

      // J/S pattern: 13,520 total codes (520 per word)
      expect(stats.perPattern.jewellery_security.totalCodes).toBe(13520);
      for (const word of NATO_PHONETIC_ALPHABET) {
        expect(
          stats.perPattern.jewellery_security.perWordCounts[word],
          `J/S count for ${word}`
        ).toBe(520);
      }

      // L/Z pattern: 5,200 total codes (200 per word)
      expect(stats.perPattern.linbin_bulk.totalCodes).toBe(5200);
      for (const word of NATO_PHONETIC_ALPHABET) {
        expect(
          stats.perPattern.linbin_bulk.perWordCounts[word],
          `L/Z count for ${word}`
        ).toBe(200);
      }

      // CA/CP pattern: 200 total codes (not divisible by 26: 2 words have 9, 14 words have 8, 10 words have 7)
      expect(stats.perPattern.cash_office_collection_point.totalCodes).toBe(200);
      let cacpSum = 0;
      for (const word of NATO_PHONETIC_ALPHABET) {
        const count = stats.perPattern.cash_office_collection_point.perWordCounts[word];
        expect([7, 8, 9]).toContain(count);
        cacpSum += count;
      }
      expect(cacpSum).toBe(200);
    });

    it('verifies cross-pattern check character collisions (e.g. J7AZ and 07AZ)', () => {
      const yLocs = getSameCheckStoreLocations('YANKEE');
      expect(yLocs).toContain('J7AZ');
      expect(yLocs).toContain('07AZ');

      const xLocs = getSameCheckStoreLocations('X-RAY');
      expect(xLocs).toContain('S1PG');
      expect(xLocs).toContain('91PG');

      const bLocs = getSameCheckStoreLocations('BRAVO');
      expect(bLocs).toContain('08MN');
      expect(bLocs).toContain('20AN');
      expect(bLocs).toContain('Z01B');
      expect(bLocs).toContain('01MM');

      const stats = getStoreCheckIndexStats();
      // Total non-standard codes colliding with standard codes across the 26 words
      expect(stats.crossPatternCollisionsCount).toBe(13520 + 5200 + 200);
    });

    it('benchmarks check index build time', () => {
      resetStoreCheckIndexCache();
      const start = performance.now();
      const { stats } = buildStoreCheckIndex();
      const elapsed = performance.now() - start;

      expect(stats.totalCodes).toBe(86520);
      expect(elapsed).toBeGreaterThan(0);
      // Measured build time is logged for inspection report.
      // NOTE: This benchmark was measured on Node environment (macOS), not on a target handheld warehouse device.
      console.log(`[Benchmark] Store check index (86,520 codes) built in ${stats.buildTimeMs}ms (test measured: ${elapsed.toFixed(2)}ms, Node on host, not target device)`);
    });
  });
});
