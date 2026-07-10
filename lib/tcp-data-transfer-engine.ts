import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";
import { randomIsn } from "./tcp-handshake-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TcpDataStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 5;

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

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): TcpDataStep {
  return {
    topology,
    packet: clonePacket(packet),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── Send N segments, one at a time, each waited on for its own ACK ─────────
// This is deliberately stop-and-wait, not windowed — one segment out, one ACK
// back, before the next segment goes anywhere. That's what makes the
// sequence/ack arithmetic easy to follow before Sliding Window adds the
// complication of several unacknowledged segments in flight at once.

export function sendTcpData(
  topology: TopologyState,
  clientLabel: string,
  serverLabel: string,
  clientPort: number,
  serverPort: number,
  segments: string[],
  loseSegmentIndex = -1
): TcpDataStep[] {
  const steps: TcpDataStep[] = [];

  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);

  let packet: PacketState = { id: "tcp-data", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client) { steps.push(st(topology, packet, `Device "${clientLabel}" does not exist.`, 1, "error")); return steps; }
  if (!server) { steps.push(st(topology, packet, `Device "${serverLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, clientLabel, serverLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, `No path between "${clientLabel}" and "${serverLabel}".`, 1, "error"));
    return steps;
  }
  const path = pathLabels.map((label) => findDevice(topology, label)!);

  function travel(pkt: PacketState, label: string, forward: boolean) {
    const hops = forward ? path : [...path].reverse();
    let p = pkt;
    for (let i = 0; i < hops.length - 1; i++) {
      const hopFrom = hops[i];
      const hopTo = hops[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, `${label} leaving ${hopFrom.label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 1));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  let seq = randomIsn();

  segments.forEach((data, i) => {
    const segLen = data.length;

    packet = {
      ...clonePacket(packet),
      id: `seg-${i}`,
      atNode: client.id,
      layers: [{ protocol: "TCP", fields: { srcPort: clientPort, dstPort: serverPort, seq, ack: "-", flags: "PSH,ACK", len: segLen } }, { protocol: "Data", fields: { payload: data } }],
    };
    steps.push(st(topology, packet, `${clientLabel} sends segment ${i + 1} (seq=${seq}, ${segLen} bytes): "${data}".`, 3, "insert"));

    const isLost = i === loseSegmentIndex;
    packet = travel(packet, `Segment ${i + 1}`, true);

    if (isLost) {
      packet = { ...clonePacket(packet), atNode: null, fate: "dropped" };
      steps.push(st(topology, packet, `Segment ${i + 1} is lost in transit (simulated). ${clientLabel} gets no ACK before its retransmission timer fires.`, 4, "error"));
      steps.push(st(topology, packet, `Timeout! ${clientLabel} retransmits segment ${i + 1} with the exact same seq=${seq} — it has no way to know it arrived, so it assumes the worst.`, 4, "insert"));
      packet = { ...clonePacket(packet), atNode: client.id, fate: "queued" };
      packet = travel(packet, `Segment ${i + 1} (retransmit)`, true);
    }

    packet = { ...clonePacket(packet), atNode: server.id };
    steps.push(st(topology, packet, `${serverLabel} receives segment ${i + 1} (seq=${seq}).`, 5, "found"));

    const ackNum = seq + segLen;
    packet = {
      ...clonePacket(packet),
      id: `ack-${i}`,
      layers: [{ protocol: "TCP", fields: { srcPort: serverPort, dstPort: clientPort, seq: "-", ack: ackNum, flags: "ACK", len: 0 } }],
    };
    steps.push(st(topology, packet, `${serverLabel} acknowledges: ACK ${ackNum} — "I've got everything up through byte ${ackNum - 1}, send me starting from ${ackNum} next."`, 6, "insert"));
    packet = travel(packet, "ACK", false);
    packet = { ...clonePacket(packet), atNode: client.id, fate: i === segments.length - 1 ? "delivered" : "queued" };
    steps.push(st(topology, packet, `${clientLabel} receives ACK ${ackNum} and can now send the next segment.`, 7, "found"));

    seq = ackNum;
  });

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_DATA_CODE: string[] = [
  "function sendData(segments) {",
  "  seq = initialSeqNumber;",
  "  for (segment of segments) {",
  "    send(TCP{ seq, flags: PSH+ACK, data: segment });",
  "    startRetransmitTimer();",
  "",
  "    on receive(ACK) matching this segment:",
  "      cancelTimer();",
  "      seq += segment.length;   // next byte expected",
  "    on timeout:",
  "      retransmit(same seq, same segment);  // assume it was lost",
  "  }",
  "}",
];

export const TCP_DATA_ANNOTATIONS: Record<number, string> = {
  3: "Each segment's sequence number is the byte offset of its first byte — not a simple 1, 2, 3 counter.",
  4: "A retransmission reuses the exact same sequence number — the receiver has no way to tell a retransmit apart from the original except by that seq number matching.",
  6: "TCP's ACK number means \"next byte I expect\", not \"last byte I got\" — that's why it's seq + length, not just seq.",
  7: "Only after this ACK arrives does the sender know it's safe to advance — stop-and-wait means exactly one segment is ever unacknowledged at a time.",
};

export const TCP_DATA_COMPLEXITY = {
  time: "O(segments) round trips",
  space: "O(1)",
  note: "Stop-and-wait means throughput is capped by one round-trip time per segment — the whole motivation for Sliding Window next.",
};
