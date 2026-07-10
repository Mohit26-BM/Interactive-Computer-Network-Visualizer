// Logic smoke test for lib/vlan-engine.ts — run with:
//   npx tsx scripts/verify-vlan.mjs
import { buildVlanTopology } from "../lib/topology-engine.ts";
import { sendFrame } from "../lib/vlan-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const topology = buildVlanTopology();

const sameVlan = sendFrame(topology, "PC-1", "PC-2", false);
assert(sameVlan[sameVlan.length - 1].outcome === "delivered", "Same-VLAN traffic (PC-1 -> PC-2) is delivered");

const crossBlocked = sendFrame(topology, "PC-1", "PC-3", false);
assert(crossBlocked[crossBlocked.length - 1].outcome === "blocked", "Cross-VLAN traffic without a router is blocked");
assert(crossBlocked[crossBlocked.length - 1].phase === "error", "Blocked cross-VLAN frame is flagged as an error step");

const crossRouted = sendFrame(topology, "PC-1", "PC-3", true);
assert(crossRouted[crossRouted.length - 1].outcome === "delivered", "Cross-VLAN traffic with inter-VLAN routing enabled is delivered");
assert(crossRouted.some((s) => s.viaTrunk), "Cross-VLAN routed traffic crosses the trunk to the router");
assert(!sameVlan.some((s) => s.viaTrunk), "Same-VLAN traffic never touches the trunk — no reason to leave the switch");

console.log("\nAll VLAN logic checks passed.");
