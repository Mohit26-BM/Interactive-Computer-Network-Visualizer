// Logic smoke test for the Network Lab's direct-manipulation helpers — run with:
//   npx tsx scripts/verify-lab.mjs
import {
  buildDefaultTopology,
  topologyPlaceDevice,
  topologyRenameDevice,
  topologyAddLink,
  topologyRemoveLink,
  nextLabelForKind,
  checkConnectivity,
} from "../lib/topology-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- Auto-naming: increments per-kind, ignores other kinds' numbering ---
const topo = buildDefaultTopology(); // PC-1, SW-1, R-1, SRV-1
assert(nextLabelForKind(topo, "pc") === "PC-2", "Next PC label after PC-1 is PC-2");
assert(nextLabelForKind(topo, "router") === "R-2", "Next router label after R-1 is R-2");

// --- Placement: new device gets the exact clicked/dropped position, nobody else moves ---
const before = { ...topo.positions };
const placeSteps = topologyPlaceDevice(topo, "pc", 500, 250);
const placed = placeSteps[placeSteps.length - 1];
const newDevice = placed.state.devices.find((d) => d.label === "PC-2");
assert(!!newDevice, "Placed device is auto-named PC-2");
assert(placed.state.positions[newDevice.id].x === 500 && placed.state.positions[newDevice.id].y === 250, "Placed device lands exactly at the clicked point");
const untouched = topo.devices.every((d) => {
  const p1 = before[d.id], p2 = placed.state.positions[d.id];
  return p1.x === p2.x && p1.y === p2.y;
});
assert(untouched, "Every pre-existing device keeps its exact position after a new one is placed");

// --- Rename: rejects duplicates and empty names, otherwise updates in place ---
const pc1 = topo.devices.find((d) => d.label === "PC-1");
const dupSteps = topologyRenameDevice(topo, pc1.id, "SW-1");
assert(dupSteps[dupSteps.length - 1].phase === "error", "Renaming to an already-used label is rejected");
const renameSteps = topologyRenameDevice(topo, pc1.id, "DESKTOP-1");
const renamed = renameSteps[renameSteps.length - 1].state.devices.find((d) => d.id === pc1.id);
assert(renamed.label === "DESKTOP-1", "Rename applies the new label");

// --- Connectivity check: empty / isolated / split / fully-connected ---
const emptyResult = checkConnectivity({ devices: [], links: [], positions: {} });
assert(!emptyResult.ok && /No devices/.test(emptyResult.issues[0].reason), "Empty topology reports 'no devices'");

const isolatedTopo = placed.state; // PC-2 was placed with no links yet
const isolatedResult = checkConnectivity(isolatedTopo);
assert(!isolatedResult.ok, "A topology with an unconnected device is not ok");
assert(isolatedResult.issues.some((i) => i.reason.includes("PC-2") && i.suggestions.length > 0), "Isolated device issue names it and offers suggestions");

const connectedTopo = topologyAddLink(isolatedTopo, "PC-2", "SW-1").pop().state;
const connectedResult = checkConnectivity(connectedTopo);
assert(connectedResult.ok, "Connecting the isolated device resolves the connectivity check");

const splitTopo = topologyRemoveLink(connectedTopo, "SW-1", "R-1").pop().state; // PC-1/SW-1/PC-2 vs R-1/SRV-1
const splitResult = checkConnectivity(splitTopo);
assert(!splitResult.ok && splitResult.issues.some((i) => /split into 2 separate groups/.test(i.reason)), "Removing the bridging link is reported as two disconnected groups");

console.log("\nAll Network Lab logic checks passed.");
