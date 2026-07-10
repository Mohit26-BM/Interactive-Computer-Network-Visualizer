import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FragmentPlan {
  offset: number; // in bytes, always a multiple of 8 (real IPv4 fragment offsets are in 8-byte units)
  length: number; // payload bytes in this fragment (header not included)
  moreFragments: boolean;
}

export interface FragmentationStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  plan: FragmentPlan[];
  receivedOffsets: number[]; // which fragments have arrived at the destination so far
}

const FRAMES_PER_LINK = 5;
const IP_HEADER_BYTES = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function st(topology: TopologyState, packet: PacketState, plan: FragmentPlan[], receivedOffsets: number[], explanation: string, hl: number, phase?: string): FragmentationStep {
  return {
    topology,
    packet: clonePacket(packet),
    plan,
    receivedOffsets: [...receivedOffsets],
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// Real IPv4 fragments must land on 8-byte boundaries (the offset field is
// counted in 8-byte units) — every fragment except the last must therefore
// be a multiple of 8 bytes long.
export function planFragments(totalBytes: number, mtu: number): FragmentPlan[] {
  const maxPayload = Math.floor((mtu - IP_HEADER_BYTES) / 8) * 8;
  const plan: FragmentPlan[] = [];
  let offset = 0;
  while (offset < totalBytes) {
    const remaining = totalBytes - offset;
    const length = Math.min(maxPayload, remaining);
    plan.push({ offset, length, moreFragments: offset + length < totalBytes });
    offset += length;
  }
  return plan;
}

// ─── Send an oversized packet across a link with a smaller MTU ──────────────
// DF (Don't Fragment) set + oversized packet is a hard failure: the router
// drops it rather than fragmenting, exactly like a real one would.

export function sendFragmentedPacket(
  topology: TopologyState,
  fromLabel: string,
  toLabel: string,
  totalBytes: number,
  mtu: number,
  dontFragment: boolean
): FragmentationStep[] {
  const steps: FragmentationStep[] = [];

  const from = findDevice(topology, fromLabel);
  const to = findDevice(topology, toLabel);

  let packet: PacketState = { id: "ip-frag", layers: [], currentLink: null, progress: 0, atNode: from?.id ?? null, fate: "queued" };

  if (!from) { steps.push(st(topology, packet, [], [], `Device "${fromLabel}" does not exist.`, 1, "error")); return steps; }
  if (!to) { steps.push(st(topology, packet, [], [], `Device "${toLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, fromLabel, toLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, [], [], `No path between "${fromLabel}" and "${toLabel}".`, 1, "error"));
    return steps;
  }
  const path = pathLabels.map((l) => findDevice(topology, l)!);

  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { totalLength: totalBytes + IP_HEADER_BYTES, dontFragment: dontFragment ? "yes" : "no" } }] };
  steps.push(st(topology, packet, [], [], `${fromLabel} has a ${totalBytes}-byte packet to send, but the path ahead has an MTU of ${mtu} bytes.`, 1));

  if (totalBytes + IP_HEADER_BYTES <= mtu) {
    steps.push(st(topology, packet, [], [], `The packet already fits within the MTU — no fragmentation needed at all.`, 2, "found"));
    return steps;
  }

  if (dontFragment) {
    packet = { ...clonePacket(packet), fate: "dropped" };
    steps.push(st(topology, packet, [], [], `The Don't Fragment (DF) bit is set, and the packet is too big for this MTU — a router along the path drops it and sends back an ICMP "Fragmentation Needed" message instead of splitting it.`, 3, "error"));
    return steps;
  }

  const plan = planFragments(totalBytes, mtu);
  steps.push(st(topology, packet, plan, [], `Fragmenting into ${plan.length} pieces, each aligned to an 8-byte boundary (the offset field is counted in 8-byte units): ${plan.map((f) => `offset ${f.offset} (${f.length}B${f.moreFragments ? ", MF" : ", last"})`).join("; ")}.`, 4, "insert"));

  function travel(pkt: PacketState, label: string) {
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const link = findLink(topology, path[i].id, path[i + 1].id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, plan, receivedSoFar, `${label} leaving ${path[i].label}.`, 5));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, plan, receivedSoFar, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}%).`, 5));
      }
      p = { ...clonePacket(p), atNode: path[i + 1].id, currentLink: null, progress: 0 };
    }
    return p;
  }

  const identification = "0x7A31";
  const receivedSoFar: number[] = [];

  plan.forEach((frag, i) => {
    packet = {
      ...clonePacket(packet),
      id: `frag-${i}`,
      atNode: from!.id,
      layers: [{ protocol: "IPv4", fields: { identification, fragOffset: frag.offset, length: frag.length, flags: frag.moreFragments ? "MF" : "-" } }],
    };
    steps.push(st(topology, packet, plan, receivedSoFar, `Sending fragment ${i + 1}/${plan.length}: offset ${frag.offset}, ${frag.length} bytes, ${frag.moreFragments ? "more fragments follow" : "this is the last one"}.`, 6, "insert"));
    packet = travel(packet, `Fragment ${i + 1}`);
    packet = { ...clonePacket(packet), fate: i === plan.length - 1 ? "delivered" : "queued" };
    receivedSoFar.push(frag.offset);
    steps.push(st(topology, packet, plan, receivedSoFar, `${toLabel} receives fragment ${i + 1} (offset ${frag.offset}) and holds it in its reassembly buffer.`, 7, "found"));
  });

  steps.push(st(topology, packet, plan, receivedSoFar, `All ${plan.length} fragments have arrived (same identification field ties them together). ${toLabel} reassembles them in offset order into the original ${totalBytes}-byte packet.`, 8, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const FRAGMENTATION_CODE: string[] = [
  "function send(packet, mtu) {",
  "  if (packet.length <= mtu) return transmit(packet);  // fits, nothing to do",
  "",
  "  if (packet.dontFragment)",
  "    return drop(packet), sendICMP('Fragmentation Needed');",
  "",
  "  offset = 0;",
  "  while (offset < packet.length) {",
  "    size = min(maxFragmentSize(mtu), packet.length - offset);",
  "    transmit({ id: packet.id, offset, size, moreFragments: offset + size < packet.length });",
  "    offset += size;",
  "  }",
  "}",
  "",
  "// receiver: collect fragments by id, sort by offset, concatenate once the",
  "// one with moreFragments == false has arrived and every offset is covered.",
];

export const FRAGMENTATION_ANNOTATIONS: Record<number, string> = {
  2: "Most packets never need this at all — fragmentation only kicks in when something ahead has a smaller MTU than the packet itself.",
  3: "Don't Fragment exists so a sender can detect a too-small MTU early (via the resulting ICMP message) instead of silently having its packets split.",
  4: "Every fragment shares the same identification value — that's how the receiver knows which fragments belong to the same original packet.",
  6: "Only the last fragment leaves \"more fragments\" unset — that's the receiver's signal that it has everything it needs to reassemble.",
  8: "Reassembly needs every fragment to arrive — a single lost fragment means the entire original packet has to be discarded and (for TCP) retransmitted from scratch.",
};

export const FRAGMENTATION_COMPLEXITY = {
  time: "O(packetSize / mtu)",
  space: "O(packetSize) at the receiver until reassembly completes",
  note: "The number of fragments scales with how much bigger the packet is than the smallest MTU on its path — and the receiver has to buffer every fragment until the last one arrives.",
};
