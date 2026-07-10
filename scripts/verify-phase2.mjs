// Quick logic smoke test for Phase 2 engines — run with:
//   npx tsx scripts/verify-phase2.mjs
// (uses tsx so the TS lib files can be imported directly, no build step)
import { buildDefaultTopology, buildLanTopology } from "../lib/topology-engine.ts";
import { sendEthernetFrame } from "../lib/ethernet-engine.ts";
import { demoMacLearning } from "../lib/mac-learning-engine.ts";
import { arpResolve } from "../lib/arp-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- Ethernet: switch is transparent, router is a hard boundary ---
const topo = buildDefaultTopology(); // PC-1 - SW-1 - R-1 - SRV-1
const okSteps = sendEthernetFrame(topo, "PC-1", "R-1");
assert(okSteps[okSteps.length - 1].packet.fate === "delivered", "Ethernet PC-1->R-1 (via switch) delivers");

const blockedSteps = sendEthernetFrame(topo, "PC-1", "SRV-1");
assert(blockedSteps[0].phase === "error" && /router/i.test(blockedSteps[0].explanation), "Ethernet PC-1->SRV-1 (through router) is blocked with a clear reason");

// --- MAC learning: flood then forward ---
const lan = buildLanTopology(); // SW-1 + PC-1/2/3
const macSteps = demoMacLearning(lan, "SW-1", [["PC-1", "PC-2"], ["PC-2", "PC-1"], ["PC-1", "PC-2"]]);
const floodSteps = macSteps.filter((s) => /flood the frame/i.test(s.explanation));
const directSteps = macSteps.filter((s) => /forward directly, no flooding/i.test(s.explanation));
assert(floodSteps.length === 1, "Only the very first frame floods (destination not yet learned): got " + floodSteps.length);
assert(directSteps.length === 2, "The next two frames forward directly once learned: got " + directSteps.length);

// --- ARP: cache miss broadcasts, cache hit doesn't ---
const lan2 = buildLanTopology();
const first = arpResolve(lan2, {}, "PC-1", "PC-2");
assert(first.steps.some((s) => /Broadcast:/.test(s.explanation)), "First ARP resolve broadcasts");
const second = arpResolve(lan2, first.cache, "PC-1", "PC-2");
assert(!second.steps.some((s) => /Broadcast:/.test(s.explanation)), "Second ARP resolve (same pair) uses cache, no broadcast");
assert(second.steps.some((s) => /Cache hit/i.test(s.explanation)), "Second ARP resolve reports a cache hit");

console.log("\nAll Phase 2 logic checks passed.");
