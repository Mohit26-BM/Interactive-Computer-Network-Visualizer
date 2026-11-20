import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EthernetStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 8;

// IEEE 802.3 frame limits
export const ETH_HEADER_BYTES = 14;     // dst MAC 6 + src MAC 6 + EtherType 2
export const ETH_FCS_BYTES = 4;         // frame check sequence (CRC-32)
export const ETH_MIN_PAYLOAD = 46;      // shorter payloads are padded
export const ETH_MAX_PAYLOAD = 1500;    // the MTU
export const ETH_MIN_FRAME = 64;        // header + payload + FCS, at least
export const ETH_PREAMBLE_BYTES = 8;    // 7 x 0xAA + start-of-frame delimiter (added by the hardware)
export const ETH_IFG_BYTES = 12;        // mandatory idle gap between frames

/** CRC-32 as used by Ethernet's frame check sequence (reflected, polynomial 0x04C11DB7). */
export function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const macBytes = (mac: string) => mac.split(":").map((h) => parseInt(h, 16));

export interface FrameSize {
  payloadBytes: number;   // what the upper layer handed down
  paddingBytes: number;   // zeros added to reach 46
  frameBytes: number;     // header + payload + padding + FCS (what "frame size" means)
  wireBytes: number;      // plus preamble and inter-frame gap: the real cost on the cable
}

export function frameSize(payloadBytes: number): FrameSize {
  const paddingBytes = Math.max(0, ETH_MIN_PAYLOAD - payloadBytes);
  const frameBytes = ETH_HEADER_BYTES + payloadBytes + paddingBytes + ETH_FCS_BYTES;
  return { payloadBytes, paddingBytes, frameBytes, wireBytes: frameBytes + ETH_PREAMBLE_BYTES + ETH_IFG_BYTES };
}

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

  const payloadBytes = Array.from(new TextEncoder().encode(payload));
  if (payloadBytes.length > ETH_MAX_PAYLOAD) {
    steps.push(st(topology, packet, `This payload is ${payloadBytes.length} bytes, but an Ethernet frame can carry at most ${ETH_MAX_PAYLOAD} (the MTU). In a real stack the IP layer would have fragmented it, or TCP would have split it into MSS-sized segments, long before it reached Ethernet.`, 1, "error"));
    return steps;
  }

  steps.push(st(topology, packet, `Building an Ethernet frame at ${fromLabel} to reach ${toLabel}.`, 1));

  const size = frameSize(payloadBytes.length);
  const padded = [...payloadBytes, ...new Array(size.paddingBytes).fill(0)];
  const fcs = crc32([...macBytes(to.mac), ...macBytes(from.mac), 0x08, 0x00, ...padded]);
  const fcsHex = "0x" + fcs.toString(16).toUpperCase().padStart(8, "0");

  packet = {
    ...clonePacket(packet),
    layers: [
      { protocol: "Ethernet", fields: { dstMAC: to.mac, srcMAC: from.mac, etherType: "0x0800", payloadBytes: size.payloadBytes, padding: size.paddingBytes, frameBytes: size.frameBytes, crc: fcsHex } },
      ...packet.layers,
    ],
  };
  steps.push(st(topology, packet, `Frame header built: destination MAC ${to.mac}, source MAC ${from.mac}.`, 3, "insert"));
  if (size.paddingBytes > 0) {
    steps.push(st(topology, packet, `The payload is only ${size.payloadBytes} bytes, below Ethernet's 46-byte minimum, so ${size.paddingBytes} zero bytes of padding are added. Frames must be at least ${ETH_MIN_FRAME} bytes (14 header + 46 payload + 4 FCS) so a sender is still transmitting when a collision's echo returns - that rule dates from shared-cable Ethernet. The receiver cannot tell padding from data, which is why IP carries its own length field.`, 7, "insert"));
  }
  steps.push(st(topology, packet, `Frame check sequence: the CRC-32 of the frame, ${fcsHex}, is appended (${size.frameBytes} bytes in total). On the wire the hardware also adds an ${ETH_PREAMBLE_BYTES}-byte preamble and leaves a ${ETH_IFG_BYTES}-byte gap after the frame, so it costs ${size.wireBytes} bytes of link time.`, 7, "insert"));

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
  steps.push(st(topology, packet, `Destination MAC ${to.mac} matches ${toLabel}'s own address — frame accepted, the CRC-32 recomputed over the frame equals the FCS ${fcsHex}.`, 7, "found"));

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
  6: "Every device on the segment technically sees frames flooded to it; the NIC hardware normally discards ones addressed to someone else. The FCS is computed in hardware, and the preamble (8 bytes) and 12-byte inter-frame gap are added by it too.",
  7: "Short payloads are padded so every frame is at least 64 bytes (the receiver strips padding using the IP length field). The FCS is a real CRC-32 computed by the NIC in hardware; frames that fail it are silently dropped before software sees them. CRC catches corruption introduced by the physical medium itself.",
  8: "Once accepted, the Ethernet header has done its job and is discarded — the Network layer never sees it.",
};

export const ETHERNET_COMPLEXITY = {
  time: "O(hops)",
  space: "O(1)",
  note: "A fixed-size header regardless of payload size, forwarded unchanged through any number of switches. The real cost is the router boundary: crossing one means an entirely new frame gets built.",
};
