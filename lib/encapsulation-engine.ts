import { Step, PacketHeaderLayer } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EncapDirection = "wrap" | "unwrap";

export interface EncapsulationStep extends Step {
  layers: PacketHeaderLayer[];
  direction: EncapDirection;
  activeLayerIndex: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneLayers(layers: PacketHeaderLayer[]): PacketHeaderLayer[] {
  return layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } }));
}

function st(
  layers: PacketHeaderLayer[],
  explanation: string,
  hl: number,
  direction: EncapDirection,
  activeLayerIndex: number | null,
  phase?: string
): EncapsulationStep {
  return { layers: cloneLayers(layers), explanation, highlightLine: hl, direction, activeLayerIndex, phase };
}

// ─── The flagship demo: wrap on the sender, unwrap on the receiver ───────────

export function encapsulationDemo(payload: string): EncapsulationStep[] {
  const steps: EncapsulationStep[] = [];
  let layers: PacketHeaderLayer[] = [{ protocol: "HTTP Data", fields: { payload } }];

  steps.push(st(layers, `Sender — start with the raw application data: "${payload}".`, 1, "wrap", 0));

  layers = [
    { protocol: "TCP", fields: { srcPort: 51342, dstPort: 80, seq: 1000, flags: "PSH,ACK" } },
    ...layers,
  ];
  steps.push(st(layers, `Transport layer wraps it in a TCP segment — adds source/destination ports and a sequence number.`, 2, "wrap", 0, "insert"));

  layers = [
    { protocol: "IPv4", fields: { srcIP: "192.168.1.10", dstIP: "93.184.216.34", ttl: 64, protocol: "TCP" } },
    ...layers,
  ];
  steps.push(st(layers, `Network layer wraps that in an IPv4 packet — adds source/destination IP address and a TTL.`, 3, "wrap", 0, "insert"));

  layers = [
    { protocol: "Ethernet", fields: { srcMAC: "AA:BB:CC:00:01:01", dstMAC: "AA:BB:CC:00:02:01", etherType: "0x0800" } },
    ...layers,
  ];
  steps.push(st(layers, `Data Link layer wraps that in an Ethernet frame — adds source/destination MAC address.`, 4, "wrap", 0, "insert"));

  steps.push(st(layers, `Physical layer sends the whole thing as raw bits over the wire.`, 5, "wrap", null, "found"));

  // ─── Receiver: unwrap in exactly reverse order ───
  steps.push(st(layers, `Receiver — bits arrive off the wire and are reassembled into an Ethernet frame.`, 6, "unwrap", null));

  layers = layers.slice(1);
  steps.push(st(layers, `Data Link layer strips the Ethernet header, checks the destination MAC, and hands the IPv4 packet up.`, 7, "unwrap", 0, "delete"));

  layers = layers.slice(1);
  steps.push(st(layers, `Network layer strips the IPv4 header, checks the destination IP, and hands the TCP segment up.`, 8, "unwrap", 0, "delete"));

  layers = layers.slice(1);
  steps.push(st(layers, `Transport layer strips the TCP header, checks the destination port, and hands the raw data up.`, 9, "unwrap", 0, "delete"));

  steps.push(st(layers, `The receiving application reads: "${payload}" — byte-for-byte identical to what was sent.`, 10, "unwrap", 0, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ENCAPSULATION_CODE: string[] = [
  "function send(data) {",
  "  segment = TCP.wrap(data);       // + ports, sequence number",
  "  packet  = IPv4.wrap(segment);   // + src/dst IP, TTL",
  "  frame   = Ethernet.wrap(packet);// + src/dst MAC",
  "  physical.transmit(frame.toBits());",
  "}",
  "",
  "function receive(bits) {",
  "  frame   = physical.toFrame(bits);",
  "  packet  = Ethernet.unwrap(frame);  // check dst MAC",
  "  segment = IPv4.unwrap(packet);     // check dst IP",
  "  data    = TCP.unwrap(segment);     // check dst port",
  "  return data;                       // identical to what was sent",
  "}",
];

export const ENCAPSULATION_ANNOTATIONS: Record<number, string> = {
  2: "Encapsulation always adds a header to the OUTSIDE of what came before — the payload itself is never modified.",
  3: "The IP header is what makes routing possible: routers only ever read up to this layer.",
  4: "The Ethernet header only matters for the current physical segment — it gets replaced at every hop by a router.",
  5: "Nothing is 'sent' below Physical — it's just voltage, light, or radio at this point, no more header structure.",
  7: "Unwrapping is the exact mirror of wrapping, innermost header added last, removed first — like a stack (LIFO).",
  9: "By the time data reaches TCP's unwrap step, every layer below has already validated its own piece of the address.",
};

export const ENCAPSULATION_COMPLEXITY = {
  time: "O(layers)",
  space: "O(payload + headers)",
  note: "Each layer adds a small, fixed-size header — the extra work is proportional to the number of layers, not the size of the payload.",
};
