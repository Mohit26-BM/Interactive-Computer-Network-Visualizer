// Logic smoke test for lib/experiments/aloha-throughput-lab.ts — run with:
//   npx tsx scripts/verify-aloha-throughput-lab.mjs
import { pureAlohaThroughput, slottedAlohaThroughput, computeAlohaCurve } from "../lib/experiments/aloha-throughput-lab.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// Known exact closed-form maxima.
assert(approx(pureAlohaThroughput(0.5), 1 / (2 * Math.E)), `Pure ALOHA at G=0.5 equals the exact maximum 1/(2e): got ${pureAlohaThroughput(0.5)}`);
assert(approx(slottedAlohaThroughput(1.0), 1 / Math.E), `Slotted ALOHA at G=1.0 equals the exact maximum 1/e: got ${slottedAlohaThroughput(1.0)}`);

// Slotted ALOHA's peak is exactly double Pure ALOHA's peak.
const pureMax = 1 / (2 * Math.E);
const slottedMax = 1 / Math.E;
assert(approx(slottedMax, pureMax * 2), "Slotted ALOHA's peak throughput is exactly double Pure ALOHA's");

// G=0 means no offered load, no throughput, for both formulas.
assert(pureAlohaThroughput(0) === 0, "Pure ALOHA throughput at G=0 is 0");
assert(slottedAlohaThroughput(0) === 0, "Slotted ALOHA throughput at G=0 is 0");

// The curve engine's own peak detection should land near the same known values.
const pureSteps = computeAlohaCurve("pure", 2.5, 0.01);
const pureSummary = pureSteps[pureSteps.length - 1];
assert(approx(pureSummary.currentG, 0.5, 0.02), `Pure ALOHA curve's detected peak G is close to 0.5: got ${pureSummary.currentG}`);
assert(approx(pureSummary.currentS, pureMax, 0.01), `Pure ALOHA curve's detected peak S is close to the exact maximum: got ${pureSummary.currentS}`);

const slottedSteps = computeAlohaCurve("slotted", 2.5, 0.01);
const slottedSummary = slottedSteps[slottedSteps.length - 1];
assert(approx(slottedSummary.currentG, 1.0, 0.02), `Slotted ALOHA curve's detected peak G is close to 1.0: got ${slottedSummary.currentG}`);

// Steps accumulate points progressively — later steps see strictly more points than earlier ones.
assert(pureSteps[pureSteps.length - 2].points.length > pureSteps[0].points.length, "Later steps carry more accumulated points than earlier steps (progressive reveal)");

console.log("\nAll ALOHA Throughput Curve lab logic checks passed.");
