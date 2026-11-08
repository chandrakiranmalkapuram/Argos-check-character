#!/usr/bin/env node
/**
 * Voice Confusion Engine Benchmark Evaluation Harness
 *
 * Reads benchmark cases from benchmarks/voice_confusion_benchmark.jsonl,
 * evaluates each pair using the deterministic Voice Confusion Engine,
 * and prints detailed classification, tier, rank, and distance metrics.
 *
 * Usage:
 *   node --experimental-strip-types scripts/run_voice_confusion_benchmark.mjs
 *   or: npm run benchmark:voice
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestConfusions } from '../src/logic/voiceConfusion/engine.ts';
import { calculateStoreCheckChar } from '../src/logic/storeCalculator.ts';
import { calculateRfcCheckChar } from '../src/logic/rfcCalculator.ts';
import { SEED_REFERENCE_OBSERVATIONS } from '../src/logic/voiceConfusion/seedObservations.ts';
import { tokenizeStoreLocation } from '../src/logic/voiceConfusion/tokenizer.ts';
import { compareGappedAlignment } from '../src/logic/voiceConfusion/phonetics/comparators.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const benchmarkPath = path.resolve(__dirname, '../benchmarks/voice_confusion_benchmark.jsonl');

function getCheckChar(loc, mode) {
  if (mode === 'rfc') {
    const res = calculateRfcCheckChar(loc);
    return res.isValid ? res.checkChar : 'UNKNOWN';
  }
  const res = calculateStoreCheckChar(loc);
  return res.isValid ? res.checkChar : 'UNKNOWN';
}

function runBenchmark() {
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark dataset not found at ${benchmarkPath}`);
    process.exit(1);
  }

  const rawLines = fs.readFileSync(benchmarkPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  console.log('='.repeat(80));
  console.log('VOICE CONFUSION ENGINE - BENCHMARK EVALUATION REPORT');
  console.log('='.repeat(80));
  console.log(`Loaded ${rawLines.length} benchmark test cases from: ${path.relative(process.cwd(), benchmarkPath)}\n`);

  const results = [];
  let sameCheckCount = 0;
  let diffCheckCount = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const record = JSON.parse(rawLines[i]);
    const { a, b, mode = 'store', source, confused, count, date } = record;

    const checkA = getCheckChar(a, mode);
    const checkB = getCheckChar(b, mode);
    const isSameCheck = checkA === checkB && checkA !== 'UNKNOWN';

    if (isSameCheck) sameCheckCount++;
    else diffCheckCount++;

    // Evaluate via engine with seeded observations loaded
    const engineResult = suggestConfusions(a, {
      communityReports: SEED_REFERENCE_OBSERVATIONS
    });

    // Check candidate match
    const candidateIdx = engineResult.candidates.findIndex(c => c.location === b);
    const candidate = candidateIdx >= 0 ? engineResult.candidates[candidateIdx] : null;

    // Check reported pairs match
    const reportedPair = engineResult.reportedPairs.find(p => p.location === b);

    // Check different check report match
    const diffReport = engineResult.differentCheckCommunityReports.find(d => d.reportedLocation === b);

    // Compute pairwise acoustic alignment distance directly for reference
    const tokensA = tokenizeStoreLocation(a);
    const tokensB = tokenizeStoreLocation(b);
    const alignment = compareGappedAlignment(tokensA, tokensB);

    let classification = 'Unclassified';
    let tier = 'none';
    let rank = '-';

    if (candidate) {
      tier = candidate.tier;
      rank = `#${candidateIdx + 1} of ${engineResult.candidates.length}`;
      classification = `Ranked Candidate (${candidate.tier})`;
    } else if (reportedPair) {
      tier = 'reported_pair_only';
      classification = 'Reported Pair (Exceeds Tier 2/3 Token Caps)';
    } else if (diffReport) {
      tier = 'different_check';
      classification = 'Different-Check Report (Section e: Headset Rejection)';
    } else if (isSameCheck) {
      tier = 'arithmetic_pool';
      classification = 'Same-Check Collision (Arithmetic Pool)';
    }

    results.push({
      index: i + 1,
      a,
      b,
      mode,
      source,
      confused,
      count,
      date,
      checkA,
      checkB,
      isSameCheck,
      tier,
      rank,
      classification,
      meanDistance: alignment.meanDistance,
      totalDistance: alignment.totalDistance,
      explanation: candidate?.explanation || diffReport?.explanation || reportedPair?.explanation || 'Direct alignment'
    });
  }

  // Print results table
  console.log(
    '#'.padEnd(4) +
    'Pair (A -> B)'.padEnd(16) +
    'Same Check?'.padEnd(14) +
    'Check (A / B)'.padEnd(20) +
    'Mean Dist'.padEnd(12) +
    'Rank / Tier'.padEnd(22) +
    'Classification'
  );
  console.log('-'.repeat(105));

  for (const r of results) {
    const pairStr = `${r.a} -> ${r.b}`;
    const checkMatchStr = r.isSameCheck ? 'YES (same check)' : 'NO (diff check)';
    const checkCharStr = `${r.checkA} / ${r.checkB}`;
    const distStr = r.meanDistance.toFixed(4);
    const rankTierStr = r.rank !== '-' ? `${r.rank} (${r.tier})` : `(${r.tier})`;

    console.log(
      String(r.index).padEnd(4) +
      pairStr.padEnd(16) +
      checkMatchStr.padEnd(18) +
      checkCharStr.padEnd(20) +
      distStr.padEnd(12) +
      rankTierStr.padEnd(22) +
      r.classification
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK SUMMARY & METRICS');
  console.log('='.repeat(80));
  console.log(`Total Cases Evaluated:     ${results.length}`);
  console.log(`Same-Check Pairs:          ${sameCheckCount} (same-check pairs (not caught by the check-character step if the confusion occurred))`);
  console.log(`Different-Check Reports:   ${diffCheckCount} (different check character (would normally be rejected by the check-character step))`);

  const tierCounts = {};
  for (const r of results) {
    tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
  }
  console.log('\nClassification Breakdown:');
  for (const [t, cnt] of Object.entries(tierCounts)) {
    console.log(`  - ${t}: ${cnt}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('METHODOLOGY & FUTURE EVALUATION REQUIREMENTS');
  console.log('='.repeat(80));
  console.log(`
1. Real Warehouse Audio Transcripts:
   Current benchmark relies on reference examples (provenance seed_observation); not independent field data.
   Production validation requires time-aligned headset audio recordings and
   ASR acoustic model log-likelihood scores.

2. Negative Controls:
   Future iterations must include:
   a) Non-confused same-check pairs (to verify high specificity and low false positive rate).
   b) Acoustically close pairs with differing check characters (to verify the same-check gate).

3. Tuning vs. Held-Out Evaluation Sets:
   The current 7 seed pairs must remain in an immutable reference benchmark.
   New community reports should be partitioned into a parameter tuning set
   and a strictly held-out test set to avoid tuning acoustic weights to known samples.
`);
}

runBenchmark();
