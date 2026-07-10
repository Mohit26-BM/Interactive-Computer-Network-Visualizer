// Logic smoke test for lib/experiments/arp-timeout-lab.ts — run with:
//   npx tsx scripts/verify-arp-timeout-lab.mjs
import { buildLanTopology } from "../lib/topology-engine.ts";
import { simulateArpOverTime } from "../lib/experiments/arp-timeout-lab.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function broadcastCount(steps) {
  return new Set(steps.filter((s) => s.broadcastOccurred).map((s) => s.attemptIndex)).size;
}

const topology = buildLanTopology();

const shortTimeout = simulateArpOverTime(topology, "PC-1", "PC-2", 5, 4, 10);
assert(broadcastCount(shortTimeout) === 4, `A 5s timeout with a 10s gap forces a broadcast on every attempt: got ${broadcastCount(shortTimeout)}`);

const longTimeout = simulateArpOverTime(topology, "PC-1", "PC-2", 60, 4, 10);
assert(broadcastCount(longTimeout) === 1, `A 60s timeout with a 10s gap only broadcasts once (the first attempt), then stays cached: got ${broadcastCount(longTimeout)}`);

const summaryShort = shortTimeout[shortTimeout.length - 1];
assert(summaryShort.explanation.includes("4 of 4"), "Short-timeout run's summary reports 4 of 4 attempts needing a broadcast");

const summaryLong = longTimeout[longTimeout.length - 1];
assert(summaryLong.explanation.includes("1 of 4"), "Long-timeout run's summary reports 1 of 4 attempts needing a broadcast");

console.log("\nAll ARP Cache Timeout lab logic checks passed.");
