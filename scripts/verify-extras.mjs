// Logic smoke test for the post-Phase-5 additions (IPv4 Fragmentation, NAT) —
// run with: npx tsx scripts/verify-extras.mjs
import { buildDefaultTopology, buildNatTopology } from "../lib/topology-engine.ts";
import { planFragments, sendFragmentedPacket } from "../lib/ipv4-fragmentation-engine.ts";
import { sendThroughNat, ROUTER_PUBLIC_IP } from "../lib/nat-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- Fragmentation: offsets land on 8-byte boundaries, sizes sum to the original ---
const plan = planFragments(4000, 1500);
assert(plan.length === 3, "A 4000-byte packet over a 1500-byte MTU splits into 3 fragments: got " + plan.length);
assert(plan.every((f) => f.offset % 8 === 0), "Every fragment offset is a multiple of 8 bytes");
assert(plan.slice(0, -1).every((f) => f.moreFragments), "Every fragment except the last has moreFragments set");
assert(!plan[plan.length - 1].moreFragments, "The last fragment has moreFragments unset");
const totalPlanned = plan.reduce((sum, f) => sum + f.length, 0);
assert(totalPlanned === 4000, "Fragment sizes sum back to the original 4000 bytes: got " + totalPlanned);

const topo = buildDefaultTopology();
const fitSteps = sendFragmentedPacket(topo, "PC-1", "SRV-1", 1000, 1500, false);
assert(fitSteps[fitSteps.length - 1].plan.length === 0, "A packet that already fits the MTU isn't fragmented at all");

const dfSteps = sendFragmentedPacket(topo, "PC-1", "SRV-1", 4000, 1500, true);
assert(dfSteps[dfSteps.length - 1].packet.fate === "dropped", "DF set + oversized packet is dropped, not fragmented");

const fragSteps = sendFragmentedPacket(topo, "PC-1", "SRV-1", 4000, 1500, false);
const finalFrag = fragSteps[fragSteps.length - 1];
assert(finalFrag.receivedOffsets.length === 3, "All 3 fragments are marked received by the end of the trace");
assert(/reassembles/.test(finalFrag.explanation), "The final step explicitly describes reassembly");

// --- NAT: private IP never appears past the router, PAT reuses/creates ports correctly ---
const natTopo = buildNatTopology();
const first = sendThroughNat(natTopo, "PC-1", "R-1", "SRV-PUBLIC", [], 51000);
const publicLeg = first.steps.find((s) => s.packet.layers[0]?.fields.srcIp === ROUTER_PUBLIC_IP);
assert(!!publicLeg, "The router rewrites the source to its public IP before the request continues toward the server");
assert(!first.steps.some((s) => s.packet.atNode === natTopo.devices.find((d) => d.label === "SRV-PUBLIC").id && s.packet.layers[0]?.fields.srcIp === "192.168.1.10"), "The private IP never appears in a packet already at the public server");
assert(first.table.length === 1, "A new NAT mapping is created for the first connection");

const finalStep = first.steps[first.steps.length - 1];
assert(finalStep.packet.fate === "delivered" && finalStep.packet.layers[0]?.fields.dstIp === "192.168.1.10", "The reply is translated back to the client's private IP before delivery");

const second = sendThroughNat(natTopo, "PC-1", "R-1", "SRV-PUBLIC", first.table, 51000);
assert(second.table.length === 1, "Resending from the same client port reuses the existing mapping instead of creating a new one");

const third = sendThroughNat(natTopo, "PC-1", "R-1", "SRV-PUBLIC", second.table, 51001);
assert(third.table.length === 2, "A different client port creates a second, distinct mapping");
assert(third.table[0].insideGlobalIp === third.table[1].insideGlobalIp && third.table[0].insideGlobalPort !== third.table[1].insideGlobalPort, "Both mappings share the same public IP but use different public ports (PAT)");

console.log("\nAll post-Phase-5 extras logic checks passed.");
