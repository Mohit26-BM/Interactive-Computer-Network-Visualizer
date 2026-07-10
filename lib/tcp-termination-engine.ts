import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TerminationState = "ESTABLISHED" | "FIN_WAIT_1" | "FIN_WAIT_2" | "TIME_WAIT" | "CLOSED" | "CLOSE_WAIT" | "LAST_ACK";

export interface TcpTerminationStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  initiatorState: TerminationState;
  responderState: TerminationState;
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
  topology: TopologyState, packet: PacketState, initiatorState: TerminationState, responderState: TerminationState,
  explanation: string, hl: number, phase?: string
): TcpTerminationStep {
  return {
    topology, packet: clonePacket(packet), initiatorState, responderState,
    explanation, highlightLine: hl, highlightNodes: packet.atNode ? [packet.atNode] : [], phase,
  };
}

// ─── The four-way close: FIN, ACK, FIN, ACK ─────────────────────────────────
// TCP is full-duplex, so each direction has to be closed independently — that
// independence is exactly why it takes four segments instead of two.

export function tcpTerminate(
  topology: TopologyState,
  initiatorLabel: string,
  responderLabel: string,
  initiatorPort: number,
  responderPort: number
): TcpTerminationStep[] {
  const steps: TcpTerminationStep[] = [];

  const initiator = findDevice(topology, initiatorLabel);
  const responder = findDevice(topology, responderLabel);

  let packet: PacketState = { id: "fin-1", layers: [], currentLink: null, progress: 0, atNode: initiator?.id ?? null, fate: "queued" };

  if (!initiator) { steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED", `Device "${initiatorLabel}" does not exist.`, 1, "error")); return steps; }
  if (!responder) { steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED", `Device "${responderLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, initiatorLabel, responderLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, "ESTABLISHED", "ESTABLISHED", `No path between "${initiatorLabel}" and "${responderLabel}".`, 1, "error"));
    return steps;
  }
  const path = pathLabels.map((label) => findDevice(topology, label)!);

  function travel(pkt: PacketState, label: string, initiatorState: TerminationState, responderState: TerminationState, forward: boolean) {
    const hops = forward ? path : [...path].reverse();
    let p = pkt;
    for (let i = 0; i < hops.length - 1; i++) {
      const hopFrom = hops[i];
      const hopTo = hops[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, initiatorState, responderState, `${label} leaving ${hopFrom.label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, initiatorState, responderState, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 1));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  // --- 1. FIN: initiator -> responder ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TCP", fields: { srcPort: initiatorPort, dstPort: responderPort, flags: "FIN,ACK" } }] };
  steps.push(st(topology, packet, "FIN_WAIT_1", "ESTABLISHED", `${initiatorLabel} is done sending — it sends FIN and moves to FIN_WAIT_1. It can still receive data; only its outgoing half is closing.`, 1, "insert"));
  packet = travel(packet, "FIN", "FIN_WAIT_1", "ESTABLISHED", true);
  packet = { ...clonePacket(packet), atNode: responder.id };
  steps.push(st(topology, packet, "FIN_WAIT_1", "CLOSE_WAIT", `${responderLabel} receives the FIN and moves to CLOSE_WAIT — it acknowledges right away, but its own half of the connection is still open.`, 3, "found"));

  // --- 2. ACK: responder -> initiator ---
  packet = { ...clonePacket(packet), id: "ack-of-fin", layers: [{ protocol: "TCP", fields: { srcPort: responderPort, dstPort: initiatorPort, flags: "ACK" } }] };
  steps.push(st(topology, packet, "FIN_WAIT_1", "CLOSE_WAIT", `${responderLabel} sends ACK for the FIN.`, 3, "insert"));
  packet = travel(packet, "ACK", "FIN_WAIT_1", "CLOSE_WAIT", false);
  packet = { ...clonePacket(packet), atNode: initiator.id };
  steps.push(st(topology, packet, "FIN_WAIT_2", "CLOSE_WAIT", `${initiatorLabel} receives the ACK and moves to FIN_WAIT_2 — its half is closed, now it just waits for ${responderLabel} to close its half too.`, 4, "found"));

  // --- 3. FIN: responder -> initiator (once the responder's application is done) ---
  packet = { ...clonePacket(packet), id: "fin-2", layers: [{ protocol: "TCP", fields: { srcPort: responderPort, dstPort: initiatorPort, flags: "FIN,ACK" } }] };
  steps.push(st(topology, packet, "FIN_WAIT_2", "LAST_ACK", `${responderLabel}'s application finishes too — it sends its own FIN and moves to LAST_ACK.`, 6, "insert"));
  packet = travel(packet, "FIN", "FIN_WAIT_2", "LAST_ACK", false);
  packet = { ...clonePacket(packet), atNode: initiator.id };
  steps.push(st(topology, packet, "TIME_WAIT", "LAST_ACK", `${initiatorLabel} receives the second FIN and moves to TIME_WAIT.`, 7, "found"));

  // --- 4. ACK: initiator -> responder ---
  packet = { ...clonePacket(packet), id: "ack-of-fin-2", layers: [{ protocol: "TCP", fields: { srcPort: initiatorPort, dstPort: responderPort, flags: "ACK" } }] };
  steps.push(st(topology, packet, "TIME_WAIT", "LAST_ACK", `${initiatorLabel} sends the final ACK.`, 7, "insert"));
  packet = travel(packet, "ACK", "TIME_WAIT", "LAST_ACK", true);
  packet = { ...clonePacket(packet), atNode: responder.id, fate: "delivered" };
  steps.push(st(topology, packet, "TIME_WAIT", "CLOSED", `${responderLabel} receives the last ACK and closes immediately.`, 8, "found"));

  steps.push(st(topology, packet, "CLOSED", "CLOSED", `${initiatorLabel} waits in TIME_WAIT (2×MSL in a real stack) before finally closing — in case that last ACK was lost and ${responderLabel} retransmits its FIN, or so a stray late segment from this connection can't be mistaken for part of a future one reusing the same ports.`, 10, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_TERMINATION_CODE: string[] = [
  "// initiator                                   // responder",
  "state = ESTABLISHED;                           state = ESTABLISHED;",
  "",
  "send(FIN);  state = FIN_WAIT_1;",
  "                                                on receive(FIN):",
  "                                                  state = CLOSE_WAIT;",
  "                                                  send(ACK);",
  "on receive(ACK): state = FIN_WAIT_2;",
  "                                                // responder's app finishes later",
  "                                                send(FIN); state = LAST_ACK;",
  "on receive(FIN):",
  "  send(ACK); state = TIME_WAIT;",
  "                                                on receive(ACK): state = CLOSED;",
  "// after 2*MSL with nothing new arriving:",
  "state = CLOSED;",
];

export const TCP_TERMINATION_ANNOTATIONS: Record<number, string> = {
  1: "Each side closes its own direction independently — that's the whole reason this takes four segments, not two.",
  3: "CLOSE_WAIT can last a while in practice — it just means \"the other side is done, but my application hasn't called close() yet.\"",
  4: "FIN_WAIT_2 can still receive data — only the initiator's outgoing half has closed at this point.",
  6: "The responder's FIN only goes out once its own application is actually finished — it isn't triggered automatically by receiving the first FIN.",
  7: "TIME_WAIT exists specifically to handle the case where this final ACK gets lost.",
  8: "The responder can close immediately — it isn't the side that has to protect against a lost final ACK.",
  10: "2×MSL (Maximum Segment Lifetime) is long enough that any duplicate, delayed segment from this exact connection is guaranteed to have expired before a new connection could reuse the same port pair.",
};

export const TCP_TERMINATION_COMPLEXITY = {
  time: "O(hops) per leg × 4 legs",
  space: "O(1)",
  note: "Four segments regardless of how much data was exchanged — plus one side waiting out TIME_WAIT, which costs time but no further network traffic.",
};
