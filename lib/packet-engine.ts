import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PacketStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

// How many sub-frames to emit while a packet crosses one link — this is what
// makes the dot glide across the wire instead of teleporting. Purely a
// rendering/pacing concern; the packet engine doesn't know or care about
// protocols yet.
const FRAMES_PER_LINK = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return {
    ...p,
    layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })),
  };
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): PacketStep {
  return {
    topology,
    packet: clonePacket(packet),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

// Plain BFS over the topology graph — same idea as the DSA app's graphBFS,
// adapted to devices/links instead of vertices/edges. Returns device labels
// along the shortest hop-path, or null if unreachable.
export function findPath(topology: TopologyState, fromLabel: string, toLabel: string): string[] | null {
  const start = findDevice(topology, fromLabel);
  const end = findDevice(topology, toLabel);
  if (!start || !end) return null;
  if (start.id === end.id) return [fromLabel];

  const adj: Record<string, string[]> = {};
  topology.devices.forEach((d) => { adj[d.id] = []; });
  topology.links.forEach((l) => { adj[l.from]?.push(l.to); adj[l.to]?.push(l.from); });

  const visited = new Set<string>([start.id]);
  const prev: Record<string, string> = {};
  const queue: string[] = [start.id];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === end.id) break;
    for (const n of adj[cur] ?? []) {
      if (!visited.has(n)) {
        visited.add(n);
        prev[n] = cur;
        queue.push(n);
      }
    }
  }

  if (!visited.has(end.id)) return null;

  const idPath: string[] = [end.id];
  let cur = end.id;
  while (cur !== start.id) {
    cur = prev[cur];
    idPath.unshift(cur);
  }
  return idPath.map((id) => topology.devices.find((d) => d.id === id)!.label);
}

// ─── Send a single, protocol-less packet across a path ───────────────────────

export function sendPacket(topology: TopologyState, pathLabels: string[]): PacketStep[] {
  const steps: PacketStep[] = [];

  if (pathLabels.length < 2) return steps;

  const startDevice = findDevice(topology, pathLabels[0]);
  if (!startDevice) return steps;

  let packet: PacketState = {
    id: "pkt-1",
    layers: [],
    currentLink: null,
    progress: 0,
    atNode: startDevice.id,
    fate: "queued",
  };

  steps.push(st(topology, packet, `A packet is created at ${pathLabels[0]}.`, 1, "insert"));

  for (let i = 0; i < pathLabels.length - 1; i++) {
    const fromDevice = findDevice(topology, pathLabels[i]);
    const toDevice = findDevice(topology, pathLabels[i + 1]);

    if (!fromDevice || !toDevice) {
      packet = { ...clonePacket(packet), fate: "dropped" };
      steps.push(st(topology, packet, `"${pathLabels[i + 1]}" does not exist — packet dropped.`, 2, "error"));
      return steps;
    }

    const link = findLink(topology, fromDevice.id, toDevice.id);
    if (!link) {
      packet = { ...clonePacket(packet), fate: "dropped" };
      steps.push(st(topology, packet, `No link between ${pathLabels[i]} and ${pathLabels[i + 1]} — packet dropped.`, 3, "error"));
      return steps;
    }

    packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
    steps.push(st(topology, packet, `Leaving ${pathLabels[i]}, heading toward ${pathLabels[i + 1]}.`, 4, "default"));

    for (let f = 1; f <= FRAMES_PER_LINK; f++) {
      const progress = f / FRAMES_PER_LINK;
      packet = { ...clonePacket(packet), progress };
      steps.push(st(topology, packet, `In transit on the link (${Math.round(progress * 100)}% of the way).`, 5, "default"));
    }

    const isLastHop = i === pathLabels.length - 2;
    packet = {
      ...clonePacket(packet),
      atNode: toDevice.id,
      currentLink: null,
      progress: 0,
      fate: isLastHop ? "delivered" : "queued",
    };
    steps.push(st(topology, packet, `Arrived at ${pathLabels[i + 1]}.`, 6, isLastHop ? "found" : "default"));
  }

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const PACKET_CODE: string[] = [
  "function sendPacket(topology, path) {",
  "  packet = { atNode: path[0], fate: 'queued' };",
  "  for (let i = 0; i < path.length - 1; i++) {",
  "    link = findLink(path[i], path[i+1]);",
  "    if (!link) { packet.fate = 'dropped'; return; }",
  "    packet.currentLink = link; packet.atNode = null;",
  "    while (packet.progress < 1)",
  "      packet.progress += step; // travel the wire",
  "    packet.atNode = path[i+1]; packet.currentLink = null;",
  "  }",
  "  // packet.fate = 'delivered' at the final hop",
  "}",
];

export const PACKET_ANNOTATIONS: Record<number, string> = {
  1: "A packet always starts life queued at a device — it hasn't touched a wire yet.",
  4: "Leaving a node means the packet is now 'on the wire', not 'at' any device.",
  5: "This progress loop is what lets the player scrub through motion smoothly instead of teleporting hop to hop.",
  6: "Arriving sets atNode again and clears currentLink — mirrors leaving exactly.",
};

export const PACKET_COMPLEXITY = {
  time: "O(hops)",
  space: "O(1)",
  note: "One send/travel/arrive sequence per hop in the path — independent of how large the rest of the topology is.",
};
