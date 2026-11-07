import { describe, it } from 'vitest';
import { suggestConfusions, MAX_DIFFERING_TOKENS_TIER2, MAX_DIFFERING_TOKENS_TIER3 } from '../voiceConfusion/engine.ts';
import { enumerateGrammarLocations, parseLocationCode } from '../voiceConfusion/grammar.ts';
import { calculateStoreCheckChar } from '../storeCalculator.ts';

declare const process: { env: Record<string, string | undefined> };

describe('Milestone 4 Decision Census Analysis (Item 5 & STOP POINT 4)', () => {
  const isFull = process.env.FULL_TEST_SUITE === '1';

  // Heavy 1,000-input census runs exclusively in opt-in full test suite (npm run test:full)
  it.skipIf(!isFull)(
    'computes 1,000-input census for caps 2, 3, and 4 and evaluates Tier 3 ceiling at 0.70',
    () => {
      const allCodes = enumerateGrammarLocations();

      // Deterministic PRNG LCG (seed = 42)
      let seed = 42;
      function lcg() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      const sample1000: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const idx = Math.floor(lcg() * allCodes.length);
        sample1000.push(allCodes[idx]);
      }

      function calcStats(arr: number[]) {
        if (arr.length === 0) return { min: 0, median: 0, p90: 0, max: 0, mean: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const n = sorted.length;
        return {
          median: sorted[Math.floor(n * 0.5)],
          p90: sorted[Math.floor(n * 0.9)],
          max: sorted[n - 1]
        };
      }

      console.log('\n======================================================');
      console.log('1,000-INPUT FIXED-SEED (42) CENSUS FOR CAPS 2, 3, AND 4');
      console.log('======================================================');

      const caps = [2, 3, 4] as const;

      for (const cap of caps) {
        const t2Sizes: number[] = [];
        const t3Sizes: number[] = [];
        let emptyT1T2Count = 0;

        for (const code of sample1000) {
          const res = suggestConfusions(code, {
            maxDifferingTokensTier2: cap,
            maxDifferingTokensTier3: cap
          });

          const t1 = res.candidates.filter(c => c.tier === 'tier1_reported').length;
          const t2 = res.candidates.filter(c => c.tier === 'tier2_model_similar').length;
          const t3 = res.candidates.filter(c => c.tier === 'tier3_possible').length;

          t2Sizes.push(t2);
          t3Sizes.push(t3);

          if (t1 + t2 === 0) {
            emptyT1T2Count++;
          }
        }

        const t2Stat = calcStats(t2Sizes);
        const t3Stat = calcStats(t3Sizes);
        const emptyFrac = ((emptyT1T2Count / 1000) * 100).toFixed(2);

        console.log(`\n--- Cap = ${cap} ---`);
        console.log(`Tier 2 size: median = ${t2Stat.median}, p90 = ${t2Stat.p90}, max = ${t2Stat.max}`);
        console.log(`Tier 3 size: median = ${t3Stat.median}, p90 = ${t3Stat.p90}, max = ${t3Stat.max}`);
        console.log(`Fraction of inputs with empty Tier 1+2 list: ${emptyT1T2Count} / 1000 (${emptyFrac}%)`);
      }

      // Census for Tier 3 far-token ceiling at vocabulary median (0.70)
      console.log('\n--- Tier 3 with Far Token <= 0.70 (Vocabulary Median) Evaluation ---');
      for (const cap of caps) {
        const t3SizesCapped: number[] = [];
        for (const code of sample1000) {
          const res = suggestConfusions(code, {
            maxDifferingTokensTier2: cap,
            maxDifferingTokensTier3: cap,
            maxFarTokenDistanceTier3: 0.70
          });
          const t3 = res.candidates.filter(c => c.tier === 'tier3_possible').length;
          t3SizesCapped.push(t3);
        }
        const t3Stat = calcStats(t3SizesCapped);
        console.log(`Cap ${cap} + Far Token <= 0.70: Tier 3 size: median = ${t3Stat.median}, p90 = ${t3Stat.p90}, max = ${t3Stat.max}`);
      }
    },
    60_000
  );

  it('evaluates target pairs and lists Tier 2 candidates for J7AZ and S1PG under configured caps (Cap 2)', () => {
    console.log('\n======================================================');
    console.log(`TARGET PAIRS EVALUATION (ENGINE DEFAULTS: T2_CAP=${MAX_DIFFERING_TOKENS_TIER2}, T3_CAP=${MAX_DIFFERING_TOKENS_TIER3})`);
    console.log('======================================================');

    const targetPairs: [string, string][] = [
      ['21EZ', '11BZ'],
      ['10AK', '10BZ'],
      ['10AK', '10HL'],
      ['10AK', '10DD'],
      ['21EZ', '21DK'],
      ['J7AZ', '07AZ'],
      ['16ZG', '16JA'],
      ['01MM', 'Z01B']
    ];

    for (const [codeA, codeB] of targetPairs) {
      // Default configured engine run (cap = 2)
      const res = suggestConfusions(codeA);
      const cand = res.candidates.find(c => c.location === codeB);
      const tier = cand ? cand.tier : 'not visible (arithmetic collision)';
      const dist = cand ? `dist = ${cand.totalDistance.toFixed(2)}` : '';
      console.log(`Pair: ${codeA.padEnd(5)} / ${codeB.padEnd(5)} -> ${tier.padEnd(20)} ${dist}`);
    }

    console.log('\n======================================================');
    console.log(`TIER 2 CANDIDATE LISTS FOR J7AZ AND S1PG (CAP = 2)`);
    console.log('======================================================');

    for (const loc of ['J7AZ', 'S1PG']) {
      const res = suggestConfusions(loc);
      const t2 = res.candidates.filter(c => c.tier === 'tier2_model_similar');
      const listStr = t2.length > 0
        ? t2.map(c => `${c.location} (${c.totalDistance.toFixed(2)})`).join(', ')
        : '(none)';
      console.log(`Input: ${loc} (count = ${t2.length}) -> Tier 2: ${listStr}`);
    }
  });

  it('generates real calculator check characters and engine messages for over-4-char inputs (Item 2 & 6)', () => {
    const testInputs = ['10AKX', 'INVALID123', 'LONGSTRING', 'ABCDE'];

    console.log('\n======================================================');
    console.log('OVER-4-CHARACTER INPUTS: CALCULATOR VS ENGINE OUTPUT');
    console.log('======================================================');

    for (const raw of testInputs) {
      const calc = calculateStoreCheckChar(raw);
      const parsed = parseLocationCode(raw);
      const engineRes = suggestConfusions(raw);

      console.log(`Input: "${raw}"`);
      console.log(`  Calculator: candidate4="${raw.trim().toUpperCase().slice(0, 4)}", checkChar="${calc.checkChar}", spokenText="${calc.spokenText}", isValid=${calc.isValid}`);
      console.log(`  Engine: kind="${parsed.kind}", reason="${parsed.kind === 'unsupported' ? parsed.reason : 'N/A'}"`);
      console.log(`  Message: "${parsed.kind === 'unsupported' ? parsed.message : ''}"`);
      console.log(`  Engine SuggestionResult: isValid=${engineRes.isValid}, errorMessage="${engineRes.errorMessage}"`);
    }
  });

  it('generates reportedPairs output for 7 seed inputs plus reverse direction (Item 4)', () => {
    const seedInputs = ['08MN', '16ZG', '81ZE', '01MM', 'J7AZ', 'S1PG', '10AK'];

    console.log('\n======================================================');
    console.log('REPORTED PAIRS OUTPUT FOR 7 SEED INPUTS (ITEM 4)');
    console.log('======================================================');

    for (const input of seedInputs) {
      const res = suggestConfusions(input);
      console.log(`\nInput Location: ${input} (Check: ${res.checkChar ?? 'N/A'})`);
      console.log(`  reportedPairs count: ${res.reportedPairs.length}`);
      for (const entry of res.reportedPairs) {
        console.log(`    - reportedLocation: ${entry.reportedLocation}, checkChar: ${entry.checkChar}, status: ${entry.status}, provenance: ${entry.provenance}, label: "${entry.label}", direction: ${entry.direction}`);
      }
      console.log(`  differentCheckCommunityReports count: ${res.differentCheckCommunityReports.length}`);
      for (const diff of res.differentCheckCommunityReports) {
        console.log(`    - reportedLocation: ${diff.reportedLocation}, reportedCheckChar: ${diff.reportedCheckChar}, explanation: "${diff.explanation}"`);
      }
    }

    // Reverse direction test where input is the found location of a seed
    // Seed 1: voiced = '08MN', found = '20AN'. Both check = 'BRAVO'.
    // Test input = '20AN'
    console.log('\n--- Reverse Direction Test: Input = "20AN" (found location of 08MN) ---');
    const resReverse = suggestConfusions('20AN');
    console.log(`Input: 20AN (Check: ${resReverse.checkChar})`);
    console.log(`  reportedPairs count: ${resReverse.reportedPairs.length}`);
    for (const entry of resReverse.reportedPairs) {
      console.log(`    - reportedLocation: ${entry.reportedLocation}, checkChar: ${entry.checkChar}, status: ${entry.status}, provenance: ${entry.provenance}, label: "${entry.label}", direction: ${entry.direction}`);
    }
    // Verify 08MN did NOT get tier elevation
    const cand08MN = resReverse.candidates.find(c => c.location === '08MN');
    console.log(`  Candidate 08MN tier in 20AN search: ${cand08MN ? cand08MN.tier : 'arithmetic collision (not visible)'}`);
  });
});
