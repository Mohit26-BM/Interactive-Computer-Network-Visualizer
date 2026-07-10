import { Step } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

// mac -> id of the device the switch learned it through
export type MacTable = Record<string, string>;

export interface MacLearningStep extends Step {
  topology: TopologyState;
  macTable: MacTable;
  highlightDevices: string[];
  highlightLinks: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function st(
  topology: TopologyState,
  macTable: MacTable,
  explanation: string,
  hl: number,
  hd: string[] = [],
  hlk: string[] = [],
  phase?: string
): MacLearningStep {
  return { topology, macTable: { ...macTable }, explanation, highlightLine: hl, highlightDevices: hd, highlightLinks: hlk, phase };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function linkBetween(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

// ─── Run a sequence of frames through one switch, learning as it goes ───────
// The switch starts with an empty table every run — exactly like a real one
// does after a power cycle. Feed it the same two hosts twice and watch it
// stop flooding the second time.

export function demoMacLearning(topology: TopologyState, switchLabel: string, frames: [string, string][]): MacLearningStep[] {
  const steps: MacLearningStep[] = [];
  const table: MacTable = {};

  const sw = findDevice(topology, switchLabel);
  if (!sw) {
    steps.push(st(topology, table, `Switch "${switchLabel}" does not exist.`, 1, [], [], "error"));
    return steps;
  }

  steps.push(st(topology, table, `${switchLabel} powers on with an empty MAC address table.`, 1, [sw.id]));

  for (const [fromLabel, toLabel] of frames) {
    const from = findDevice(topology, fromLabel);
    const to = findDevice(topology, toLabel);
    if (!from || !to) {
      steps.push(st(topology, table, `"${!from ? fromLabel : toLabel}" does not exist — skipping this frame.`, 2, [], [], "error"));
      continue;
    }

    const inLink = linkBetween(topology, from.id, sw.id);
    if (!inLink) {
      steps.push(st(topology, table, `"${fromLabel}" isn't connected to ${switchLabel} — skipping this frame.`, 2, [], [], "error"));
      continue;
    }

    steps.push(st(topology, table, `Frame arrives at ${switchLabel}: ${fromLabel} → ${toLabel}.`, 2, [from.id, sw.id], [inLink.id]));

    if (table[from.mac] === from.id) {
      steps.push(st(topology, table, `${from.mac} (${fromLabel}) is already in the table — no change.`, 4, [from.id], [inLink.id]));
    } else {
      table[from.mac] = from.id;
      steps.push(st(topology, table, `Learn: ${from.mac} (${fromLabel}) is reachable through this port. Table updated.`, 4, [from.id], [inLink.id], "insert"));
    }

    const outNeighborId = table[to.mac];
    if (outNeighborId) {
      const outLink = linkBetween(topology, sw.id, outNeighborId);
      steps.push(st(topology, table, `${to.mac} (${toLabel}) is already known — forward directly, no flooding.`, 7, [to.id], outLink ? [outLink.id] : [], "found"));
    } else {
      const floodLinks = topology.links.filter((l) => (l.from === sw.id || l.to === sw.id) && l.id !== inLink.id).map((l) => l.id);
      steps.push(st(topology, table, `${to.mac} (${toLabel}) is unknown — flood the frame out every port except where it came in.`, 9, [], floodLinks, "default"));
    }

    steps.push(st(topology, table, `${toLabel} receives the frame.`, 11, [to.id], [], "found"));
  }

  steps.push(st(topology, table, `Done. Final table: ${Object.entries(table).map(([mac, id]) => `${mac}→${topology.devices.find((d) => d.id === id)?.label}`).join(", ")}.`, 11, [], [], "found"));
  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const MAC_LEARNING_CODE: string[] = [
  "function switchReceive(frame, inPort) {",
  "  // 1. Learn the sender",
  "  if (table[frame.srcMAC] !== inPort)",
  "    table[frame.srcMAC] = inPort;",
  "",
  "  // 2. Decide where to send it",
  "  outPort = table[frame.dstMAC];",
  "  if (outPort && outPort !== inPort) {",
  "    forward(frame, outPort);      // known — unicast",
  "  } else {",
  "    for each port !== inPort:",
  "      forward(frame, port);       // unknown — flood",
  "  }",
  "}",
];

export const MAC_LEARNING_ANNOTATIONS: Record<number, string> = {
  2: "Learning happens on every frame the switch sees, regardless of whether it knows the destination.",
  4: "The table maps MAC address → port. It has no idea about IP addresses at all — that's a different layer.",
  7: "outPort !== inPort guards against sending a frame back out the same port it arrived on.",
  9: "Flooding is the safe fallback: better to send it everywhere once than to guess wrong and drop it.",
  11: "Over time, as every host has sent at least one frame, the switch stops flooding almost entirely.",
};

export const MAC_LEARNING_COMPLEXITY = {
  time: "O(1) per frame",
  space: "O(hosts)",
  note: "A hash table lookup either way — learning and forwarding are both constant time per frame. Space grows with the number of distinct MACs seen.",
};
