import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TcpConnState = "CLOSED" | "LISTEN" | "SYN_SENT" | "SYN_RCVD" | "ESTABLISHED";

export interface TcpHandshakeStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  clientState: TcpConnState;
  serverState: TcpConnState;
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

function st(
  topology: TopologyState, packet: PacketState, clientState: TcpConnState, serverState: TcpConnState,
  explanation: string, hl: number, phase?: string
): TcpHandshakeStep {
  return {
    topology,
    packet: clonePacket(packet),
    clientState,
    serverState,
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// Random-ish but deterministic-looking Initial Sequence Number, same spirit
// as the demo MAC/IP assignment elsewhere in this project — a real stack
// picks this pseudo-randomly per connection to make sequence prediction hard.
export function randomIsn(): number {
  return 1000 + Math.floor(Math.random() * 9000);
}

// ─── The three-way handshake: SYN → SYN-ACK → ACK ───────────────────────────
// Each leg is a real trip across the topology (so it can cross routers, same
// as any other IP-layer delivery) — this isn't a diagram, it's the same
// hop-by-hop travel every other engine in this project uses.

export function tcpHandshake(
  topology: TopologyState,
  clientLabel: string,
  serverLabel: string,
  clientPort: number,
  serverPort: number
): TcpHandshakeStep[] {
  const steps: TcpHandshakeStep[] = [];

  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);

  let packet: PacketState = { id: "tcp-syn", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client) { steps.push(st(topology, packet, "CLOSED", "LISTEN", `Device "${clientLabel}" does not exist.`, 1, "error")); return steps; }
  if (!server) { steps.push(st(topology, packet, "CLOSED", "LISTEN", `Device "${serverLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, clientLabel, serverLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, "CLOSED", "LISTEN", `No path between "${clientLabel}" and "${serverLabel}".`, 1, "error"));
    return steps;
  }
  const path = pathLabels.map((label) => findDevice(topology, label)!);

  function travel(pkt: PacketState, label: string, clientState: TcpConnState, serverState: TcpConnState, forward: boolean) {
    const hops = forward ? path : [...path].reverse();
    let p = pkt;
    for (let i = 0; i < hops.length - 1; i++) {
      const hopFrom = hops[i];
      const hopTo = hops[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, clientState, serverState, `${label} leaving ${hopFrom.label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, clientState, serverState, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 1));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  const clientIsn = randomIsn();
  const serverIsn = randomIsn();

  // --- 1. SYN: client -> server ---
  packet = {
    ...clonePacket(packet),
    layers: [{ protocol: "TCP", fields: { srcPort: clientPort, dstPort: serverPort, seq: clientIsn, ack: "-", flags: "SYN", window: 65535 } }],
  };
  steps.push(st(topology, packet, "SYN_SENT", "LISTEN", `${clientLabel} sends SYN (seq=${clientIsn}) — "I'd like to connect, and this is where my sequence numbers start."`, 1, "insert"));
  packet = travel(packet, "SYN", "SYN_SENT", "LISTEN", true);
  packet = { ...clonePacket(packet), atNode: server.id };
  steps.push(st(topology, packet, "SYN_SENT", "SYN_RCVD", `${serverLabel} receives the SYN and moves from LISTEN to SYN_RCVD.`, 3, "found"));

  // --- 2. SYN-ACK: server -> client ---
  packet = {
    ...clonePacket(packet),
    id: "tcp-synack",
    layers: [{ protocol: "TCP", fields: { srcPort: serverPort, dstPort: clientPort, seq: serverIsn, ack: clientIsn + 1, flags: "SYN,ACK", window: 65535 } }],
  };
  steps.push(st(topology, packet, "SYN_SENT", "SYN_RCVD", `${serverLabel} replies SYN-ACK (seq=${serverIsn}, ack=${clientIsn + 1}) — "I accept, here's where my numbers start, and I got yours."`, 4, "insert"));
  packet = travel(packet, "SYN-ACK", "SYN_SENT", "SYN_RCVD", false);
  packet = { ...clonePacket(packet), atNode: client.id };
  steps.push(st(topology, packet, "ESTABLISHED", "SYN_RCVD", `${clientLabel} receives the SYN-ACK and moves straight to ESTABLISHED — it already sent its own SYN, so this is all it needed.`, 6, "found"));

  // --- 3. ACK: client -> server ---
  packet = {
    ...clonePacket(packet),
    id: "tcp-ack",
    layers: [{ protocol: "TCP", fields: { srcPort: clientPort, dstPort: serverPort, seq: clientIsn + 1, ack: serverIsn + 1, flags: "ACK", window: 65535 } }],
  };
  steps.push(st(topology, packet, "ESTABLISHED", "SYN_RCVD", `${clientLabel} sends the final ACK (seq=${clientIsn + 1}, ack=${serverIsn + 1}).`, 7, "insert"));
  packet = travel(packet, "ACK", "ESTABLISHED", "SYN_RCVD", true);
  packet = { ...clonePacket(packet), atNode: server.id, fate: "delivered" };
  steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED", `${serverLabel} receives the ACK and moves to ESTABLISHED. Both sides now agree on each other's starting sequence number — data can flow.`, 9, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_HANDSHAKE_CODE: string[] = [
  "// client                                    // server",
  "state = CLOSED;                              state = LISTEN;",
  "",
  "send(SYN, seq: clientIsn);",
  "state = SYN_SENT;",
  "                                              on receive(SYN):",
  "                                                state = SYN_RCVD;",
  "                                                send(SYN, ACK, seq: serverIsn, ack: clientIsn+1);",
  "on receive(SYN, ACK):",
  "  state = ESTABLISHED;",
  "  send(ACK, seq: clientIsn+1, ack: serverIsn+1);",
  "                                              on receive(ACK):",
  "                                                state = ESTABLISHED;",
];

export const TCP_HANDSHAKE_ANNOTATIONS: Record<number, string> = {
  1: "The Initial Sequence Number isn't 0 or 1 — a real stack picks it pseudo-randomly per connection so an attacker can't easily predict or spoof it.",
  3: "SYN_RCVD is a real, separate state — the connection isn't open yet, the server has only acknowledged the request.",
  4: "SYN-ACK does two jobs in one segment: it's simultaneously the server's own SYN and its acknowledgment of the client's SYN.",
  6: "The client can move to ESTABLISHED immediately — it already sent its SYN, so receiving the SYN-ACK is the only thing it was waiting on.",
  7: "This ACK carries no data of its own, but it's what lets the server also move to ESTABLISHED.",
  9: "Both Initial Sequence Numbers are now known to both sides — every later segment's seq/ack numbers count up from these two starting points.",
};

export const TCP_HANDSHAKE_COMPLEXITY = {
  time: "O(hops) per leg × 3 legs",
  space: "O(1)",
  note: "Exactly three segments, regardless of how much data will eventually be sent — the cost of opening a TCP connection is fixed, not proportional to the conversation that follows.",
};
