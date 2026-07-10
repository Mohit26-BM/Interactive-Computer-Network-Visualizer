// Logic smoke test for lib/experiments/routing-whatif-lab.ts — run with:
//   npx tsx scripts/verify-routing-whatif-lab.mjs
import { buildRoutingTopology } from "../lib/topology-engine.ts";
import { simulateRoutingWhatIf } from "../lib/experiments/routing-whatif-lab.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const topology = buildRoutingTopology();
const linkAC = topology.links.find((l) => {
  const a = topology.devices.find((d) => d.id === l.from)?.label;
  const b = topology.devices.find((d) => d.id === l.to)?.label;
  return (a === "R-A" && b === "R-C") || (a === "R-C" && b === "R-A");
});
const linkCD = topology.links.find((l) => {
  const a = topology.devices.find((d) => d.id === l.from)?.label;
  const b = topology.devices.find((d) => d.id === l.to)?.label;
  return (a === "R-C" && b === "R-D") || (a === "R-D" && b === "R-C");
});
const routerC = topology.devices.find((d) => d.label === "R-C");

// Baseline shortest path R-A -> R-E is cost 6 via A-C-D-E (2+1+3=6), cheaper than A-B-E (4+6=10) or A-B-D-E (4+5+3=12).
const failCD = simulateRoutingWhatIf(topology, { type: "failLink", linkId: linkCD.id });
const failCDSummary = failCD[failCD.length - 1];
assert(failCDSummary.explanation.includes("cost 6"), "Baseline R-A -> R-E cost is reported as 6 (via A-C-D-E)");
assert(!failCDSummary.explanation.includes("After: cost 6"), "Failing the C-D link changes the R-A -> R-E cost away from 6");

const reweight = simulateRoutingWhatIf(topology, { type: "reweight", linkId: linkAC.id, newWeight: 50 });
const reweightSummary = reweight[reweight.length - 1];
assert(reweightSummary.explanation.includes("reweighting"), "Reweight scenario's summary describes it as a reweighting change");
assert(!reweightSummary.explanation.includes("After: cost 6"), "Making A-C very expensive changes the shortest path away from the original cost-6 route");

const failRouter = simulateRoutingWhatIf(topology, { type: "failRouter", deviceId: routerC.id });
const failRouterSummary = failRouter[failRouter.length - 1];
assert(failRouterSummary.explanation.includes("failing R-C"), "Router-failure scenario's summary names the failed router");
assert(!failRouterSummary.explanation.includes("After: cost 6"), "Failing R-C (on the shortest path) changes the R-A -> R-E cost");

console.log("\nAll Routing What-If lab logic checks passed.");
