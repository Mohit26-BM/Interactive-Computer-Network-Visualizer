// Base Step contract — identical shape to the DSA Visualizer's lib/types.ts.
// usePlayer only ever reads `steps.length`; it never inspects these fields.
export interface Step {
  explanation: string;
  highlightLine: number;
  highlightIndices?: number[];
  highlightNodes?: string[];
  phase?: string; // "insert" | "found" | "delete" | "error" | "default"
}

// ─── Shared packet header model ("Inside the Packet") ─────────────────────
// Deliberately a flat ordered array, not a recursive PDU tree — see the
// project roadmap for why. Every protocol engine (Ethernet, ARP, IPv4, TCP,
// DHCP, DNS, HTTP, TLS, ...) appends/removes one layer and otherwise reuses
// this shape untouched.

export interface PacketHeaderLayer {
  protocol: string; // "Ethernet" | "IPv4" | "TCP" | "HTTP" | ...
  fields: Record<string, string | number>;
}

export type PacketFate = "in-flight" | "queued" | "delivered" | "dropped";

export interface PacketState {
  id: string;
  layers: PacketHeaderLayer[]; // outermost-first; order = encapsulation order
  currentLink: string | null;
  progress: number; // 0..1 along currentLink
  atNode: string | null;
  fate: PacketFate;
}
