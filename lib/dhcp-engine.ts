import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DhcpStep extends Step {
  topology: TopologyState; // the client device's `ip` field changes across this trace
  packet: PacketState;
}

const FRAMES_PER_LINK = 6;
const OFFERED_IP = "192.168.1.50";
const LEASE_SECONDS = 3600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function cloneTopologyWithClientIp(topology: TopologyState, clientId: string, ip: string | undefined): TopologyState {
  return {
    ...topology,
    devices: topology.devices.map((d) => (d.id === clientId ? { ...d, ip } : { ...d })),
    positions: { ...topology.positions },
  };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): DhcpStep {
  return {
    topology,
    packet: clonePacket(packet),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── DORA: Discover, Offer, Request, Ack ────────────────────────────────────
// The client has no IP at all when this starts — its first message is a
// broadcast precisely because it doesn't yet have an address anyone could
// reply to directly.

export function runDhcp(topology: TopologyState, clientLabel: string, serverLabel: string): DhcpStep[] {
  const steps: DhcpStep[] = [];

  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);

  let liveTopology = topology;
  let packet: PacketState = { id: "dhcp", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client) { steps.push(st(liveTopology, packet, `Device "${clientLabel}" does not exist.`, 1, "error")); return steps; }
  if (!server) { steps.push(st(liveTopology, packet, `Device "${serverLabel}" does not exist.`, 1, "error")); return steps; }

  const link = findLink(topology, client.id, server.id);
  if (!link) {
    steps.push(st(liveTopology, packet, `"${clientLabel}" and "${serverLabel}" aren't directly connected.`, 1, "error"));
    return steps;
  }

  steps.push(st(liveTopology, packet, `${clientLabel} has no IP address at all — it needs one before it can do anything else on the network.`, 1));

  const clientDevice: DeviceNode = client;
  const serverDevice: DeviceNode = server;
  const clientServerLink = link;

  function travel(pkt: PacketState, label: string, forward: boolean) {
    const [from, to] = forward ? [clientDevice, serverDevice] : [serverDevice, clientDevice];
    let p: PacketState = { ...clonePacket(pkt), currentLink: clientServerLink.id, atNode: null, progress: 0, fate: "in-flight" };
    steps.push(st(liveTopology, p, `${label} leaving ${from.label}.`, 3));
    for (let f = 1; f <= FRAMES_PER_LINK; f++) {
      p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
      steps.push(st(liveTopology, p, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 3));
    }
    p = { ...clonePacket(p), atNode: to.id, currentLink: null, progress: 0 };
    return p;
  }

  const transactionId = "0x3F2A91";

  // --- 1. DISCOVER (broadcast) ---
  packet = {
    ...clonePacket(packet),
    layers: [
      { protocol: "UDP", fields: { srcPort: 68, dstPort: 67, note: "broadcast — client has no IP to receive a unicast reply on yet" } },
      { protocol: "DHCP", fields: { messageType: "DHCPDISCOVER", transactionId, clientMac: client.mac } },
    ],
  };
  steps.push(st(liveTopology, packet, `${clientLabel} broadcasts DHCPDISCOVER: "Is there a DHCP server out there? I need an address." Source port 68, destination port 67 — the standard DHCP client/server ports.`, 3, "insert"));
  packet = travel(packet, "DISCOVER", true);
  steps.push(st(liveTopology, packet, `${serverLabel} receives the DISCOVER.`, 4, "found"));

  // --- 2. OFFER ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 67, dstPort: 68 } }, { protocol: "DHCP", fields: { messageType: "DHCPOFFER", transactionId, offeredIp: OFFERED_IP, leaseSeconds: LEASE_SECONDS, serverIdentifier: server.ip ?? "" } }] };
  steps.push(st(liveTopology, packet, `${serverLabel} offers ${OFFERED_IP}, leased for ${LEASE_SECONDS / 60} minutes.`, 5, "insert"));
  packet = travel(packet, "OFFER", false);
  steps.push(st(liveTopology, packet, `${clientLabel} receives the offer — but doesn't just start using it yet.`, 6, "found"));

  // --- 3. REQUEST (broadcast again) ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 68, dstPort: 67, note: "still broadcast — announces the choice to every DHCP server that might have offered" } }, { protocol: "DHCP", fields: { messageType: "DHCPREQUEST", transactionId, requestedIp: OFFERED_IP, serverIdentifier: server.ip ?? "" } }] };
  steps.push(st(liveTopology, packet, `${clientLabel} broadcasts DHCPREQUEST for ${OFFERED_IP} — a real network might have several DHCP servers reply to DISCOVER, so this step confirms which offer it's accepting (and tells the others they weren't picked).`, 7, "insert"));
  packet = travel(packet, "REQUEST", true);
  steps.push(st(liveTopology, packet, `${serverLabel} receives the REQUEST.`, 8, "found"));

  // --- 4. ACK ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 67, dstPort: 68 } }, { protocol: "DHCP", fields: { messageType: "DHCPACK", transactionId, assignedIp: OFFERED_IP, leaseSeconds: LEASE_SECONDS } }] };
  steps.push(st(liveTopology, packet, `${serverLabel} confirms with DHCPACK: ${OFFERED_IP} is officially leased to ${clientLabel}.`, 9, "insert"));
  packet = travel(packet, "ACK", false);
  packet = { ...clonePacket(packet), fate: "delivered" };

  liveTopology = cloneTopologyWithClientIp(liveTopology, client.id, OFFERED_IP);
  steps.push(st(liveTopology, packet, `${clientLabel} configures itself with ${OFFERED_IP}. It can now participate on the network like any other device — DORA (Discover, Offer, Request, Ack) is complete.`, 10, "found"));

  // --- Lease renewal, contrasted with the broadcast dance above ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 68, dstPort: 67, note: "unicast this time — straight to the server it already knows" } }, { protocol: "DHCP", fields: { messageType: "DHCPREQUEST", transactionId: "0x3F2A92", requestedIp: OFFERED_IP } }] };
  steps.push(st(liveTopology, packet, `Later, before the lease expires: ${clientLabel} already knows its server, so renewal is a direct unicast REQUEST — no broadcast needed this time.`, 7, "default"));
  packet = travel(packet, "RENEW", true);
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 67, dstPort: 68 } }, { protocol: "DHCP", fields: { messageType: "DHCPACK", transactionId: "0x3F2A92", assignedIp: OFFERED_IP, leaseSeconds: LEASE_SECONDS } }] };
  packet = travel(packet, "ACK", false);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(liveTopology, packet, `${serverLabel} renews the same lease for another ${LEASE_SECONDS / 60} minutes — same IP, fresh lease, no re-negotiation needed.`, 9, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const DHCP_CODE: string[] = [
  "// client (no IP yet)                          // server",
  "broadcast(DHCPDISCOVER);",
  "                                                on receive(DISCOVER):",
  "                                                  offer = pickFreeIP();",
  "                                                  reply(DHCPOFFER, offer);",
  "on receive(OFFER):",
  "  broadcast(DHCPREQUEST, offer.ip);   // confirms the choice",
  "                                                on receive(REQUEST):",
  "                                                  lease(client, offer.ip);",
  "                                                  reply(DHCPACK, offer.ip);",
  "on receive(ACK):",
  "  configure(self, offer.ip);           // finally usable",
];

export const DHCP_ANNOTATIONS: Record<number, string> = {
  3: "Broadcast is the only option here — the client genuinely has no address a server could send a unicast reply to.",
  5: "A real network can have more than one DHCP server; the client might receive several OFFERs and only accept one.",
  7: "Broadcasting the REQUEST (instead of unicasting to the chosen server) also tells every other server that offered that their address wasn't picked — the same message serves both purposes.",
  9: "The lease is a real time limit — a client that goes silent for too long risks its address being reassigned to someone else.",
  10: "Only after ACK does the client actually apply the address to itself — using an offered IP before confirmation would be premature.",
};

export const DHCP_COMPLEXITY = {
  time: "O(1) round trips (4 messages)",
  space: "O(leased addresses) on the server",
  note: "Fixed at 4 messages for the initial lease (or 2 for a renewal) — the cost doesn't grow with how large the network is, only the server's job of tracking who has which address does.",
};
