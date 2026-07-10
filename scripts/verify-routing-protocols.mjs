// Logic smoke test for lib/routing-protocols-engine.ts — run with:
//   npx tsx scripts/verify-routing-protocols.mjs
import { buildRoutingTopology } from "../lib/topology-engine.ts";
import { simulateRip, simulateOspf } from "../lib/routing-protocols-engine.ts";
import { dijkstra } from "../lib/routing-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const topology = buildRoutingTopology();
const byLabel = (l) => topology.devices.find((d) => d.label === l);

// --- RIP: hop count, not weighted cost ---
const rip = simulateRip(topology, "R-A");
const ripLast = rip[rip.length - 1];
assert(ripLast.phase === "found", "RIP simulation ends in a converged/found state");
assert(ripLast.distances[byLabel("R-A").id] === 0, "RIP: start router's hop count to itself is 0");
// R-A's direct neighbors (A-B, A-C) are 1 hop; R-D and R-E are 2 hops in this mesh.
assert(ripLast.distances[byLabel("R-B").id] === 1, "RIP: R-B (direct neighbor) is 1 hop from R-A");
assert(ripLast.distances[byLabel("R-C").id] === 1, "RIP: R-C (direct neighbor) is 1 hop from R-A");
assert(ripLast.distances[byLabel("R-D").id] === 2, "RIP: R-D is 2 hops from R-A (via B or C), regardless of link weight");
assert(rip.length > 2, "RIP takes multiple rounds to converge (not a single-shot computation)");

// --- OSPF: same weighted shortest-path result as plain Dijkstra ---
const ospf = simulateOspf(topology, "R-A");
const plainDijkstra = dijkstra(topology, "R-A");
const ospfLast = ospf[ospf.length - 1];
const dijkstraLast = plainDijkstra[plainDijkstra.length - 1];
for (const d of topology.devices) {
  assert(ospfLast.distances[d.id] === dijkstraLast.distances[d.id], `OSPF's final cost to ${d.label} matches plain Dijkstra's (${dijkstraLast.distances[d.id]})`);
}
assert(ospf.length === plainDijkstra.length + 1, "OSPF adds exactly one flood/preamble step on top of Dijkstra's own steps");

console.log("\nAll Routing Protocols logic checks passed.");
