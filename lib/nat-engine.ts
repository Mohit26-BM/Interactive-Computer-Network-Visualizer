import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

// The router's public identity — a constant owned by this engine rather than
// a second field on DeviceNode (see buildNatTopology's comment).
export const ROUTER_PUBLIC_IP = "203.0.113.5";
const PAT_PORT_START = 40001;

export interface NatMapping {
  insideLocalIp: string;
  insideLocalPort: number;
  insideGlobalIp: string;
  insideGlobalPort: number;
}

export type NatTable = NatMapping[];

export interface NatStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  natTable: NatTable;
}

export interface NatResult {
  steps: NatStep[];
  table: NatTable;
}

const FRAMES_PER_LINK = 6;

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

function st(topology: TopologyState, packet: PacketState, table: NatTable, explanation: string, hl: number, phase?: string): NatStep {
  return {
    topology,
    packet: clonePacket(packet),
    natTable: table.map((m) => ({ ...m })),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── One request/response through PAT (Port Address Translation) ───────────
// The public internet never sees the private IP at all — only the router's
// one public address, disambiguated per-connection by port number alone.

export function sendThroughNat(
  topology: TopologyState,
  clientLabel: string,
  routerLabel: string,
  serverLabel: string,
  table: NatTable,
  clientPort: number
): NatResult {
  const steps: NatStep[] = [];

  const client = findDevice(topology, clientLabel);
  const router = findDevice(topology, routerLabel);
  const server = findDevice(topology, serverLabel);

  let packet: PacketState = { id: "nat", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client || !router || !server) {
    steps.push(st(topology, packet, table, `One of the required devices is missing from this topology.`, 1, "error"));
    return { steps, table };
  }

  function travel(pkt: PacketState, label: string, fromLabel: string, toLabel: string, currentTable: NatTable) {
    const pathLabels = findPath(topology, fromLabel, toLabel)!;
    const path = pathLabels.map((l) => findDevice(topology, l)!);
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const link = findLink(topology, path[i].id, path[i + 1].id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, currentTable, `${label} leaving ${path[i].label}.`, 2));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, currentTable, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}%).`, 2));
      }
      p = { ...clonePacket(p), atNode: path[i + 1].id, currentLink: null, progress: 0 };
    }
    return p;
  }

  const clientIp = client.ip ?? "";
  const serverIp = server.ip ?? "";

  // --- 1. Client -> Router (private addressing) ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIp: clientIp, srcPort: clientPort, dstIp: serverIp, dstPort: 80 } }] };
  steps.push(st(topology, packet, table, `${clientLabel} sends a packet: ${client.ip}:${clientPort} → ${server.ip}:80 — ordinary private addressing, as far as it knows.`, 1, "insert"));
  packet = travel(packet, "Request", clientLabel, routerLabel, table);
  steps.push(st(topology, packet, table, `${routerLabel} receives it on its private (inside) interface.`, 2, "found"));

  // --- 2. Router translates and forwards outward ---
  let mapping = table.find((m) => m.insideLocalIp === client.ip && m.insideLocalPort === clientPort);
  let newTable = table;
  if (!mapping) {
    mapping = { insideLocalIp: client.ip!, insideLocalPort: clientPort, insideGlobalIp: ROUTER_PUBLIC_IP, insideGlobalPort: PAT_PORT_START + table.length };
    newTable = [...table, mapping];
    steps.push(st(topology, packet, newTable, `No existing mapping for ${client.ip}:${clientPort} — ${routerLabel} allocates a new one: inside local ${mapping.insideLocalIp}:${mapping.insideLocalPort} ↔ inside global ${mapping.insideGlobalIp}:${mapping.insideGlobalPort}.`, 3, "insert"));
  } else {
    steps.push(st(topology, packet, newTable, `${routerLabel} already has a mapping for ${client.ip}:${clientPort} — reusing inside global port ${mapping.insideGlobalPort} instead of allocating a new one.`, 3, "found"));
  }

  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIp: mapping.insideGlobalIp, srcPort: mapping.insideGlobalPort, dstIp: serverIp, dstPort: 80 } }] };
  steps.push(st(topology, packet, newTable, `${routerLabel} rewrites the source to ${mapping.insideGlobalIp}:${mapping.insideGlobalPort} and forwards it onward — ${client.ip} never appears on the public side at all.`, 4, "insert"));
  packet = travel(packet, "Request", routerLabel, serverLabel, newTable);
  steps.push(st(topology, packet, newTable, `${serverLabel} receives the request. As far as it can tell, it's talking to ${mapping.insideGlobalIp}:${mapping.insideGlobalPort} — it has no idea ${clientLabel} exists.`, 5, "found"));

  // --- 3. Server -> Router (reply to the public address) ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIp: serverIp, srcPort: 80, dstIp: mapping.insideGlobalIp, dstPort: mapping.insideGlobalPort } }] };
  steps.push(st(topology, packet, newTable, `${serverLabel} replies to ${mapping.insideGlobalIp}:${mapping.insideGlobalPort} — the only address it ever saw.`, 6, "insert"));
  packet = travel(packet, "Response", serverLabel, routerLabel, newTable);
  steps.push(st(topology, packet, newTable, `${routerLabel} receives the reply on its public (outside) interface.`, 7, "found"));

  // --- 4. Router translates back and forwards inward ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "IPv4", fields: { srcIp: serverIp, srcPort: 80, dstIp: mapping.insideLocalIp, dstPort: mapping.insideLocalPort } }] };
  steps.push(st(topology, packet, newTable, `${routerLabel} looks up inside global port ${mapping.insideGlobalPort} in its NAT table, finds the mapping back to ${mapping.insideLocalIp}:${mapping.insideLocalPort}, and rewrites the destination.`, 8, "insert"));
  packet = travel(packet, "Response", routerLabel, clientLabel, newTable);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, newTable, `${clientLabel} receives the response, addressed exactly the way it expects — the entire translation was invisible from here.`, 9, "found"));

  return { steps, table: newTable };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const NAT_CODE: string[] = [
  "function forwardOutbound(packet, natTable) {",
  "  mapping = natTable.find(m => m.insideLocal == (packet.srcIp, packet.srcPort));",
  "  if (!mapping) {",
  "    mapping = { insideLocal: (packet.srcIp, packet.srcPort),",
  "                insideGlobal: (routerPublicIp, nextFreePort()) };",
  "    natTable.push(mapping);",
  "  }",
  "  packet.srcIp = mapping.insideGlobal.ip;",
  "  packet.srcPort = mapping.insideGlobal.port;",
  "  forward(packet);",
  "}",
  "",
  "function forwardInbound(packet, natTable) {",
  "  mapping = natTable.find(m => m.insideGlobal.port == packet.dstPort);",
  "  packet.dstIp = mapping.insideLocal.ip;",
  "  packet.dstPort = mapping.insideLocal.port;",
  "  forward(packet);",
  "}",
];

export const NAT_ANNOTATIONS: Record<number, string> = {
  1: "The private address space (192.168.x.x here) is only ever meaningful inside this LAN — it's reused by millions of other home networks simultaneously.",
  3: "One public IP can serve many private hosts at once precisely because each gets its own port on the public side — this is Port Address Translation (PAT).",
  4: "This rewrite is the entire trick: the private IP is replaced before the packet ever reaches the public internet.",
  8: "Without this table lookup, the router would have no way to know which private host an inbound reply was meant for — the port number is doing all the work.",
};

export const NAT_COMPLEXITY = {
  time: "O(hops) per direction, O(1) table lookup",
  space: "O(active connections)",
  note: "One NAT table entry per active connection — the table grows with concurrent connections, not with how much data any of them sends.",
};
