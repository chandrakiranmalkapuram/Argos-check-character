import { describe, it, expect } from 'vitest';
import {
  PHONEME_FEATURE_TABLE,
  getPhonemeDistance
} from '../voiceConfusion/phonetics/articulatoryFeatures.ts';
import {
  NATO_LEXICON,
  LETTER_NAME_LEXICON,
  getTokenDistance
} from '../voiceConfusion/phonetics/lexicon.ts';
import {
  buildTokenDistanceMatrix,
  getFastTokenDistance
} from '../voiceConfusion/phonetics/tokenDistanceTable.ts';
import {
  compareFixedPosition,
  compareGappedAlignment
} from '../voiceConfusion/phonetics/comparators.ts';
import { tokenizeStoreLocation } from '../voiceConfusion/tokenizer.ts';

describe('Milestone 3: Phonetic Articulatory Distance & Comparators', () => {
  describe('1. Articulatory Feature & Distance Properties', () => {
    it('verifies identity of indiscernibles for all phonemes: dist(p, p) === 0', () => {
      for (const p of Object.keys(PHONEME_FEATURE_TABLE)) {
        expect(getPhonemeDistance(p, p)).toBe(0);
      }
    });

    it('verifies symmetry across all phoneme pairs: dist(p1, p2) === dist(p2, p1)', () => {
      const phonemes = Object.keys(PHONEME_FEATURE_TABLE);
      for (let i = 0; i < phonemes.length; i++) {
        for (let j = i + 1; j < phonemes.length; j++) {
          const d1 = getPhonemeDistance(phonemes[i], phonemes[j]);
          const d2 = getPhonemeDistance(phonemes[j], phonemes[i]);
          expect(d1, `Symmetry between ${phonemes[i]} and ${phonemes[j]}`).toBe(d2);
        }
      }
    });

    it('verifies non-negativity across all phoneme pairs: dist(p1, p2) >= 0', () => {
      const phonemes = Object.keys(PHONEME_FEATURE_TABLE);
      for (const p1 of phonemes) {
        for (const p2 of phonemes) {
          expect(getPhonemeDistance(p1, p2)).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('verifies intuitive articulatory acoustic distance relationships', () => {
      // Voicing contrast: /p/ vs /b/ (bilabial plosives) should be closer than /p/ vs /s/ (fricative alveolar)
      const p_b = getPhonemeDistance('p', 'b');
      const p_s = getPhonemeDistance('p', 's');
      expect(p_b).toBeLessThan(p_s);

      // Place contrast: /t/ vs /d/ (alveolar plosives) closer than /t/ vs /k/ (velar plosive)
      const t_d = getPhonemeDistance('t', 'd');
      const t_k = getPhonemeDistance('t', 'k');
      expect(t_d).toBeLessThan(t_k);

      // Vowel vs consonant boundary penalty
      const i_t = getPhonemeDistance('iː', 't');
      expect(i_t).toBe(1.0);
    });
  });

  describe('2. Lexicon & Mode Separation', () => {
    it('verifies UK ZED in letter-name mode vs ZULU in NATO mode', () => {
      const zNato = NATO_LEXICON.ZULU;
      expect(zNato).toBeDefined();
      expect(zNato[0]).toEqual(['z', 'uː', 'l', 'uː']);

      const zLetter = LETTER_NAME_LEXICON.Z;
      expect(zLetter).toBeDefined();
      // UK ZED: /zɛd/
      expect(zLetter[0]).toEqual(['z', 'e', 'd']);

      // Modes are strictly separate and never mixed
      const natoDistance = getTokenDistance('ZULU', 'ZULU', 'nato');
      expect(natoDistance).toBe(0);

      const letterDistance = getTokenDistance('Z', 'Z', 'letter_names');
      expect(letterDistance).toBe(0);

      // Z does not exist in NATO lexicon
      expect(getTokenDistance('Z', 'ZULU', 'nato')).toBe(1.0);
    });

    it('verifies all NATO active vocabulary tokens are present in the lexicon', () => {
      const expectedWords = [
        'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
        'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
        'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA',
        'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY',
        'X-RAY', 'YANKEE', 'ZULU',
        'JEWELLERY', 'SECURITY', 'LINBIN', 'BULK', 'CASH OFFICE', 'COLLECTION POINT',
        'AFTER', 'BEFORE'
      ];

      for (const word of expectedWords) {
        expect(NATO_LEXICON[word], `Lexicon entry for ${word}`).toBeDefined();
        expect(NATO_LEXICON[word].length).toBeGreaterThan(0);
      }
    });

    it('verifies fast precomputed token distance table matches direct getTokenDistance', () => {
      const matrix = buildTokenDistanceMatrix('nato');
      expect(matrix.tokens.length).toBe(Object.keys(NATO_LEXICON).length);

      for (const tA of matrix.tokens.slice(0, 10)) {
        for (const tB of matrix.tokens.slice(0, 10)) {
          const fast = getFastTokenDistance(tA, tB);
          const direct = getTokenDistance(tA, tB, 'nato');
          expect(fast, `Distance between ${tA} and ${tB}`).toBe(direct);
        }
      }
    });
  });

  describe('3. Evaluation of Fixed-Position (A) vs Gapped-Alignment (B) Comparators', () => {
    const testPairs: Array<{ label: string; a: string; b: string }> = [
      // 7 Seed Observations from migration 4
      { label: 'Seed 1 (same check char)', a: '08MN', b: '20AN' },
      { label: 'Seed 2 (same check char)', a: '16ZG', b: '16JA' },
      { label: 'Seed 3 (same check char)', a: '81ZE', b: '50ER' },
      { label: 'Seed 4 (same check char, Bulk prefix)', a: '01MM', b: 'Z01B' },
      { label: 'Seed 5 (same check char, Jewellery prefix)', a: 'J7AZ', b: '07AZ' },
      { label: 'Seed 6 (different check char, Security prefix)', a: 'S1PG', b: '01PG' },
      { label: 'Seed 7 (different check char, transposition)', a: '10AK', b: '10KA' },

      // Regression Examples
      { label: 'Regression: 21EZ vs 11BZ', a: '21EZ', b: '11BZ' },
      { label: 'Regression: 10AK vs 10BZ', a: '10AK', b: '10BZ' },
      { label: 'Regression: 10AK vs 10HL', a: '10AK', b: '10HL' }
    ];

    it('evaluates and logs comparison results on all seed pairs and regression cases', () => {
      const evaluationTable: Array<{
        label: string;
        pair: string;
        fixedTotal: number;
        fixedMean: number;
        gappedTotal: number;
        gappedMean: number;
        gappedAlignment: string;
      }> = [];

      for (const item of testPairs) {
        const tokensA = tokenizeStoreLocation(item.a);
        const tokensB = tokenizeStoreLocation(item.b);

        const resFixed = compareFixedPosition(tokensA, tokensB);
        const resGapped = compareGappedAlignment(tokensA, tokensB);

        // Sanity assertions
        expect(resFixed.totalDistance).toBeGreaterThanOrEqual(0);
        expect(resGapped.totalDistance).toBeGreaterThanOrEqual(0);

        // Gapped alignment total distance is always <= fixed position distance
        expect(resGapped.totalDistance).toBeLessThanOrEqual(resFixed.totalDistance + 1e-4);

        const alignStr = resGapped.alignment
          .map(p => `[${p.tokenA ?? '-'} <-> ${p.tokenB ?? '-'}: ${p.distance.toFixed(2)}]`)
          .join(' ');

        evaluationTable.push({
          label: item.label,
          pair: `${item.a} vs ${item.b}`,
          fixedTotal: resFixed.totalDistance,
          fixedMean: resFixed.meanDistance,
          gappedTotal: resGapped.totalDistance,
          gappedMean: resGapped.meanDistance,
          gappedAlignment: alignStr
        });
      }

      console.log('\n=== COMPARATOR EVALUATION TABLE ===');
      for (const row of evaluationTable) {
        console.log(`${row.pair} (${row.label})`);
        console.log(`  Fixed-Position: Total=${row.fixedTotal}, Mean=${row.fixedMean}`);
        console.log(`  Gapped-Align  : Total=${row.gappedTotal}, Mean=${row.gappedMean}`);
        console.log(`  Alignment     : ${row.gappedAlignment}\n`);
      }
    });

    it('verifies 21EZ vs 11BZ is evaluated and is NOT classed as strong', () => {
      const tokens21 = tokenizeStoreLocation('21EZ');
      const tokens11 = tokenizeStoreLocation('11BZ');

      const resFixed = compareFixedPosition(tokens21, tokens11);
      const resGapped = compareGappedAlignment(tokens21, tokens11);

      // TWO vs ONE: dist ~0.8
      // ECHO vs BRAVO: dist ~0.6-0.7
      // Total distance is well above a close sound-alike (which would be near 0.2 - 0.4)
      expect(resFixed.totalDistance).toBeGreaterThan(1.0);
      expect(resGapped.totalDistance).toBeGreaterThan(1.0);
    });

    it('computes and logs the pairwise distance distribution across all lexicon tokens', () => {
      const matrix = buildTokenDistanceMatrix('nato');
      const tokens = matrix.tokens;
      const distances: number[] = [];

      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          distances.push(matrix.lookup(tokens[i], tokens[j]));
        }
      }

      distances.sort((a, b) => a - b);
      const n = distances.length;
      const min = distances[0];
      const max = distances[n - 1];
      const sum = distances.reduce((acc, d) => acc + d, 0);
      const mean = sum / n;

      const p10 = distances[Math.floor(n * 0.10)];
      const p25 = distances[Math.floor(n * 0.25)];
      const p50 = distances[Math.floor(n * 0.50)]; // median
      const p75 = distances[Math.floor(n * 0.75)];
      const p90 = distances[Math.floor(n * 0.90)];

      console.log('\n=== LEXICON PAIRWISE DISTANCE DISTRIBUTION (N=' + n + ') ===');
      console.log(`Min: ${min.toFixed(4)}, Max: ${max.toFixed(4)}, Mean: ${mean.toFixed(4)}`);
      console.log(`p10: ${p10.toFixed(4)}, p25: ${p25.toFixed(4)}, p50: ${p50.toFixed(4)}, p75: ${p75.toFixed(4)}, p90: ${p90.toFixed(4)}`);

      expect(n).toBe((tokens.length * (tokens.length - 1)) / 2);
      expect(min).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(1.0);
    });
  });
});
