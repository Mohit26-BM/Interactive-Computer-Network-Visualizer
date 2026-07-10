import { Step } from "./types";

// Three switches cabled in a triangle — a physical loop. Spanning Tree
// Protocol elects one root bridge, gives every other switch a root port
// back toward it, and blocks exactly one port per redundant segment so the
// loop is logically broken without physically removing any cable.
// Deliberately not built on topology-engine.ts's DeviceNode/TopologyState:
// this is a fixed 3-switch scenario with no hosts, so a small bespoke model
// is simpler than forcing it through the generic topology shape.

export type PortRole = "root" | "designated" | "blocked" | "none";

export interface StpLink {
  id: string;
  a: string; // switch label
  b: string;
}

export const SWITCHES = ["SW-1", "SW-2", "SW-3"];
// Bridge priority order (lower wins) — SW-1 is deliberately the lowest ID
// so it becomes root; SW-2 < SW-3 breaks the tie on the non-root segment.
export const BRIDGE_ID: Record<string, number> = { "SW-1": 1, "SW-2": 2, "SW-3": 3 };

export const STP_LINKS: StpLink[] = [
  { id: "l-12", a: "SW-1", b: "SW-2" },
  { id: "l-13", a: "SW-1", b: "SW-3" },
  { id: "l-23", a: "SW-2", b: "SW-3" },
];

export interface StpPortState {
  linkId: string;
  switchLabel: string; // which switch's end of the link this describes
  role: PortRole;
}

export interface StpStep extends Step {
  rootBridge: string | null;
  ports: StpPortState[];
  failedLinkId: string | null;
}

function st(explanation: string, hl: number, rootBridge: string | null, ports: StpPortState[], failedLinkId: string | null = null, phase?: string): StpStep {
  return { explanation, highlightLine: hl, rootBridge, ports: ports.map((p) => ({ ...p })), failedLinkId, phase };
}

// The converged, steady-state port roles for this fixed triangle: SW-1 is
// root (both its ports are designated/forwarding by definition); SW-2 and
// SW-3 each have a root port facing SW-1 directly (cost 1, cheaper than the
// 2-hop alternative through the other switch); the SW-2–SW-3 segment has
// exactly one designated port (SW-2's, lower bridge ID) and one blocked
// port (SW-3's).
function convergedPorts(): StpPortState[] {
  return [
    { linkId: "l-12", switchLabel: "SW-1", role: "designated" },
    { linkId: "l-12", switchLabel: "SW-2", role: "root" },
    { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
    { linkId: "l-13", switchLabel: "SW-3", role: "root" },
    { linkId: "l-23", switchLabel: "SW-2", role: "designated" },
    { linkId: "l-23", switchLabel: "SW-3", role: "blocked" },
  ];
}

export function simulateStp(failLink: boolean): StpStep[] {
  const steps: StpStep[] = [];

  steps.push(st(
    "SW-1, SW-2, and SW-3 are cabled in a triangle. Physically, this is a loop — with no protocol governing it, a single broadcast frame would circulate between the three switches forever.",
    1, null, STP_LINKS.map((l) => ({ linkId: l.id, switchLabel: l.a, role: "none" as PortRole }))
  ));

  steps.push(st(
    "Every switch advertises a Bridge ID (priority + MAC, shown here as a priority number). The lowest wins: SW-1 (priority 1) becomes the Root Bridge.",
    2, "SW-1", STP_LINKS.flatMap((l) => [{ linkId: l.id, switchLabel: l.a, role: "none" as PortRole }])
  ));

  steps.push(st(
    "Every non-root switch chooses a Root Port: the port with the cheapest path back to the root. SW-2 and SW-3 each connect to SW-1 directly (cost 1) — cheaper than the 2-hop path through the other switch — so both root ports face SW-1.",
    3, "SW-1",
    [
      { linkId: "l-12", switchLabel: "SW-1", role: "designated" },
      { linkId: "l-12", switchLabel: "SW-2", role: "root" },
      { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
      { linkId: "l-13", switchLabel: "SW-3", role: "root" },
      { linkId: "l-23", switchLabel: "SW-2", role: "none" },
      { linkId: "l-23", switchLabel: "SW-3", role: "none" },
    ]
  ));

  steps.push(st(
    "The SW-2–SW-3 segment doesn't touch the root, so it needs exactly one Designated (forwarding) port and one Blocked port, or the loop stays live. SW-2 has the lower Bridge ID, so its port wins Designated.",
    4, "SW-1",
    [
      { linkId: "l-12", switchLabel: "SW-1", role: "designated" },
      { linkId: "l-12", switchLabel: "SW-2", role: "root" },
      { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
      { linkId: "l-13", switchLabel: "SW-3", role: "root" },
      { linkId: "l-23", switchLabel: "SW-2", role: "designated" },
      { linkId: "l-23", switchLabel: "SW-3", role: "none" },
    ]
  ));

  steps.push(st(
    "SW-3's port on that same segment goes to Blocking. The cable is still connected, but that port drops everything except STP's own bookkeeping frames — the loop is now logically broken.",
    5, "SW-1", convergedPorts(), null, "insert"
  ));

  if (failLink) {
    steps.push(st(
      "Now the SW-1–SW-2 link fails. SW-2 loses its root port and, until STP reconverges, is completely cut off from the root.",
      6, "SW-1",
      [
        { linkId: "l-12", switchLabel: "SW-1", role: "none" },
        { linkId: "l-12", switchLabel: "SW-2", role: "none" },
        { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
        { linkId: "l-13", switchLabel: "SW-3", role: "root" },
        { linkId: "l-23", switchLabel: "SW-2", role: "designated" },
        { linkId: "l-23", switchLabel: "SW-3", role: "blocked" },
      ],
      "l-12", "error"
    ));
    steps.push(st(
      "SW-3 keeps forwarding on its own root port throughout — it never depended on the failed link. SW-2, cut off, unblocks its port on the SW-2–SW-3 segment and starts using it as its new root port.",
      7, "SW-1",
      [
        { linkId: "l-12", switchLabel: "SW-1", role: "none" },
        { linkId: "l-12", switchLabel: "SW-2", role: "none" },
        { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
        { linkId: "l-13", switchLabel: "SW-3", role: "root" },
        { linkId: "l-23", switchLabel: "SW-2", role: "root" },
        { linkId: "l-23", switchLabel: "SW-3", role: "designated" },
      ],
      "l-12"
    ));
    steps.push(st(
      "Converged again: SW-1 → SW-3 → SW-2. Every switch can still reach the root, using the cable that redundancy specifically kept alive for this moment.",
      8, "SW-1",
      [
        { linkId: "l-12", switchLabel: "SW-1", role: "none" },
        { linkId: "l-12", switchLabel: "SW-2", role: "none" },
        { linkId: "l-13", switchLabel: "SW-1", role: "designated" },
        { linkId: "l-13", switchLabel: "SW-3", role: "root" },
        { linkId: "l-23", switchLabel: "SW-2", role: "root" },
        { linkId: "l-23", switchLabel: "SW-3", role: "designated" },
      ],
      "l-12", "insert"
    ));
  }

  return steps;
}

export const STP_CODE: string[] = [
  "function runStp(switches, links) {",
  "  const root = switches.minBy(s => s.bridgeId);      // lowest Bridge ID wins",
  "  for (const s of switches.exclude(root)) {",
  "    s.rootPort = s.cheapestPortTo(root);              // shortest path back to root",
  "  }",
  "  for (const segment of links.notTouching(root)) {",
  "    const designated = segment.endpoints.minBy(e => e.switch.bridgeId);",
  "    designated.role = 'designated';                    // forwards",
  "    segment.otherEndpoint(designated).role = 'blocked'; // drops everything but BPDUs",
  "  }",
  "}",
];

export const STP_ANNOTATIONS: Record<number, string> = {
  1: "A physical loop is fine for Ethernet cabling — it's only a problem once frames start circulating with no TTL to expire them.",
  2: "BPDUs (Bridge Protocol Data Units) are the messages switches exchange to agree on all of this — every switch announces its Bridge ID and hears everyone else's.",
  3: "A root port is always exactly one per non-root switch — it's the switch's single best path home.",
  4: "Only segments that don't already touch the root need this decision — the root's own ports are designated by definition.",
  5: "Blocking isn't the same as disconnected: a blocked port still listens for BPDUs, so it can react instantly if the network changes.",
  6: "This is the failure redundancy exists for — but for a few seconds, the topology genuinely is broken.",
  7: "This is convergence: every switch recomputes root/designated/blocked roles from the BPDUs it's still receiving, with no cable ever touched.",
  8: "The blocked port from before is exactly the spare capacity that made recovery possible — that's the entire point of building a loop and then blocking it.",
};

export const STP_COMPLEXITY = {
  time: "O(E log E) per convergence",
  space: "O(V + E)",
  note: "Real STP converges in seconds (30-50s classic STP, under 1s for Rapid STP) — the cost here is wall-clock time waiting for BPDU timers, not computation.",
};
