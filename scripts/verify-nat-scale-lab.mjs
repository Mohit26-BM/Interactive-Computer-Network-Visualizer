// Logic smoke test for lib/experiments/nat-scale-lab.ts — run with:
//   npx tsx scripts/verify-nat-scale-lab.mjs
import { buildNatTopology } from "../lib/topology-engine.ts";
import { simulateNatScale } from "../lib/experiments/nat-scale-lab.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const topology = buildNatTopology();

const five = simulateNatScale(topology, 5);
const fiveLast = five[five.length - 1];
assert(fiveLast.natTable.length === 5, `5 simulated devices produce exactly 5 NAT table entries: got ${fiveLast.natTable.length}`);
const uniquePublicIps = new Set(fiveLast.natTable.map((m) => m.insideGlobalIp));
assert(uniquePublicIps.size === 1, "All 5 devices share exactly one public IP");
const uniquePorts = new Set(fiveLast.natTable.map((m) => m.insideGlobalPort));
assert(uniquePorts.size === 5, "Each of the 5 devices gets a distinct public port");

const twenty = simulateNatScale(topology, 20);
assert(twenty[twenty.length - 1].natTable.length === 20, "20 simulated devices produce exactly 20 NAT table entries");

const one = simulateNatScale(topology, 1);
assert(one[one.length - 1].natTable.length === 1, "A single device still produces exactly 1 table entry");
assert(one.some((s) => s.deviceIndex === 0 && s.packet.layers.length > 0), "Device 1 gets a full hop-by-hop trace, not just a summary");

console.log("\nAll NAT Table Growth lab logic checks passed.");
