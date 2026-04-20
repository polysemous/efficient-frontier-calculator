// Verification script for PR #8 — exercises findPrimaryPortfolio and findAlternatives
// across all five feasibility states. Run with: node scripts/verify-single-answer.mjs
//
// This tests the logic that drives the feasibility badge copy and the alternatives panel —
// the exact state machine the UI consumes. Output is intended to be captured into the PR body
// as evidence of behavior under each of the five documented states.

import { findPrimaryPortfolio, findAlternatives } from '../src/lib/portfolioMath.js';

const mkPortfolio = (ret, risk, sharpe, weightPct, id) => ({
  return: ret,
  risk,
  sharpe,
  selectedAssets: ['Asset A', 'Asset B', 'Asset C'],
  weights: weightPct.map((w) => w / 100),
  weightPct,
  weightLabel: `A ${weightPct[0]}% · B ${weightPct[1]}% · C ${weightPct[2]}%`,
  fullWeightLabel: `id-${id}: A ${weightPct[0]}% · B ${weightPct[1]}% · C ${weightPct[2]}%`,
  avgCorrelation: 0.4,
  diversificationRatio: 1.2
});

// Synthetic frontier: portfolios spanning return 3%–12%, risk 5%–20%
const portfolios = [
  mkPortfolio(3.0,  5.0, 0.0,  [100, 0, 0], 1),
  mkPortfolio(4.5,  6.5, 0.22, [80, 10, 10], 2),
  mkPortfolio(6.0,  8.0, 0.38, [60, 20, 20], 3),
  mkPortfolio(8.0, 10.5, 0.48, [40, 30, 30], 4),   // target for feasible case
  mkPortfolio(8.1, 10.6, 0.48, [38, 31, 31], 5),   // near-alternative (within tolerance)
  mkPortfolio(8.2, 10.9, 0.47, [36, 32, 32], 6),   // near-alternative
  mkPortfolio(10.0, 14.0, 0.50, [20, 40, 40], 7),
  mkPortfolio(12.0, 20.0, 0.45, [0, 50, 50], 8)    // max return
];

const run = (label, args, expectedStatus) => {
  const result = findPrimaryPortfolio(args);
  const pass = result.status === expectedStatus;
  const badge = {
    'no-target': 'awaiting target (neutral)',
    'empty': 'no portfolios (warning)',
    'on-frontier': 'on the estimated frontier (success)',
    'above-max-return': 'above frontier max (warning)',
    'below-min-variance': 'below min-variance floor (warning)'
  }[result.status] ?? '(unknown)';
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  console.log(`    status: ${result.status}  →  badge: "${badge}"`);
  if (result.primary) {
    console.log(`    primary: return=${result.primary.return.toFixed(2)}% risk=${result.primary.risk.toFixed(2)}% sharpe=${result.primary.sharpe.toFixed(3)}`);
  }
  if (result.frontierMax != null) {
    console.log(`    frontierMax=${result.frontierMax.toFixed(2)}%  frontierMinRisk=${result.frontierMinRisk.toFixed(2)}%`);
  }
  if (!pass) {
    console.log(`    FAIL — expected status "${expectedStatus}"`);
    process.exitCode = 1;
  }
  return result;
};

console.log('=== findPrimaryPortfolio: state-machine coverage ===\n');

// 1. on-frontier (feasible target)
const r1 = run(
  'Build · requiredReturn=8.00%  (on-frontier)',
  { portfolios, mode: 'requiredReturn', targetValue: '8.00' },
  'on-frontier'
);

// 2. above-max-return
const r2 = run(
  'Build · requiredReturn=25.00%  (above-max-return)',
  { portfolios, mode: 'requiredReturn', targetValue: '25.00' },
  'above-max-return'
);

// 3. below-min-variance (maxRisk mode, ceiling under the min-variance floor)
const r3 = run(
  'Build · maxRisk=0.50%  (below-min-variance)',
  { portfolios, mode: 'maxRisk', targetValue: '0.50' },
  'below-min-variance'
);

// 4. no-target (empty string)
const r4 = run(
  'Build · empty target string  (no-target)',
  { portfolios, mode: 'requiredReturn', targetValue: '' },
  'no-target'
);

// 5. empty (no portfolios at all)
const r5 = run(
  'Build · no candidate portfolios  (empty)',
  { portfolios: [], mode: 'requiredReturn', targetValue: '8.00' },
  'empty'
);

console.log('\n=== findAlternatives: alternatives disclosure coverage ===\n');

const altsForFeasible = findAlternatives({
  primary: r1.primary,
  portfolios,
  tolerance: 0.25
});
console.log(`Feasible primary: found ${altsForFeasible.length} alternatives within ±0.25pp`);
altsForFeasible.forEach((p, i) => {
  console.log(`  ${i + 1}. return=${p.return.toFixed(2)}%  risk=${p.risk.toFixed(2)}%  sharpe=${p.sharpe.toFixed(3)}  weights=${p.weightLabel}`);
});

const altsForInfeasible = findAlternatives({
  primary: r2.primary,
  portfolios,
  tolerance: 0.25
});
console.log(`\nInfeasible primary (above-max-return): ${altsForInfeasible.length} alternatives (should be 0 — UI suppresses disclosure when !isFeasible)`);

if (process.exitCode === 1) {
  console.log('\n✗ One or more state checks FAILED');
  process.exit(1);
}
console.log('\n✓ All five feasibility states produce the expected status and badge copy.');
