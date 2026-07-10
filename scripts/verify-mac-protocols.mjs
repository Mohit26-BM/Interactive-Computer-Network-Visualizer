// Logic smoke test for lib/mac-protocols-engine.ts — run with:
//   npx tsx scripts/verify-mac-protocols.mjs
import { simulateAloha, simulateSlottedAloha, simulateCsma, simulateCsmaCd, simulateCsmaCa } from "../lib/mac-protocols-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function finalBars(steps) {
  return steps[steps.length - 1].bars;
}

// --- Pure ALOHA: overlapping attempts collide, non-overlapping ones succeed ---
const aloha = finalBars(simulateAloha());
const st1 = aloha.find((b) => b.station === 1);
const st2 = aloha.find((b) => b.station === 2);
const st3 = aloha.find((b) => b.station === 3);
const st4 = aloha.find((b) => b.station === 4);
assert(st1.outcome === "success", "ALOHA: Station 1 (alone) succeeds");
assert(st2.outcome === "collision" && st3.outcome === "collision", "ALOHA: Stations 2 and 3 (overlapping) both collide");
assert(st4.outcome === "success", "ALOHA: Station 4 (alone, later) succeeds");
assert(rangesOverlap(st2, st3), "ALOHA: the two colliding stations' timing actually overlaps (not just labeled that way)");

// --- Slotted ALOHA: same-slot attempts collide even though slots reduce the window ---
const slotted = finalBars(simulateSlottedAloha());
const sameSlot = slotted.filter((b) => b.station === 2 || b.station === 3);
assert(sameSlot.every((b) => b.outcome === "collision"), "Slotted ALOHA: two stations in the same slot both collide");
assert(slotted.find((b) => b.station === 1).outcome === "success" && slotted.find((b) => b.station === 4).outcome === "success", "Slotted ALOHA: stations alone in their own slot succeed");

// --- CSMA: deferral prevents one collision, simultaneous sensing still causes another ---
const csma = finalBars(simulateCsma());
assert(csma.find((b) => b.station === 1).outcome === "success" && csma.find((b) => b.station === 2).outcome === "success", "CSMA: sensing + deferral lets stations 1 and 2 both succeed without colliding");
assert(csma.find((b) => b.station === 3).outcome === "collision" && csma.find((b) => b.station === 4).outcome === "collision", "CSMA: simultaneous sensing still produces a collision between stations 3 and 4");

// --- CSMA/CD: the colliding pair aborts early (shorter duration than a full success) ---
const cd = finalBars(simulateCsmaCd());
const cdAborted = cd.filter((b) => b.outcome === "aborted");
assert(cdAborted.length === 2, "CSMA/CD: exactly 2 stations abort on the initial collision");
const cdSuccess = cd.filter((b) => b.outcome === "success");
assert(cdSuccess.length === 2, "CSMA/CD: both stations eventually retry successfully");
const successDuration = cdSuccess[0].end - cdSuccess[0].start;
const abortedDuration = cdAborted[0].end - cdAborted[0].start;
assert(abortedDuration < successDuration, "CSMA/CD: an aborted transmission is shorter than a full successful one — that's the entire point of early detection");

// --- CSMA/CA: the random-backoff spread avoids the collision CSMA had in the same setup ---
const ca = finalBars(simulateCsmaCa());
assert(ca.every((b) => b.outcome === "success"), "CSMA/CA: staggered backoffs mean nobody collides, unlike the equivalent CSMA scenario");

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

console.log("\nAll Medium Access Control logic checks passed.");
