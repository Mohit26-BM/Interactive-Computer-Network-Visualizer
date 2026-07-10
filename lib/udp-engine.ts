import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UdpStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): UdpStep {
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

// ─── Send a single UDP datagram end-to-end ──────────────────────────────────
// The whole point of UDP is what it *doesn't* do: no handshake, no ordering,
// no acknowledgment, no retransmission. Simulating a lost datagram just makes
// it vanish mid-flight — nobody notices, nobody resends it. That silence is
// the lesson, not a bug in the simulation.

export function sendUdpDatagram(
  topology: TopologyState,
  fromLabel: string,
  toLabel: string,
  srcPort: number,
  dstPort: number,
  payload = "DNS query",
  simulateLoss = false
): UdpStep[] {
  const steps: UdpStep[] = [];

  const from = findDevice(topology, fromLabel);
  const to = findDevice(topology, toLabel);

  let packet: PacketState = {
    id: "udp-1",
    layers: [],
    currentLink: null,
    progress: 0,
    atNode: from?.id ?? null,
    fate: "queued",
  };

  if (!from) { steps.push(st(topology, packet, `Device "${fromLabel}" does not exist.`, 1, "error")); return steps; }
  if (!to) { steps.push(st(topology, packet, `Device "${toLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, fromLabel, toLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, `No path between "${fromLabel}" and "${toLabel}".`, 1, "error"));
    return steps;
  }

  packet = {
    ...clonePacket(packet),
    layers: [{ protocol: "UDP", fields: { srcPort, dstPort, length: payload.length + 8, checksum: "0x4F2A" } }, { protocol: "Data", fields: { payload } }],
  };
  steps.push(st(topology, packet, `${fromLabel} builds a UDP datagram: port ${srcPort} → ${dstPort}. No handshake first — it just sends.`, 1, "insert"));

  const path = pathLabels.map((label) => findDevice(topology, label)!);
  const lossHop = simulateLoss ? Math.max(1, Math.floor(path.length / 2)) : -1;

  for (let i = 0; i < path.length - 1; i++) {
    const hopFrom = path[i];
    const hopTo = path[i + 1];
    const link = findLink(topology, hopFrom.id, hopTo.id)!;

    packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
    steps.push(st(topology, packet, `Leaving ${hopFrom.label} toward ${hopTo.label}.`, 3));

    for (let f = 1; f <= FRAMES_PER_LINK; f++) {
      const progress = f / FRAMES_PER_LINK;
      if (simulateLoss && i === lossHop - 1 && progress > 0.5) {
        packet = { ...clonePacket(packet), progress, fate: "dropped" };
        steps.push(st(topology, packet, `Lost in transit (simulated). UDP has no way to notice this happened — no ACK was ever expected, so nothing times out and nothing retransmits. If anyone recovers, it's the application above UDP, not UDP itself.`, 6, "error"));
        return steps;
      }
      packet = { ...clonePacket(packet), progress };
      steps.push(st(topology, packet, `On the wire (${Math.round(progress * 100)}% of the way).`, 3));
    }

    packet = { ...clonePacket(packet), atNode: hopTo.id, currentLink: null, progress: 0 };
  }

  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, `${toLabel} receives the datagram and hands it straight to the application. No acknowledgment is sent back — ${fromLabel} has no idea it arrived.`, 8, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const UDP_CODE: string[] = [
  "function sendUDP(from, to, srcPort, dstPort, payload) {",
  "  datagram = { srcPort, dstPort, length, checksum, payload };",
  "  path = findPath(from, to);",
  "",
  "  transmit(datagram);   // fire-and-forget, no connection setup",
  "",
  "  // if the datagram is lost anywhere on the path:",
  "  //   nothing times out, nothing resends — UDP simply never knows.",
  "",
  "  to.deliverToApplication(datagram.payload);  // if it arrives at all",
  "}",
];

export const UDP_ANNOTATIONS: Record<number, string> = {
  1: "No SYN, no handshake — UDP has no concept of a connection. Every datagram stands alone.",
  3: "The path can cross routers freely, same as any IP-layer delivery — UDP rides on top of IP.",
  6: "This is the entire tradeoff: skipping acknowledgment and retransmission is what makes UDP fast and cheap, at the cost of any delivery guarantee.",
  8: "Delivery is silent in both directions — the receiver doesn't confirm, and the sender doesn't ask.",
};

export const UDP_COMPLEXITY = {
  time: "O(hops)",
  space: "O(1)",
  note: "No handshake, no retry logic, no buffering for reordering — a UDP send is exactly one trip across the path, nothing more.",
};
