import { Step } from "./types";
import type { DeviceIface } from "./addressing";
import { assignRoutedAddressing } from "./addressing";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceKind = "pc" | "switch" | "router" | "server";

export interface DeviceNode {
  id: string;
  label: string;
  kind: DeviceKind;
  mac: string;
  ip?: string; // switches don't get one — they operate below IP
  ifaces?: DeviceIface[]; // routers: one interface (IP + MAC) per attached subnet
  gateway?: string;       // hosts: the default gateway's IP
}

export interface NetworkLink {
  id: string;
  from: string;
  to: string;
  weight?: number; // used by routing; undirected links are unweighted (1) unless set
}

export interface TopologyState {
  devices: DeviceNode[];
  links: NetworkLink[];
  positions: Record<string, { x: number; y: number }>;
}

export interface TopologyStep extends Step {
  state: TopologyState;
  highlightDevices: string[];
  highlightLinks: string[];
}

// ─── ID counter ───────────────────────────────────────────────────────────────

let idCounter = 0;
const newId = () => `dev-${idCounter++}`;
let linkIdCounter = 0;
const newLinkId = () => `link-${linkIdCounter++}`;
let addressCounter = 0;

// Every topology builder starts numbering from zero. Without this the counters keep climbing
// across calls, so the server-rendered HTML (built after other pages) and the browser (fresh
// module) would assign different IPs/MACs to the same device and React would report a
// hydration mismatch.
function resetCounters(): void {
  idCounter = 0;
  linkIdCounter = 0;
  addressCounter = 0;
}

// Deterministic, human-readable MAC/IP assignment — every device gets both
// the moment it's created, the same way a real NIC has a MAC burned in and
// gets an IP the moment it joins the network.
function nextAddresses(): { mac: string; ip: string } {
  const n = addressCounter++;
  return {
    mac: `AA:BB:CC:00:00:${n.toString(16).padStart(2, "0").toUpperCase()}`,
    ip: `192.168.1.${10 + n}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function cloneTopology(s: TopologyState): TopologyState {
  return {
    devices: s.devices.map((d) => ({ ...d })),
    links: s.links.map((l) => ({ ...l })),
    positions: Object.fromEntries(Object.entries(s.positions).map(([k, v]) => [k, { ...v }])),
  };
}

export function findDevice(s: TopologyState, label: string): DeviceNode | undefined {
  return s.devices.find((d) => d.label === label);
}

// Simple left-to-right, wrapping-row layout — easier to read as a "flow"
// than the DSA app's circular layout, since a topology reads like a diagram,
// not an abstract graph.
export function computeGridPositions(count: number): { x: number; y: number }[] {
  const perRow = 5;
  const xGap = 150;
  const yGap = 140;
  const xStart = 90;
  const yStart = 90;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    positions.push({ x: xStart + col * xGap, y: yStart + row * yGap });
  }
  return positions;
}

function makeDevice(label: string, kind: DeviceKind): DeviceNode {
  const { mac, ip } = nextAddresses();
  return { id: newId(), label, kind, mac, ip: kind === "switch" ? undefined : ip };
}

function st(
  s: TopologyState,
  explanation: string,
  hl: number,
  hd: string[] = [],
  hlk: string[] = [],
  phase?: string
): TopologyStep {
  return {
    state: cloneTopology(s),
    explanation,
    highlightLine: hl,
    highlightDevices: hd,
    highlightLinks: hlk,
    phase,
  };
}

// ─── Default topology — the PC -> Switch -> Router -> Server chain ──────────

export function buildDefaultTopology(): TopologyState {
  resetCounters();
  const specs: [string, DeviceKind][] = [
    ["PC-1", "pc"],
    ["SW-1", "switch"],
    ["R-1", "router"],
    ["SRV-1", "server"],
  ];
  const positions = computeGridPositions(specs.length);
  const devices: DeviceNode[] = specs.map(([label, kind]) => makeDevice(label, kind));
  const posMap: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => { posMap[d.id] = positions[i]; });

  const links: NetworkLink[] = [];
  for (let i = 0; i < devices.length - 1; i++) {
    links.push({ id: newLinkId(), from: devices[i].id, to: devices[i + 1].id });
  }

  return assignRoutedAddressing({ devices, links, positions: posMap });
}

// ─── LAN topology — one switch + three hosts, shared by Ethernet, MAC ───────
// learning, and ARP, since all three protocols only make sense within a
// single local broadcast segment.

export function buildLanTopology(): TopologyState {
  resetCounters();
  const specs: [string, DeviceKind][] = [
    ["SW-1", "switch"],
    ["PC-1", "pc"],
    ["PC-2", "pc"],
    ["PC-3", "pc"],
  ];
  const devices: DeviceNode[] = specs.map(([label, kind]) => makeDevice(label, kind));
  const posMap: Record<string, { x: number; y: number }> = {
    [devices[0].id]: { x: 260, y: 90 },
    [devices[1].id]: { x: 90, y: 230 },
    [devices[2].id]: { x: 260, y: 230 },
    [devices[3].id]: { x: 430, y: 230 },
  };

  const links: NetworkLink[] = [1, 2, 3].map((i) => ({ id: newLinkId(), from: devices[0].id, to: devices[i].id }));

  return { devices, links, positions: posMap };
}

// ─── Routing topology — five routers in a small weighted mesh ───────────────
// Same weights as the DSA app's Dijkstra demo graph, so more than one path
// exists between most pairs — a straight chain would make "shortest path"
// meaningless since there'd only ever be one path to compare against.

export function buildRoutingTopology(): TopologyState {
  resetCounters();
  const labels = ["R-A", "R-B", "R-C", "R-D", "R-E"];
  const devices: DeviceNode[] = labels.map((label) => makeDevice(label, "router"));
  const byLabel = (l: string) => devices.find((d) => d.label === l)!;

  const cx = 300, cy = 190, r = 140;
  const posMap: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / devices.length - Math.PI / 2;
    posMap[d.id] = { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) };
  });

  const edgePairs: [string, string, number][] = [
    ["R-A", "R-B", 4], ["R-A", "R-C", 2], ["R-B", "R-D", 5],
    ["R-C", "R-D", 1], ["R-D", "R-E", 3], ["R-B", "R-E", 6],
  ];
  const links: NetworkLink[] = edgePairs.map(([from, to, weight]) => ({
    id: newLinkId(), from: byLabel(from).id, to: byLabel(to).id, weight,
  }));

  return { devices, links, positions: posMap };
}

// ─── ICMP demo topology — two routers between host and server ──────────────
// Long enough that traceroute actually reveals more than one intermediate
// hop, which a single-router chain can't demonstrate.

export function buildIcmpTopology(): TopologyState {
  resetCounters();
  const specs: [string, DeviceKind][] = [
    ["PC-1", "pc"],
    ["SW-1", "switch"],
    ["R-1", "router"],
    ["R-2", "router"],
    ["SRV-1", "server"],
  ];
  const positions = computeGridPositions(specs.length);
  const devices: DeviceNode[] = specs.map(([label, kind]) => makeDevice(label, kind));
  const posMap: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => { posMap[d.id] = positions[i]; });

  const links: NetworkLink[] = [];
  for (let i = 0; i < devices.length - 1; i++) {
    links.push({ id: newLinkId(), from: devices[i].id, to: devices[i + 1].id });
  }

  return assignRoutedAddressing({ devices, links, positions: posMap });
}

// ─── DHCP demo topology — a brand-new PC with no IP yet ─────────────────────
// Every other topology in this project assigns every device an IP the moment
// it's created, since that's realistic for an already-configured network.
// DHCP's whole premise is a device that *doesn't* have one yet — so this is
// the one place that IP is deliberately stripped back off after creation,
// scoped to just this topology rather than changing the shared device model.

export function buildDhcpTopology(): TopologyState {
  resetCounters();
  const serverRaw = makeDevice("DHCP-1", "server");
  const pcRaw = makeDevice("PC-NEW", "pc");
  const pc: DeviceNode = { ...pcRaw, ip: undefined };
  const devices: DeviceNode[] = [serverRaw, pc];

  const posMap: Record<string, { x: number; y: number }> = {
    [serverRaw.id]: { x: 400, y: 190 },
    [pc.id]: { x: 150, y: 190 },
  };
  const links: NetworkLink[] = [{ id: newLinkId(), from: pc.id, to: serverRaw.id }];

  return { devices, links, positions: posMap };
}

// ─── NAT demo topology — a private LAN behind a router, and a public server ─
// The router's private-side IP is left as its normal assigned address; its
// public-side identity is a constant owned by nat-engine.ts, not a second
// field on DeviceNode — NAT is the only page that cares about a device
// having two addresses, so it isn't worth a shared-model change.

export function buildNatTopology(): TopologyState {
  resetCounters();
  const pcRaw = makeDevice("PC-1", "pc");
  const pc: DeviceNode = { ...pcRaw, ip: "192.168.1.10" };
  const routerRaw = makeDevice("R-1", "router");
  const router: DeviceNode = { ...routerRaw, ip: "192.168.1.1" };
  const serverRaw = makeDevice("SRV-PUBLIC", "server");
  const server: DeviceNode = { ...serverRaw, ip: "93.184.216.34" };
  const devices: DeviceNode[] = [pc, router, server];

  const posMap: Record<string, { x: number; y: number }> = {
    [pc.id]: { x: 130, y: 190 },
    [router.id]: { x: 300, y: 190 },
    [server.id]: { x: 470, y: 190 },
  };
  const links: NetworkLink[] = [
    { id: newLinkId(), from: pc.id, to: router.id },
    { id: newLinkId(), from: router.id, to: server.id },
  ];

  return { devices, links, positions: posMap };
}

// ─── DNS demo topology — resolver, root, TLD, and authoritative servers ────
// A recursive lookup genuinely needs four separate "server" roles even
// though they're all the same DeviceKind — the distinction lives in the
// engine's own labels, not in a new device kind.

export function buildDnsTopology(): TopologyState {
  resetCounters();
  const specs: [string, string][] = [
    ["PC-1", "client"],
    ["RESOLVER", "resolver"],
    ["ROOT", "root"],
    ["TLD-COM", "tld"],
    ["AUTH-GOOGLE", "authoritative"],
  ];
  const devices: DeviceNode[] = specs.map(([label]) => makeDevice(label, label === "PC-1" ? "pc" : "server"));
  const posMap: Record<string, { x: number; y: number }> = {
    [devices[0].id]: { x: 70, y: 190 },
    [devices[1].id]: { x: 230, y: 190 },
    [devices[2].id]: { x: 400, y: 70 },
    [devices[3].id]: { x: 400, y: 190 },
    [devices[4].id]: { x: 400, y: 310 },
  };
  const links: NetworkLink[] = [
    { id: newLinkId(), from: devices[0].id, to: devices[1].id },
    { id: newLinkId(), from: devices[1].id, to: devices[2].id },
    { id: newLinkId(), from: devices[1].id, to: devices[3].id },
    { id: newLinkId(), from: devices[1].id, to: devices[4].id },
  ];
  return { devices, links, positions: posMap };
}

// ─── VLAN demo topology — one switch, four hosts split across two VLANs, ───
// and a router-on-a-stick for optional inter-VLAN routing. PC-1/PC-2 are
// VLAN 10 (Sales); PC-3/PC-4 are VLAN 20 (Engineering) — vlan-engine.ts
// derives VLAN membership from these labels rather than adding a VLAN field
// to DeviceNode, the same "don't touch the shared model" call NAT made.

export function buildVlanTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["R-1", "router"], ["SW-1", "switch"],
    ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"], ["PC-4", "pc"],
  ]);
  const [router, sw, pc1, pc2, pc3, pc4] = devices;
  const positions: Record<string, { x: number; y: number }> = {
    [router.id]: { x: 300, y: 60 },
    [sw.id]: { x: 300, y: 170 },
    [pc1.id]: { x: 110, y: 300 },
    [pc2.id]: { x: 230, y: 300 },
    [pc3.id]: { x: 370, y: 300 },
    [pc4.id]: { x: 490, y: 300 },
  };
  const links: NetworkLink[] = [
    { id: newLinkId(), from: router.id, to: sw.id },
    { id: newLinkId(), from: sw.id, to: pc1.id },
    { id: newLinkId(), from: sw.id, to: pc2.id },
    { id: newLinkId(), from: sw.id, to: pc3.id },
    { id: newLinkId(), from: sw.id, to: pc4.id },
  ];
  return { devices, links, positions };
}

// ─── Preset shapes — jump straight to a named topology instead of building ──
// one cable at a time. These replace the whole canvas (not an animated
// operation), since "load a preset" is a starting point, not a step to trace.

export type PresetKind = "star" | "ring" | "bus" | "mesh" | "smallOffice" | "homeNetwork";

export const PRESET_INFO: Record<PresetKind, { label: string; description: string }> = {
  star: { label: "Star", description: "Every host cables into one central switch — if the switch dies, everything splits apart, but one bad cable only takes down one host." },
  ring: { label: "Ring", description: "Each device connects to exactly two neighbors, forming a loop — a single break just turns the ring into a line, it doesn't disconnect anyone." },
  bus: { label: "Bus", description: "All devices share one backbone cable in a line — simple and cheap, but the whole segment goes down if the backbone is cut anywhere." },
  mesh: { label: "Mesh", description: "Every device is cabled directly to every other device — maximum redundancy, at the cost of one cable per pair (grows fast)." },
  smallOffice: { label: "Small Office", description: "A router facing the internet, a switch fanning out to desks, and a server — the shape behind most small businesses." },
  homeNetwork: { label: "Home Network", description: "One router doing double duty as switch and Wi-Fi access point for a couple of laptops and a phone — the shape behind most homes." },
};

// Reference comparison for all six conceptual shapes, including two (Tree,
// Hybrid) with no one-click template — they're combinations of the others,
// which the Lab tab explicitly invites building by hand.
export interface TopologyComparisonRow {
  topology: string;
  cost: string;
  reliability: string;
  scalability: string;
  use: string;
}

export const TOPOLOGY_COMPARISON: TopologyComparisonRow[] = [
  { topology: "Bus", cost: "Low", reliability: "Low", scalability: "Low", use: "Small, temporary networks" },
  { topology: "Star", cost: "Medium", reliability: "High", scalability: "High", use: "Offices, homes, schools" },
  { topology: "Ring", cost: "Medium", reliability: "Medium", scalability: "Medium", use: "Legacy LANs, some industrial networks" },
  { topology: "Mesh", cost: "High", reliability: "Very High", scalability: "Medium", use: "Data centers, critical systems" },
  { topology: "Tree", cost: "Medium-High", reliability: "High", scalability: "Very High", use: "Large enterprises" },
  { topology: "Hybrid", cost: "High", reliability: "Very High", scalability: "Very High", use: "Modern corporate networks" },
];

function labeledDevices(labels: [string, DeviceKind][]): DeviceNode[] {
  return labels.map(([label, kind]) => makeDevice(label, kind));
}

export function circlePositions(devices: DeviceNode[], cx: number, cy: number, r: number): Record<string, { x: number; y: number }> {
  const posMap: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => {
    const angle = (2 * Math.PI * i) / devices.length - Math.PI / 2;
    posMap[d.id] = { x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) };
  });
  return posMap;
}

export function buildStarTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["SW-1", "switch"], ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"], ["PC-4", "pc"],
  ]);
  const hub = devices[0];
  const spokes = devices.slice(1);
  const positions = { [hub.id]: { x: 260, y: 190 }, ...circlePositions(spokes, 260, 190, 150) };
  const links: NetworkLink[] = spokes.map((d) => ({ id: newLinkId(), from: hub.id, to: d.id }));
  return { devices, links, positions };
}

export function buildRingTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"], ["PC-4", "pc"], ["PC-5", "pc"],
  ]);
  const positions = circlePositions(devices, 260, 190, 150);
  const links: NetworkLink[] = devices.map((d, i) => ({
    id: newLinkId(), from: d.id, to: devices[(i + 1) % devices.length].id,
  }));
  return { devices, links, positions };
}

export function buildBusTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"], ["PC-4", "pc"], ["PC-5", "pc"],
  ]);
  const positions: Record<string, { x: number; y: number }> = {};
  devices.forEach((d, i) => { positions[d.id] = { x: 90 + i * 130, y: 190 }; });
  const links: NetworkLink[] = [];
  for (let i = 0; i < devices.length - 1; i++) {
    links.push({ id: newLinkId(), from: devices[i].id, to: devices[i + 1].id });
  }
  return { devices, links, positions };
}

export function buildMeshTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["R-A", "router"], ["R-B", "router"], ["R-C", "router"], ["R-D", "router"], ["R-E", "router"],
  ]);
  const positions = circlePositions(devices, 260, 190, 150);
  const links: NetworkLink[] = [];
  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      links.push({ id: newLinkId(), from: devices[i].id, to: devices[j].id });
    }
  }
  return { devices, links, positions };
}

export function buildSmallOfficeTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["R-1", "router"], ["SW-1", "switch"], ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"], ["SRV-1", "server"],
  ]);
  const [router, sw, pc1, pc2, pc3, srv] = devices;
  const positions: Record<string, { x: number; y: number }> = {
    [router.id]: { x: 260, y: 70 },
    [sw.id]: { x: 260, y: 190 },
    [pc1.id]: { x: 110, y: 300 },
    [pc2.id]: { x: 260, y: 300 },
    [pc3.id]: { x: 410, y: 300 },
    [srv.id]: { x: 410, y: 190 },
  };
  const links: NetworkLink[] = [
    { id: newLinkId(), from: router.id, to: sw.id },
    { id: newLinkId(), from: sw.id, to: pc1.id },
    { id: newLinkId(), from: sw.id, to: pc2.id },
    { id: newLinkId(), from: sw.id, to: pc3.id },
    { id: newLinkId(), from: sw.id, to: srv.id },
  ];
  return { devices, links, positions };
}

export function buildHomeNetworkTopology(): TopologyState {
  resetCounters();
  const devices = labeledDevices([
    ["R-1", "router"], ["PC-1", "pc"], ["PC-2", "pc"], ["PC-3", "pc"],
  ]);
  const [router, laptop, desktop, phone] = devices;
  const positions: Record<string, { x: number; y: number }> = {
    [router.id]: { x: 260, y: 110 },
    [laptop.id]: { x: 130, y: 250 },
    [desktop.id]: { x: 260, y: 280 },
    [phone.id]: { x: 390, y: 250 },
  };
  const links: NetworkLink[] = [laptop, desktop, phone].map((d) => ({ id: newLinkId(), from: router.id, to: d.id }));
  return { devices, links, positions };
}

export function buildPresetTopology(kind: PresetKind): TopologyState {
  if (kind === "star") return buildStarTopology();
  if (kind === "ring") return buildRingTopology();
  if (kind === "bus") return buildBusTopology();
  if (kind === "smallOffice") return buildSmallOfficeTopology();
  if (kind === "homeNetwork") return buildHomeNetworkTopology();
  return buildMeshTopology();
}

// ─── Operations ───────────────────────────────────────────────────────────────

export function topologyAddDevice(state: TopologyState, label: string, kind: DeviceKind, position?: { x: number; y: number }): TopologyStep[] {
  const steps: TopologyStep[] = [];
  const s = cloneTopology(state);

  steps.push(st(s, `Add ${kind} "${label}" to the topology.`, 1));

  if (findDevice(s, label)) {
    steps.push(st(s, `A device named "${label}" already exists.`, 2, [], [], "error"));
    return steps;
  }

  const device = makeDevice(label, kind);
  s.devices.push(device);

  // Only the new device needs a position — everyone else keeps exactly
  // where they were (hand-placed, dragged, or from a preset). An explicit
  // position (click-to-place / drag-and-drop) is used as-is; otherwise fall
  // back to the next open slot of the endless grid sequence.
  s.positions[device.id] = position ?? computeGridPositions(s.devices.length)[s.devices.length - 1];

  steps.push(st(s, `"${label}" added as a ${kind} (MAC ${device.mac}${device.ip ? `, IP ${device.ip}` : ""}).`, 3, [device.id], [], "insert"));
  return steps;
}

// Prefix convention already used by the demo topologies (pc→PC, switch→SW,
// router→R, server→SRV) — auto-naming reuses it so palette-placed devices
// read the same way as everything else.
const KIND_PREFIX: Record<DeviceKind, string> = { pc: "PC", switch: "SW", router: "R", server: "SRV" };

export function nextLabelForKind(state: TopologyState, kind: DeviceKind): string {
  const prefix = KIND_PREFIX[kind];
  let max = 0;
  for (const d of state.devices) {
    const m = d.label.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${max + 1}`;
}

// Click-to-place / drag-and-drop: the user picks a kind and a point on the
// canvas, not a name — the label is generated for them.
export function topologyPlaceDevice(state: TopologyState, kind: DeviceKind, x: number, y: number): TopologyStep[] {
  return topologyAddDevice(state, nextLabelForKind(state, kind), kind, { x, y });
}

export function topologyRenameDevice(state: TopologyState, id: string, newLabel: string): TopologyStep[] {
  const steps: TopologyStep[] = [];
  const s = cloneTopology(state);
  const device = s.devices.find((d) => d.id === id);

  if (!device) { steps.push(st(s, `Device not found.`, 1, [], [], "error")); return steps; }

  const trimmed = newLabel.trim();
  if (!trimmed) { steps.push(st(s, `A device name can't be empty.`, 1, [id], [], "error")); return steps; }

  if (s.devices.some((d) => d.id !== id && d.label === trimmed)) {
    steps.push(st(s, `A device named "${trimmed}" already exists.`, 1, [id], [], "error"));
    return steps;
  }

  const oldLabel = device.label;
  device.label = trimmed;
  steps.push(st(s, `Renamed "${oldLabel}" to "${trimmed}".`, 1, [id], [], "insert"));
  return steps;
}

// ─── Connectivity check — "Test Connectivity" on the Lab tab ────────────────
// Reports problems in plain language with concrete next steps, instead of
// blocking any action that led to them.

export interface ConnectivityIssue {
  reason: string;
  suggestions: string[];
}

export interface ConnectivityResult {
  ok: boolean;
  issues: ConnectivityIssue[];
}

export function checkConnectivity(state: TopologyState): ConnectivityResult {
  if (state.devices.length === 0) {
    return {
      ok: false,
      issues: [{
        reason: "No devices exist yet.",
        suggestions: ["Pick a device from the palette and click the canvas to add one."],
      }],
    };
  }

  const adj: Record<string, string[]> = {};
  state.devices.forEach((d) => { adj[d.id] = []; });
  state.links.forEach((l) => { adj[l.from]?.push(l.to); adj[l.to]?.push(l.from); });

  const isolated = state.devices.filter((d) => (adj[d.id]?.length ?? 0) === 0);

  const issues: ConnectivityIssue[] = [];

  if (state.devices.length > 1) {
    for (const d of isolated) {
      issues.push({
        reason: `"${d.label}" isn't connected to any other device.`,
        suggestions: [
          `Drag a cable from "${d.label}" to a switch or router.`,
          `Or connect it directly to whatever device you want it to reach.`,
        ],
      });
    }

    // Connected components among the non-isolated devices only — isolated
    // devices are already reported above and shouldn't also count as their
    // own separate "island".
    const connectedDevices = state.devices.filter((d) => !isolated.includes(d));
    const visited = new Set<string>();
    const groups: DeviceNode[][] = [];
    for (const d of connectedDevices) {
      if (visited.has(d.id)) continue;
      const group: DeviceNode[] = [];
      const queue = [d.id];
      visited.add(d.id);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        group.push(state.devices.find((x) => x.id === cur)!);
        for (const n of adj[cur] ?? []) {
          if (!visited.has(n)) { visited.add(n); queue.push(n); }
        }
      }
      groups.push(group);
    }

    if (groups.length > 1) {
      const groupList = groups.map((g) => g.map((d) => d.label).join(", ")).join("  |  ");
      issues.push({
        reason: `The network is split into ${groups.length} separate groups that can't reach each other: ${groupList}.`,
        suggestions: ["Connect at least one device from each group to a device in another group to join them."],
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function topologyRemoveDevice(state: TopologyState, label: string): TopologyStep[] {
  const steps: TopologyStep[] = [];
  const s = cloneTopology(state);

  steps.push(st(s, `Remove device "${label}".`, 1));

  const device = findDevice(s, label);
  if (!device) {
    steps.push(st(s, `Device "${label}" not found.`, 2, [], [], "error"));
    return steps;
  }

  s.links = s.links.filter((l) => l.from !== device.id && l.to !== device.id);
  s.devices = s.devices.filter((d) => d.id !== device.id);
  delete s.positions[device.id];
  // Nobody else's position is touched — removing a device shouldn't reflow
  // the rest of the layout the user built.

  steps.push(st(s, `"${label}" and its links removed.`, 4, [], [], "delete"));
  return steps;
}

export function topologyAddLink(state: TopologyState, fromLabel: string, toLabel: string): TopologyStep[] {
  const steps: TopologyStep[] = [];
  const s = cloneTopology(state);

  steps.push(st(s, `Connect "${fromLabel}" to "${toLabel}".`, 1));

  const fv = findDevice(s, fromLabel);
  const tv = findDevice(s, toLabel);

  if (!fv) { steps.push(st(s, `Device "${fromLabel}" not found.`, 2, [], [], "error")); return steps; }
  if (!tv) { steps.push(st(s, `Device "${toLabel}" not found.`, 2, [], [], "error")); return steps; }

  const exists = s.links.some(
    (l) => (l.from === fv.id && l.to === tv.id) || (l.from === tv.id && l.to === fv.id)
  );
  if (exists) {
    steps.push(st(s, `"${fromLabel}" and "${toLabel}" are already connected.`, 3, [fv.id, tv.id], [], "error"));
    return steps;
  }

  const linkId = newLinkId();
  s.links.push({ id: linkId, from: fv.id, to: tv.id });

  steps.push(st(s, `Link established: "${fromLabel}" — "${toLabel}".`, 4, [fv.id, tv.id], [linkId], "insert"));
  return steps;
}

export function topologyRemoveLink(state: TopologyState, fromLabel: string, toLabel: string): TopologyStep[] {
  const steps: TopologyStep[] = [];
  const s = cloneTopology(state);

  steps.push(st(s, `Disconnect "${fromLabel}" and "${toLabel}".`, 1));

  const fv = findDevice(s, fromLabel);
  const tv = findDevice(s, toLabel);
  if (!fv || !tv) {
    steps.push(st(s, `Device "${!fv ? fromLabel : toLabel}" not found.`, 2, [], [], "error"));
    return steps;
  }

  const before = s.links.length;
  s.links = s.links.filter(
    (l) => !((l.from === fv.id && l.to === tv.id) || (l.from === tv.id && l.to === fv.id))
  );

  if (s.links.length === before) {
    steps.push(st(s, `No link found between "${fromLabel}" and "${toLabel}".`, 3, [fv.id, tv.id], [], "error"));
    return steps;
  }

  steps.push(st(s, `Link removed.`, 4, [fv.id, tv.id], [], "delete"));
  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TOPOLOGY_CODE: Record<string, string[]> = {
  addDevice: [
    "function addDevice(label, kind, position) {",
    "  if (exists(label)) return; // no duplicate names",
    "  devices.push({ id, label, kind, mac, ip });",
    "  positions[id] = position; // wherever the user clicked/dropped it",
    "}",
  ],
  removeDevice: [
    "function removeDevice(label) {",
    "  if (!exists(label)) return;",
    "  links = links.filter(l => !touches(l, label));",
    "  devices = devices.filter(d => d.label != label);",
    "}",
  ],
  addLink: [
    "function addLink(from, to) {",
    "  if (!exists(from) || !exists(to)) return;",
    "  if (linkExists(from, to)) return;",
    "  links.push({ from, to }); // undirected cable",
    "}",
  ],
  removeLink: [
    "function removeLink(from, to) {",
    "  if (!exists(from) || !exists(to)) return;",
    "  links = links.filter(l => !connects(l, from, to));",
    "}",
  ],
};

export const TOPOLOGY_ANNOTATIONS: Record<string, Record<number, string>> = {
  addDevice: {
    2: "A topology is just a labeled graph: each device is a vertex, each cable an edge.",
    3: "PCs and servers are usually endpoints (hosts); switches and routers forward traffic between them.",
  },
  addLink: {
    3: "A link here models a physical cable — undirected, since Ethernet/IP traffic can flow either way over it.",
  },
};

export const TOPOLOGY_COMPLEXITY: Record<string, { time: string; space: string; note: string }> = {
  addDevice:    { time: "O(V)", space: "O(1)", note: "O(V) to recompute the grid layout for all devices." },
  removeDevice: { time: "O(V+E)", space: "O(1)", note: "Must also drop every link touching the removed device." },
  addLink:      { time: "O(E)", space: "O(1)", note: "Linear scan to check for an existing cable between the two devices." },
  removeLink:   { time: "O(E)", space: "O(1)", note: "Linear scan to find and drop the matching cable." },
};
