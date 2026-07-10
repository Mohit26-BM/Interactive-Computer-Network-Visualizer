// Logic smoke test for lib/stp-engine.ts — run with:
//   npx tsx scripts/verify-stp.mjs
import { simulateStp } from "../lib/stp-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function portsAt(step, linkId, switchLabel) {
  return step.ports.find((p) => p.linkId === linkId && p.switchLabel === switchLabel);
}

const converged = simulateStp(false);
const last = converged[converged.length - 1];

assert(last.rootBridge === "SW-1", "SW-1 (lowest priority) is elected root bridge");
assert(portsAt(last, "l-12", "SW-2").role === "root", "SW-2's port toward SW-1 is its root port");
assert(portsAt(last, "l-13", "SW-3").role === "root", "SW-3's port toward SW-1 is its root port");
assert(portsAt(last, "l-23", "SW-2").role === "designated", "On the non-root segment, SW-2 (lower priority) wins designated");
assert(portsAt(last, "l-23", "SW-3").role === "blocked", "SW-3's port on that same segment is blocked");

const oneBlockedPort = last.ports.filter((p) => p.role === "blocked");
assert(oneBlockedPort.length === 1, "Exactly one port is blocked — the loop is broken with a single cut, not more");

const failure = simulateStp(true);
const failLast = failure[failure.length - 1];
assert(portsAt(failLast, "l-23", "SW-3").role === "designated", "After the SW-1-SW-2 link fails, SW-3's previously-blocked port becomes designated");
assert(portsAt(failLast, "l-23", "SW-2").role === "root", "SW-2's new root port is the segment that was blocked before the failure");
assert(failure.some((s) => s.failedLinkId === "l-12"), "The failure scenario actually marks the SW-1-SW-2 link as failed at some step");

console.log("\nAll STP logic checks passed.");
