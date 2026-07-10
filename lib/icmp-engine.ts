import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode, findDevice as findDeviceByLabel } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IcmpStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  hops: string[]; // device labels discovered so far (traceroute only)
}

const FRAMES_PER_LINK = 6;
const TTL = 64;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function st(topology: TopologyState, packet: PacketState, hops: string[], explanation: string, hl: number, phase?: string): IcmpStep {
  return {
    topology,
    packet: clonePacket(packet),
    hops: [...hops],
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function travel(topology: TopologyState, packet: PacketState, hops: string[], from: DeviceNode, to: DeviceNode, steps: IcmpStep[], verb: string): PacketState {
  const link = findLink(topology, from.id, to.id)!;
  packet = { ...clonePacket(packet), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
  steps.push(st(topology, packet, hops, `${verb} ${from.label} → ${to.label}.`, 4));
  for (let f = 1; f <= FRAMES_PER_LINK; f++) {
    packet = { ...clonePacket(packet), progress: f / FRAMES_PER_LINK };
    steps.push(st(topology, packet, hops, `On the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}%).`, 4));
  }
  return { ...clonePacket(packet), atNode: to.id, currentLink: null, progress: 0 };
}

// ─── Ping — echo request out, echo reply back ────────────────────────────────

export function ping(topology: TopologyState, fromLabel: string, toLabel: string): IcmpStep[] {
  const steps: IcmpStep[] = [];
  const from = findDeviceByLabel(topology, fromLabel);
  const to = findDeviceByLabel(topology, toLabel);

  let packet: PacketState = { id: "icmp-1", layers: [], currentLink: null, progress: 0, atNode: from?.id ?? null, fate: "queued" };

  if (!from || !to) { steps.push(st(topology, packet, [], `Device "${!from ? fromLabel : toLabel}" does not exist.`, 1, "error")); return steps; }
  if (!from.ip || !to.ip) { steps.push(st(topology, packet, [], `Both devices need an IP address.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, fromLabel, toLabel);
  if (!pathLabels) { steps.push(st(topology, packet, [], `No path between "${fromLabel}" and "${toLabel}".`, 1, "error")); return steps; }
  const pathDevices = pathLabels.map((l) => findDeviceByLabel(topology, l)!);

  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIP: from.ip, dstIP: to.ip, ttl: TTL, protocol: "ICMP" } }, { protocol: "ICMP", fields: { type: "Echo Request (8)", id: 1, seq: 1 } }] };
  steps.push(st(topology, packet, [], `${fromLabel} builds an Echo Request (ICMP type 8) addressed to ${to.ip}.`, 1, "insert"));

  for (let i = 0; i < pathDevices.length - 1; i++) {
    packet = travel(topology, packet, [], pathDevices[i], pathDevices[i + 1], steps, "Leaving");
  }
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, [], `${toLabel} receives the Echo Request and immediately builds an Echo Reply (type 0).`, 5, "found"));

  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIP: to.ip, dstIP: from.ip, ttl: TTL, protocol: "ICMP" } }, { protocol: "ICMP", fields: { type: "Echo Reply (0)", id: 1, seq: 1 } }], atNode: to.id, fate: "queued" };
  const reversed = [...pathDevices].reverse();
  for (let i = 0; i < reversed.length - 1; i++) {
    packet = travel(topology, packet, [], reversed[i], reversed[i + 1], steps, "Returning via");
  }
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, [], `${fromLabel} receives the Echo Reply. Round trip complete.`, 8, "found"));

  return steps;
}

// ─── Traceroute — increasing TTL, one new hop revealed each round ───────────

export function traceroute(topology: TopologyState, fromLabel: string, toLabel: string): IcmpStep[] {
  const steps: IcmpStep[] = [];
  const from = findDeviceByLabel(topology, fromLabel);
  const to = findDeviceByLabel(topology, toLabel);

  let packet: PacketState = { id: "icmp-tr", layers: [], currentLink: null, progress: 0, atNode: from?.id ?? null, fate: "queued" };
  const hops: string[] = [];

  if (!from || !to) { steps.push(st(topology, packet, hops, `Device "${!from ? fromLabel : toLabel}" does not exist.`, 1, "error")); return steps; }
  if (!from.ip || !to.ip) { steps.push(st(topology, packet, hops, `Both devices need an IP address.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, fromLabel, toLabel);
  if (!pathLabels) { steps.push(st(topology, packet, hops, `No path between "${fromLabel}" and "${toLabel}".`, 1, "error")); return steps; }
  const pathDevices = pathLabels.map((l) => findDeviceByLabel(topology, l)!);

  const routers = pathDevices.slice(1, -1).filter((d) => d.kind === "router");
  const hopSequence = [...routers, pathDevices[pathDevices.length - 1]];

  steps.push(st(topology, packet, hops, `Sending probes with TTL = 1, 2, 3... Each router that discards an expired probe reveals itself.`, 2));

  for (let ttlValue = 1; ttlValue <= hopSequence.length; ttlValue++) {
    const targetDevice = hopSequence[ttlValue - 1];
    const targetIdx = pathDevices.findIndex((d) => d.id === targetDevice.id);
    const isFinal = targetDevice.id === pathDevices[pathDevices.length - 1].id;

    packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIP: from.ip, dstIP: to.ip, ttl: ttlValue, protocol: "ICMP" } }], atNode: from.id, currentLink: null, progress: 0, fate: "queued" };
    steps.push(st(topology, packet, hops, `Probe ${ttlValue}: TTL = ${ttlValue}.`, 3, "insert"));

    for (let i = 0; i < targetIdx; i++) {
      packet = travel(topology, packet, hops, pathDevices[i], pathDevices[i + 1], steps, "Leaving");
    }

    if (!isFinal) {
      hops.push(`${targetDevice.label} (${targetDevice.ip})`);
      packet = { ...clonePacket(packet), fate: "dropped" };
      steps.push(st(topology, packet, hops, `TTL hits 0 at ${targetDevice.label} — probe discarded, ${targetDevice.label} sends back "Time Exceeded", revealing itself as hop ${ttlValue}.`, 6, "error"));
    } else {
      hops.push(`${targetDevice.label} (${targetDevice.ip})`);
      packet = { ...clonePacket(packet), fate: "delivered" };
      steps.push(st(topology, packet, hops, `Probe ${ttlValue} reaches ${toLabel} — traceroute complete. ${hopSequence.length} hop(s) total.`, 8, "found"));
    }
  }

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ICMP_PING_CODE: string[] = [
  "function ping(target) {",
  "  request = { type: 'Echo Request', id, seq };",
  "  send(request, ttl: 64);",
  "  // travels the normal routed path, like any IPv4 packet",
  "  reply = target.onEchoRequest(request);",
  "  // target immediately mirrors it back as an Echo Reply",
  "  send(reply, to: source);",
  "  measure(roundTripTime);",
  "}",
];

export const ICMP_TRACEROUTE_CODE: string[] = [
  "function traceroute(target) {",
  "  for (ttl = 1; ; ttl++) {",
  "    probe = { ttl };",
  "    send(probe);",
  "    // each router along the path decrements ttl by 1",
  "    if (ttl expires at some router R):",
  "      R replies 'Time Exceeded'; record R as this hop;",
  "    else if (probe reaches target):",
  "      record target as the final hop; return hops;",
  "  }",
  "}",
];

export const ICMP_ANNOTATIONS: Record<number, string> = {
  1: "Ping is just an IPv4 packet like any other — ICMP is its own protocol number, carried the same way TCP or UDP would be.",
  4: "The path here is identical to a normal packet's — ping doesn't get special treatment from routers or switches.",
  5: "Echo Reply mirrors the identifier and sequence number from the request, so the sender can match replies to requests.",
  6: "TTL expiring is deliberate here, not a bug — traceroute exploits the exact mechanism that normally prevents routing loops.",
  8: "The full hop list is just every router that happened to discard a probe on the way, in order — that's the entire trick.",
};

export const ICMP_COMPLEXITY = {
  time: "ping: O(hops); traceroute: O(hops²)",
  space: "O(hops)",
  note: "Traceroute resends a probe from scratch for every TTL value, so total work scales with the square of the path length — fine for the handful of hops on a real network.",
};
