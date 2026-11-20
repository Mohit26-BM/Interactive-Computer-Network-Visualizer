import { Step, PacketState } from "./types";
import { TopologyState, findDevice as findDeviceByLabel } from "./topology-engine";
import { findPath } from "./packet-engine";
import { computeRoutes, ifaceToward, describeLookup } from "./addressing";
import { lookupRoute } from "./routing-table-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IPv4Step extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 8;
const START_TTL = 64;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): IPv4Step {
  return {
    topology,
    packet: clonePacket(packet),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function withIPv4Fields(layers: PacketState["layers"], ttl: number): PacketState["layers"] {
  return layers.map((l) => (l.protocol === "IPv4" ? { ...l, fields: { ...l.fields, ttl } } : l));
}

// ─── Send an IPv4 packet across any number of routed segments ───────────────
// Unlike Ethernet, IPv4 crosses routers freely — that's the whole point of
// this layer. The Ethernet frame still only survives one segment though: it
// gets rebuilt from scratch every time a router forwards the packet, and TTL
// only ever drops at that same moment (never on a switch, never at the
// original sender, never at the final destination).

export function sendIPv4Packet(topology: TopologyState, fromLabel: string, toLabel: string, protocol = "TCP"): IPv4Step[] {
  const steps: IPv4Step[] = [];

  const from = findDeviceByLabel(topology, fromLabel);
  const to = findDeviceByLabel(topology, toLabel);

  let packet: PacketState = {
    id: "ip-1",
    layers: [],
    currentLink: null,
    progress: 0,
    atNode: from?.id ?? null,
    fate: "queued",
  };

  if (!from || !to) {
    steps.push(st(topology, packet, `Device "${!from ? fromLabel : toLabel}" does not exist.`, 1, "error"));
    return steps;
  }
  if (!from.ip || !to.ip) {
    steps.push(st(topology, packet, `Both devices need an IP address for this to make sense.`, 1, "error"));
    return steps;
  }

  const pathLabels = findPath(topology, fromLabel, toLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, `No path between "${fromLabel}" and "${toLabel}".`, 1, "error"));
    return steps;
  }

  const tables = computeRoutes(topology);
  let ttl = START_TTL;
  packet = {
    ...clonePacket(packet),
    layers: [
      { protocol: "IPv4", fields: { srcIP: from.ip, dstIP: to.ip, ttl, protocol } },
      { protocol, fields: { note: `${protocol} payload` } },
    ],
  };
  steps.push(st(topology, packet, `${fromLabel} builds an IPv4 packet: ${from.ip} → ${to.ip}, TTL=${ttl}. This header will survive the whole trip unchanged except for TTL.${from.gateway && to.ip && from.ip && !sameSubnet(from.ip, to.ip) ? ` ${to.ip} is not in ${fromLabel}'s own subnet, so the frame will be addressed to its DEFAULT GATEWAY ${from.gateway}, not to ${toLabel}.` : ""}`, 1, "insert"));

  // Segments are delimited by non-switch devices (hosts/routers) — a switch
  // never terminates a segment, it just forwards the same frame onward.
  const path = pathLabels.map((label) => findDeviceByLabel(topology, label)!);
  const segmentBounds = path.map((d, i) => ({ d, i })).filter(({ d }) => d.kind !== "switch");

  for (let s = 0; s < segmentBounds.length - 1; s++) {
    const segStart = segmentBounds[s];
    const segEnd = segmentBounds[s + 1];

    // A router has a different MAC on each interface: use the one that faces this segment.
    const srcIface = segStart.d.kind === "router" ? ifaceToward(segStart.d, path[segStart.i + 1].id) : undefined;
    const dstIface = segEnd.d.kind === "router" ? ifaceToward(segEnd.d, path[segEnd.i - 1].id) : undefined;
    const srcMac = srcIface?.mac ?? segStart.d.mac;
    const dstMac = dstIface?.mac ?? segEnd.d.mac;
    packet = { ...clonePacket(packet), layers: [{ protocol: "Ethernet", fields: { dstMAC: dstMac, srcMAC: srcMac, etherType: "0x0800" } }, ...packet.layers] };
    steps.push(st(topology, packet, `${segStart.d.label} builds a fresh Ethernet frame for this segment: ${srcMac} → ${dstMac} (${segStart.d.label} → ${segEnd.d.label}${dstIface ? `, the ${segEnd.d.label} interface ${dstIface.name} with IP ${dstIface.ip}` : ""}).`, 3, "insert"));

    for (let i = segStart.i; i < segEnd.i; i++) {
      const hopFrom = path[i];
      const hopTo = path[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;

      packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, packet, `Leaving ${hopFrom.label}${hopTo.kind === "switch" ? ` toward switch ${hopTo.label}` : ""}.`, 5));

      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        packet = { ...clonePacket(packet), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, packet, `On the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 5));
      }

      packet = { ...clonePacket(packet), atNode: hopTo.id, currentLink: null, progress: 0 };
    }

    const isFinal = s === segmentBounds.length - 2;

    if (!isFinal) {
      // segEnd is a router forwarding onward
      ttl -= 1;
      packet = { ...clonePacket(packet), layers: withIPv4Fields(packet.layers.slice(1), ttl) };
      if (ttl <= 0) {
        packet = { ...clonePacket(packet), fate: "dropped" };
        steps.push(st(topology, packet, `${segEnd.d.label} decrements TTL to 0 — packet discarded, an ICMP Time Exceeded would be sent back (see ICMP).`, 6, "error"));
        return steps;
      }
      const table = tables[segEnd.d.id];
      const lookup = table && to.ip ? describeLookup(table, to.ip) : null;
      const nextSeg = segmentBounds[s + 2];
      const egress = nextSeg ? ifaceToward(segEnd.d, path[segEnd.i + 1].id) : undefined;
      if (table && to.ip && !lookupRoute(table, to.ip).best) {
        packet = { ...clonePacket(packet), fate: "dropped" };
        steps.push(st(topology, packet, `${segEnd.d.label} looks up ${to.ip}: ${lookup}. The packet is dropped and ICMP Destination Unreachable goes back to the sender.`, 6, "error"));
        return steps;
      }
      steps.push(st(topology, packet, `${segEnd.d.label} strips the Ethernet frame and looks up ${to.ip ?? toLabel} in its routing table: ${lookup ?? "forward toward the destination"}. It decrements TTL to ${ttl} and forwards${egress ? ` out ${egress.name} (${egress.ip})` : ""} toward ${toLabel}, building a new Ethernet header for the next link.`, 6, "insert"));
    } else {
      packet = { ...clonePacket(packet), layers: packet.layers.slice(2), fate: "delivered" };
      steps.push(st(topology, packet, `${toLabel} strips the final Ethernet frame and the IPv4 header, and hands the payload to the ${protocol} layer above.`, 8, "found"));
    }
  }

  return steps;
}

function sameSubnet(a: string, b: string): boolean {
  const toInt = (ip: string) => ip.split(".").reduce((n, o) => ((n << 8) | Number(o)) >>> 0, 0);
  return (toInt(a) & 0xffffff00) === (toInt(b) & 0xffffff00);
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const IPV4_CODE: string[] = [
  "function sendIPv4(from, to, protocol) {",
  "  packet.ip = { srcIP: from.ip, dstIP: to.ip, ttl: 64, protocol };",
  "  path = findPath(from, to); // may cross routers freely",
  "  for each segment (host-or-router to host-or-router) in path:",
  "    packet.ethernet = buildFrame(segment.start, segment.end);",
  "    transmit across segment.links; switches forward unchanged;",
  "    if segment.end is a router:",
  "      packet.ip.ttl -= 1;",
  "      if (packet.ip.ttl <= 0) { drop(); sendICMPTimeExceeded(); return; }",
  "      strip Ethernet; loop continues, rebuilding it for the next segment;",
  "    else: // final destination",
  "      strip Ethernet and IP; deliver(payload);",
  "}",
];

export const IPV4_ANNOTATIONS: Record<number, string> = {
  1: "The IP header is built once and survives the entire trip — only its TTL field ever changes en route.",
  3: "A brand-new Ethernet frame every segment: source/destination MAC only ever mean 'the next hop', never the final destination.",
  5: "Switches forward this exact frame untouched — they never rebuild it, never look at the IP header inside it.",
  6: "TTL exists to guarantee a misrouted packet eventually dies instead of looping forever — decremented once per router, nowhere else.",
  8: "By the time IP hands off to TCP/UDP, both the outer Ethernet frame and the IP header have done their job and are discarded.",
};

export const IPV4_COMPLEXITY = {
  time: "O(hops)",
  space: "O(1)",
  note: "One Ethernet rebuild and one TTL decrement per router hop — independent of how large the rest of the topology is.",
};
