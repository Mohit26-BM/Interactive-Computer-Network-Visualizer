import { PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath, PacketStep } from "./packet-engine";

// Packet Life Explorer: one packet, fully encapsulated (Ethernet + IPv4 +
// TCP + HTTP all present at once, not built up one layer at a time the way
// Encapsulation does), crossing multiple real hops through the same
// PC-1 -> SW-1 -> R-1 -> R-2 -> SRV-1 chain buildIcmpTopology() already
// provides. Every existing protocol page isolates one layer or one link;
// this is the one place all four layers mutate together as the SAME packet
// moves — TTL decrementing and the Ethernet frame being rebuilt at every
// router hop, then the reply's TCP sequence/ack/window fields all changing
// on the way back. Reuses PacketStep from packet-engine.ts so the existing
// PacketVisualizer/PacketInspector components work completely unchanged.

const FRAMES_PER_LINK = 6;

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function setLayerField(packet: PacketState, protocol: string, key: string, value: string | number): PacketState {
  return {
    ...packet,
    layers: packet.layers.map((l) => (l.protocol === protocol ? { ...l, fields: { ...l.fields, [key]: value } } : l)),
  };
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): PacketStep {
  return {
    topology, packet: clonePacket(packet), explanation, highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// The next device on the path that actually gets addressed at Layer 2 — a
// switch is transparent, so a frame's Ethernet destination always names the
// next non-switch device, exactly like every other page in this project.
function nextL3Hop(path: DeviceNode[], fromIndex: number): DeviceNode {
  for (let i = fromIndex + 1; i < path.length; i++) {
    if (path[i].kind !== "switch") return path[i];
  }
  return path[path.length - 1];
}

function traverseAndMutate(
  topology: TopologyState,
  path: DeviceNode[],
  initialPacket: PacketState,
  leaveLine: number,
  arriveRouterLine: number,
  rebuildLine: number,
  deliverLine: number,
  deliverExplain: (finalTtl: number) => string
): { steps: PacketStep[]; packet: PacketState } {
  const steps: PacketStep[] = [];
  let packet = initialPacket;

  for (let i = 0; i < path.length - 1; i++) {
    const cur = path[i];
    const next = path[i + 1];
    const link = findLink(topology, cur.id, next.id)!;

    packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
    steps.push(st(topology, packet, `Leaving ${cur.label} toward ${next.label}.`, leaveLine));
    for (let f = 1; f <= FRAMES_PER_LINK; f++) {
      packet = { ...clonePacket(packet), progress: f / FRAMES_PER_LINK };
      steps.push(st(topology, packet, `On the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}%).`, leaveLine));
    }
    packet = { ...clonePacket(packet), atNode: next.id, currentLink: null, progress: 0 };

    const isLast = i === path.length - 2;

    if (next.kind === "router") {
      const ipLayer = packet.layers.find((l) => l.protocol === "IPv4")!;
      const newTtl = Number(ipLayer.fields.ttl) - 1;
      packet = setLayerField(packet, "IPv4", "ttl", newTtl);
      steps.push(st(topology, packet, `${next.label} receives the frame and decrements TTL to ${newTtl}. The IPv4/TCP/HTTP layers survive completely unchanged — only the Ethernet frame around them gets rebuilt.`, arriveRouterLine, "found"));

      if (!isLast) {
        const forwardTarget = nextL3Hop(path, i + 1);
        packet = setLayerField(packet, "Ethernet", "srcMac", next.mac);
        packet = setLayerField(packet, "Ethernet", "dstMac", forwardTarget.mac);
        steps.push(st(topology, packet, `${next.label} builds a brand-new Ethernet frame for the next hop: source becomes its own MAC (${next.mac}), destination becomes ${forwardTarget.label}'s (${forwardTarget.mac}).`, rebuildLine));
      }
    } else if (isLast) {
      packet = { ...clonePacket(packet), fate: "delivered" };
      const ipLayer = packet.layers.find((l) => l.protocol === "IPv4")!;
      steps.push(st(topology, packet, deliverExplain(Number(ipLayer.fields.ttl)), deliverLine, "found"));
    } else {
      steps.push(st(topology, packet, `${next.label} forwards based on MAC address alone — nothing inside the packet changes here.`, leaveLine));
    }
  }

  return { steps, packet };
}

export function simulatePacketLife(topology: TopologyState): PacketStep[] {
  const pc = findDevice(topology, "PC-1");
  const srv = findDevice(topology, "SRV-1");

  const pathLabels = pc && srv ? findPath(topology, "PC-1", "SRV-1") : null;
  if (!pc || !srv || !pc.ip || !srv.ip || !pathLabels) {
    return [st(
      topology,
      { id: "pkt-life", layers: [], currentLink: null, progress: 0, atNode: null, fate: "dropped" },
      "This lab expects the PC-1 -> SW-1 -> R-1 -> R-2 -> SRV-1 chain from buildIcmpTopology().",
      1, "error"
    )];
  }

  const path = pathLabels.map((l) => findDevice(topology, l)!);
  const reversePath = [...path].reverse();
  const steps: PacketStep[] = [];

  // --- Request leg: PC-1 -> SRV-1 ---
  const requestPacket: PacketState = {
    id: "pkt-life-request",
    layers: [
      { protocol: "Ethernet", fields: { srcMac: pc.mac, dstMac: nextL3Hop(path, 0).mac, etherType: "0x0800" } },
      { protocol: "IPv4", fields: { srcIp: pc.ip, dstIp: srv.ip, ttl: 64, protocol: "TCP" } },
      { protocol: "TCP", fields: { srcPort: 51442, dstPort: 80, seq: 1000, ack: 5000, window: 65535, flags: "PSH,ACK" } },
      { protocol: "HTTP", fields: { method: "GET", path: "/index.html", host: srv.ip } },
    ],
    currentLink: null, progress: 0, atNode: pc.id, fate: "queued",
  };

  steps.push(st(topology, requestPacket, `${pc.label} sends an HTTP GET over an already-established TCP connection. Four layers present at once — Ethernet, IPv4, TCP, HTTP — none of them waiting for the others. TTL starts at 64.`, 1, "insert"));

  const reqResult = traverseAndMutate(
    topology, path, requestPacket, 2, 3, 4, 5,
    (ttl) => `${srv.label} receives the HTTP request, TTL arrived at ${ttl} — everything above IP (TCP, HTTP) is exactly as ${pc.label} sent it.`
  );
  steps.push(...reqResult.steps);

  // --- Response leg: SRV-1 -> PC-1, same connection, different direction ---
  const finalReqTcp = reqResult.packet.layers.find((l) => l.protocol === "TCP")!;
  const reqSeq = Number(finalReqTcp.fields.seq);
  const requestByteLength = 128; // the GET request itself, illustrative

  const responsePacket: PacketState = {
    id: "pkt-life-response",
    layers: [
      { protocol: "Ethernet", fields: { srcMac: srv.mac, dstMac: nextL3Hop(reversePath, 0).mac, etherType: "0x0800" } },
      { protocol: "IPv4", fields: { srcIp: srv.ip, dstIp: pc.ip, ttl: 64, protocol: "TCP" } },
      { protocol: "TCP", fields: { srcPort: 80, dstPort: 51442, seq: 5000, ack: reqSeq + requestByteLength, window: 32768, flags: "ACK" } },
      { protocol: "HTTP", fields: { status: 200, statusText: "OK", contentLength: 1450 } },
    ],
    currentLink: null, progress: 0, atNode: srv.id, fate: "queued",
  };

  const responseTcp = responsePacket.layers.find((l) => l.protocol === "TCP")!;
  steps.push(st(topology, responsePacket, `${srv.label} replies on the same connection. TCP ports swap (80 is now the source), ack jumps to ${responseTcp.fields.ack} (acknowledging the request's bytes), and the advertised window has shrunk to ${responseTcp.fields.window} — a live look at the receiver's own flow control. Fresh TTL of 64 for this new direction.`, 6));

  const respResult = traverseAndMutate(
    topology, reversePath, responsePacket, 7, 8, 9, 10,
    (ttl) => `${pc.label} receives the HTTP response, TTL arrived at ${ttl}. Across this one packet's round trip: TTL fell twice each way, the Ethernet frame was rebuilt at every router, and TCP's seq/ack/window all advanced — every layer, mutating together, on one continuous journey.`
  );
  steps.push(...respResult.steps);

  return steps;
}

export const PACKET_LIFE_CODE: string[] = [
  "function traverse(path, packet) {",
  "  for (let i = 0; i < path.length - 1; i++) {",
  "    travelAcrossLink(path[i], path[i + 1]);          // switches: unchanged pass-through",
  "    if (path[i + 1].kind === 'router') {",
  "      packet.ipv4.ttl -= 1;                           // survives above IP, changes at IP",
  "      packet.ethernet = rebuildFrame(path[i + 1], nextL3Hop(path, i + 1));",
  "    }",
  "  }",
  "  // arriving at the destination: TCP/HTTP layers are untouched from the moment they were built",
  "}",
];

export const PACKET_LIFE_ANNOTATIONS: Record<number, string> = {
  1: "This is the one page in the project where every layer — Ethernet, IPv4, TCP, HTTP — is present simultaneously from the very first step, instead of being built up one at a time.",
  3: "TTL is IP's job alone. TCP's sequence numbers and HTTP's request line never even notice a router touched the packet.",
  4: "Rebuilding the Ethernet frame at every router hop is exactly why a frame is said to be \"per-link\" while the IP packet inside survives the entire journey.",
  5: "This is the payoff of the layered model: the server sees exactly the TCP segment and HTTP request the client sent, untouched by however many routers were in between.",
  8: "The return trip gets its own fresh TTL (64 again) — TTL is set by whichever device originates a packet, not inherited from whatever arrived.",
  10: "Four fields (TTL twice, MAC twice, sequence/ack/window) all changed across one packet's life — everything this page set out to show, side by side instead of on nine separate pages.",
};

export const PACKET_LIFE_COMPLEXITY = {
  time: "O(hops) for each leg, O(1) mutation per hop",
  space: "O(1) — one packet's header stack, mutated in place across the trip",
  note: "Nothing here is more expensive than any single-layer page — the point is showing four layers' worth of mutation together, not a new algorithm.",
};
