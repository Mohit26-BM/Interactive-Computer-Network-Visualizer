import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EthernetStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): EthernetStep {
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

// ─── Send one Ethernet frame across a switched LAN segment ───────────────────
// Switches are transparent at this layer — a frame can cross several of them
// untouched. A router is a hard boundary: it terminates the frame and builds
// a brand new one on the far side (see Encapsulation). That distinction IS
// the lesson, so it's the one thing this engine actually enforces.

export function sendEthernetFrame(topology: TopologyState, fromLabel: string, toLabel: string, payload = "HTTP GET /"): EthernetStep[] {
  const steps: EthernetStep[] = [];

  const from = findDevice(topology, fromLabel);
  const to = findDevice(topology, toLabel);

  let packet: PacketState = {
    id: "eth-1",
    layers: [{ protocol: "Payload", fields: { data: payload } }],
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

  const routerInPath = pathLabels.slice(1, -1).find((label) => findDevice(topology, label)?.kind === "router");
  if (routerInPath) {
    steps.push(st(topology, packet, `"${routerInPath}" is a router, not a switch — it terminates the Ethernet frame instead of forwarding it. A new frame gets built on its far side (see Encapsulation). Ethernet can't reach past it.`, 1, "error"));
    return steps;
  }

  steps.push(st(topology, packet, `Building an Ethernet frame at ${fromLabel} to reach ${toLabel}.`, 1));

  packet = {
    ...clonePacket(packet),
    layers: [
      { protocol: "Ethernet", fields: { dstMAC: to.mac, srcMAC: from.mac, etherType: "0x0800", crc: "0x9F3A21C4" } },
      ...packet.layers,
    ],
  };
  steps.push(st(topology, packet, `Frame header built: destination MAC ${to.mac}, source MAC ${from.mac}.`, 3, "insert"));

  for (let i = 0; i < pathLabels.length - 1; i++) {
    const hopFrom = findDevice(topology, pathLabels[i])!;
    const hopTo = findDevice(topology, pathLabels[i + 1])!;
    const link = findLink(topology, hopFrom.id, hopTo.id)!;

    packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
    steps.push(st(topology, packet, `Leaving ${pathLabels[i]} onto the wire${hopTo.kind === "switch" ? ` toward switch ${pathLabels[i + 1]}` : ""}.`, 5));

    for (let f = 1; f <= FRAMES_PER_LINK; f++) {
      const progress = f / FRAMES_PER_LINK;
      packet = { ...clonePacket(packet), progress };
      steps.push(st(topology, packet, `On the wire (${Math.round(progress * 100)}% of the way).`, 5));
    }

    packet = { ...clonePacket(packet), atNode: hopTo.id, currentLink: null, progress: 0 };

    if (hopTo.kind === "switch") {
      steps.push(st(topology, packet, `${pathLabels[i + 1]} reads the destination MAC and forwards the frame — unchanged — toward ${toLabel}.`, 6));
    } else {
      steps.push(st(topology, packet, `${toLabel} receives the frame and checks the destination MAC.`, 6));
    }
  }

  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, `Destination MAC ${to.mac} matches ${toLabel}'s own address — frame accepted, CRC passes.`, 7, "found"));

  const payloadLayer = packet.layers[packet.layers.length - 1];
  packet = { ...clonePacket(packet), layers: [payloadLayer] };
  steps.push(st(topology, packet, `Ethernet header stripped off. Payload handed up to the next layer.`, 8, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ETHERNET_CODE: string[] = [
  "function sendFrame(from, to, payload) {",
  "  path = findPath(from, to);",
  "  if (path contains a router)",
  "    return; // routers terminate frames, switches don't",
  "  frame = {",
  "    dstMAC: to.mac, srcMAC: from.mac,",
  "    etherType: 0x0800, payload, crc: checksum(payload)",
  "  };",
  "  for each hop in path:",
  "    transmit(frame);              // onto the wire",
  "    if hop is a switch: forward(frame); // unchanged",
  "  received = to.receive(frame);",
  "  if (received.dstMAC !== to.mac) return; // not for me, ignore",
  "  if (!verifyCRC(received)) return;       // corrupted, drop",
  "  deliver(received.payload);              // hand up the stack",
  "}",
];

export const ETHERNET_ANNOTATIONS: Record<number, string> = {
  1: "Ethernet has no concept of routing — it only knows the local segment, however many switches wide that segment is.",
  3: "The frame header carries physical addresses (MAC), not logical ones (IP) — that's what makes it a Data Link layer concept.",
  5: "A switch forwards the exact same frame bit-for-bit — no header is rewritten, unlike what a router does one layer up.",
  6: "Every device on the segment technically sees frames flooded to it; the NIC hardware normally discards ones addressed to someone else.",
  7: "CRC (cyclic redundancy check) catches corruption introduced by the physical medium itself.",
  8: "Once accepted, the Ethernet header has done its job and is discarded — the Network layer never sees it.",
};

export const ETHERNET_COMPLEXITY = {
  time: "O(hops)",
  space: "O(1)",
  note: "A fixed-size header regardless of payload size, forwarded unchanged through any number of switches. The real cost is the router boundary: crossing one means an entirely new frame gets built.",
};
