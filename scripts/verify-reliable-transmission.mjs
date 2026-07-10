// Logic smoke test for lib/reliable-transmission-engine.ts — run with:
//   npx tsx scripts/verify-reliable-transmission.mjs
import { compareReliableTransmission } from "../lib/reliable-transmission-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const TOTAL = 6;
const WINDOW = 4;
const LOSS = 1; // 0-indexed: segment "2"

const steps = compareReliableTransmission(TOTAL, WINDOW, LOSS);
const final = steps[steps.length - 1];

assert(final.gbn.every((s) => s.status === "acked"), "Every Go-Back-N segment ends up acked");
assert(final.sr.every((s) => s.status === "acked"), "Every Selective Repeat segment ends up acked");

// Go-Back-N must resend the whole window from the loss point onward (segments
// at index LOSS..WINDOW-1), on top of the original send of all WINDOW segments.
const expectedGbnResend = WINDOW - LOSS;
assert(final.gbnSent === WINDOW + expectedGbnResend + (TOTAL - WINDOW), "Go-Back-N's total sent count includes resending the whole window from the loss point: got " + final.gbnSent);

// Selective Repeat only ever resends the one lost segment.
assert(final.srSent === WINDOW + 1 + (TOTAL - WINDOW), "Selective Repeat's total sent count includes exactly one resend: got " + final.srSent);

assert(final.gbnSent > final.srSent, "Go-Back-N transmits strictly more segments than Selective Repeat for the same loss");

// At some intermediate step, a segment after the loss must be "buffered" in
// SR but not in GBN — that's the entire point of the comparison.
const divergenceStep = steps.find((s) => s.sr.some((seg) => seg.status === "buffered"));
assert(!!divergenceStep, "At some point, Selective Repeat buffers an out-of-order segment");
const gbnSameSegment = divergenceStep.gbn[divergenceStep.sr.findIndex((seg) => seg.status === "buffered")];
assert(gbnSameSegment.status !== "buffered", "Go-Back-N never buffers an out-of-order segment — it discards it instead");

// Invalid loss index (outside the first window) should fail gracefully, not crash.
const invalid = compareReliableTransmission(TOTAL, WINDOW, WINDOW + 1);
assert(invalid.length === 1 && invalid[0].phase === "error", "A loss index outside the first window is rejected with a clear error, not a crash");

console.log("\nAll Reliable Transmission logic checks passed.");
