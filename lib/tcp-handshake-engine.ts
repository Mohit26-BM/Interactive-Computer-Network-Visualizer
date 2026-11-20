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

export interface HandshakeOptions {
  /** How many SYNs are lost before one gets through (0-7). 7 = the connection attempt times out. */
  synLosses?: number;
  clientMss?: number;
  serverMss?: number;
}

export const MAX_SYN_ATTEMPTS = 7; // 1 original + 6 retries (Linux tcp_syn_retries = 6): 1+2+4+8+16+32+64 = 127 s
const WSCALE = 7;                  // window scale shift: the 16-bit window field is multiplied by 2^7 = 128

export function tcpHandshake(
  topology: TopologyState,
  clientLabel: string,
  serverLabel: string,
  clientPort: number,
  serverPort: number,
  opts: HandshakeOptions = {}
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
      steps.push(st(topology, p, clientState, serverState, `${label} leaving ${hopFrom.label}.`, 0));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, clientState, serverState, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 0));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  const clientIsn = randomIsn();
  const serverIsn = randomIsn();

  const clientMss = opts.clientMss ?? 1460;
  const serverMss = opts.serverMss ?? 1460;
  const synLosses = Math.max(0, Math.min(MAX_SYN_ATTEMPTS, Math.floor(opts.synLosses ?? 0)));
  const synOptions = `MSS ${clientMss}, SACK-permitted, Timestamps, WScale ${WSCALE}`;
  const synLayer = () => ({ protocol: "TCP", fields: { srcPort: clientPort, dstPort: serverPort, seq: clientIsn, ack: "-", flags: "SYN", window: 65535, options: synOptions } });

  // --- 0. Lost SYNs: retransmission timer with exponential backoff (RFC 6298: initial RTO 1 s) ---
  let rto = 1;
  let waited = 0;
  const firstLink = findLink(topology, path[0].id, path[1].id)!;
  for (let attempt = 1; attempt <= synLosses; attempt++) {
    packet = { ...clonePacket(packet), id: "tcp-syn", layers: [synLayer()], atNode: client.id, currentLink: null, progress: 0, fate: "queued" };
    steps.push(st(topology, packet, "SYN_SENT", "LISTEN",
      attempt === 1
        ? `${clientLabel} sends SYN (seq=${clientIsn}) and starts a retransmission timer of ${rto} s. The SYN also advertises the options it supports: MSS, SACK, timestamps and window scaling.`
        : `${clientLabel} retransmits the SYN (attempt ${attempt} of ${MAX_SYN_ATTEMPTS}, same seq=${clientIsn}).`, 4, "insert"));
    for (let f = 1; f <= 3; f++) {
      packet = { ...clonePacket(packet), currentLink: firstLink.id, atNode: null, progress: f / FRAMES_PER_LINK, fate: "in-flight" };
      steps.push(st(topology, packet, "SYN_SENT", "LISTEN", `SYN on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 0));
    }
    packet = { ...clonePacket(packet), fate: "dropped" };
    steps.push(st(topology, packet, "SYN_SENT", "LISTEN", `The SYN is lost (a full queue, a failed link, or a firewall dropping it). The server never sees it, so nothing comes back.`, 0, "error"));
    waited += rto;
    packet = { ...clonePacket(packet), atNode: client.id, currentLink: null, progress: 0, fate: "queued" };
    if (attempt === MAX_SYN_ATTEMPTS) {
      steps.push(st(topology, packet, "CLOSED", "LISTEN",
        `After ${waited} s and ${MAX_SYN_ATTEMPTS} attempts ${clientLabel} gives up: connect() fails with "Connection timed out". (Linux tries 1 + 6 retries by default.)`, 16, "error"));
      return steps;
    }
    steps.push(st(topology, packet, "SYN_SENT", "LISTEN",
      `No SYN-ACK within ${rto} s (${waited} s since the first SYN). The timer fires and the timeout DOUBLES to ${rto * 2} s - exponential backoff stops a struggling network from being flooded with retries.`, 15, "default"));
    rto *= 2;
  }

  // --- 1. SYN: client -> server ---
  packet = {
    ...clonePacket(packet),
    id: "tcp-syn",
    atNode: client.id, currentLink: null, progress: 0, fate: "queued",
    layers: [synLayer()],
  };
  steps.push(st(topology, packet, "SYN_SENT", "LISTEN",
    synLosses === 0
      ? `${clientLabel} sends SYN (seq=${clientIsn}) — "I'd like to connect, and this is where my sequence numbers start." The options list says what it supports: MSS ${clientMss}, SACK, timestamps, window scaling x${2 ** WSCALE}.`
      : `${clientLabel} retransmits the SYN (attempt ${synLosses + 1} of ${MAX_SYN_ATTEMPTS}, same seq=${clientIsn}). This one gets through.`, 4, "insert"));
  packet = travel(packet, "SYN", "SYN_SENT", "LISTEN", true);
  packet = { ...clonePacket(packet), atNode: server.id };
  steps.push(st(topology, packet, "SYN_SENT", "SYN_RCVD", `${serverLabel} receives the SYN and moves from LISTEN to SYN_RCVD. A busy server keeps only a small record here (or uses SYN cookies), which is why SYN floods try to fill this state.`, 7, "found"));

  // --- 2. SYN-ACK: server -> client ---
  packet = {
    ...clonePacket(packet),
    id: "tcp-synack",
    layers: [{ protocol: "TCP", fields: { srcPort: serverPort, dstPort: clientPort, seq: serverIsn, ack: clientIsn + 1, flags: "SYN,ACK", window: 65535, options: `MSS ${serverMss}, SACK-permitted, Timestamps, WScale ${WSCALE}` } }],
  };
  steps.push(st(topology, packet, "SYN_SENT", "SYN_RCVD", `${serverLabel} replies SYN-ACK (seq=${serverIsn}, ack=${clientIsn + 1}) — "I accept, here's where my numbers start, and I got yours." It answers each option it also supports.`, 8, "insert"));
  packet = travel(packet, "SYN-ACK", "SYN_SENT", "SYN_RCVD", false);
  packet = { ...clonePacket(packet), atNode: client.id };
  steps.push(st(topology, packet, "ESTABLISHED", "SYN_RCVD", `${clientLabel} receives the SYN-ACK and moves straight to ESTABLISHED — it already sent its own SYN, so this is all it needed.`, 10, "found"));

  // --- 3. ACK: client -> server ---
  packet = {
    ...clonePacket(packet),
    id: "tcp-ack",
    layers: [{ protocol: "TCP", fields: { srcPort: clientPort, dstPort: serverPort, seq: clientIsn + 1, ack: serverIsn + 1, flags: "ACK", window: 65535 } }],
  };
  steps.push(st(topology, packet, "ESTABLISHED", "SYN_RCVD", `${clientLabel} sends the final ACK (seq=${clientIsn + 1}, ack=${serverIsn + 1}). From now on the window field is multiplied by ${2 ** WSCALE}.`, 11, "insert"));
  packet = travel(packet, "ACK", "ESTABLISHED", "SYN_RCVD", true);
  packet = { ...clonePacket(packet), atNode: server.id, fate: "delivered" };
  steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED", `${serverLabel} receives the ACK and moves to ESTABLISHED. Both sides now agree on each other's starting sequence number — data can flow.`, 13, "found"));

  const mss = Math.min(clientMss, serverMss);
  steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED",
    `Negotiated: segment size MSS = min(${clientMss}, ${serverMss}) = ${mss} bytes (never fragment: Ethernet MTU 1500 - 40 bytes of headers); window scaling x${2 ** WSCALE} (both sides offered it), so the 16-bit window can describe up to ${((65535 * 2 ** WSCALE) / 1048576).toFixed(0)} MB; SACK and timestamps are on. Options exist only if BOTH SYNs carry them.`, 13, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_HANDSHAKE_CODE: string[] = [
  "// client                                    // server",
  "state = CLOSED;                              state = LISTEN;",
  "",
  "send(SYN, seq: clientIsn, options: MSS, SACK, WScale);",
  "state = SYN_SENT;",
  "                                              on receive(SYN):",
  "                                                state = SYN_RCVD;",
  "                                                send(SYN, ACK, seq: serverIsn, ack: clientIsn+1, options);",
  "on receive(SYN, ACK):",
  "  state = ESTABLISHED;",
  "  send(ACK, seq: clientIsn+1, ack: serverIsn+1);",
  "                                              on receive(ACK):",
  "                                                state = ESTABLISHED;",
  "// if no SYN-ACK arrives before the retransmission timer (RTO) fires:",
  "  resend(SYN); rto = rto * 2;        // 1 s, 2 s, 4 s, 8 s ... exponential backoff",
  "  after 6 retries (about 127 s): connect() fails with ETIMEDOUT",
];

export const TCP_HANDSHAKE_ANNOTATIONS: Record<number, string> = {
  4: "The Initial Sequence Number isn't 0 or 1 — a real stack picks it pseudo-randomly per connection so an attacker can't easily predict or spoof it. Options ride in the SYN only: MSS (largest segment), SACK, timestamps and window scale.",
  7: "SYN_RCVD is a real, separate state — the connection isn't open yet, the server has only acknowledged the request. Servers defend it with SYN cookies and a backlog limit.",
  8: "SYN-ACK does two jobs in one segment: it's simultaneously the server's own SYN and its acknowledgment of the client's SYN. A feature is only used if both sides' SYNs include it.",
  10: "The client can move to ESTABLISHED immediately — it already sent its SYN, so receiving the SYN-ACK is the only thing it was waiting on.",
  11: "This ACK carries no data of its own, but it's what lets the server also move to ESTABLISHED. The client may already attach data to it (and TCP Fast Open can even put data in the SYN).",
  13: "Both Initial Sequence Numbers are now known to both sides — every later segment's seq/ack numbers count up from these two starting points.",
  15: "The initial timeout is 1 second (RFC 6298) and doubles on every failure. This is why a connection to a dead host can hang for over two minutes.",
  16: "Linux retries the SYN 6 times by default (tcp_syn_retries), a total of 1+2+4+8+16+32+64 = 127 seconds before the application sees an error.",
};

export const TCP_HANDSHAKE_COMPLEXITY = {
  time: "O(hops) per leg × 3 legs",
  space: "O(1)",
  note: "Exactly three segments, regardless of how much data will eventually be sent — the cost of opening a TCP connection is fixed, not proportional to the conversation that follows.",
};
