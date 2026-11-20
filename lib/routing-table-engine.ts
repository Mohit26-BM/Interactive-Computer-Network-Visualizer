import { Step } from "./types";
import { vIPv4 } from "./validation";

// Real IP forwarding, as a router actually does it:
//   1. look the destination IP up in the routing table,
//   2. choose the LONGEST matching prefix (ties: lowest administrative distance, then lowest metric),
//   3. decrement TTL, rewrite the Layer-2 header for the next hop, and send.
// Hosts first decide "is the destination on my subnet?" - if not, the frame goes to the DEFAULT GATEWAY's
// MAC address, while the IP header still carries the real destination.

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteSource = "C" | "S" | "O"; // Connected, Static, OSPF
export const ADMIN_DISTANCE: Record<RouteSource, number> = { C: 0, S: 1, O: 110 };
export const SOURCE_NAME: Record<RouteSource, string> = { C: "Connected", S: "Static", O: "OSPF" };

export interface Route {
  id: string;
  network: string;
  len: number;
  nextHop: string | null; // null = directly connected
  iface: string;
  source: RouteSource;
  metric: number;
}

export interface Iface { name: string; ip: string; len: number; mac: string }
export interface RouterDef { name: string; ifaces: Iface[]; routes: Route[] }
export interface HostDef { name: string; ip: string; len: number; gateway: string; mac: string }
export interface Scenario { routers: Record<string, RouterDef>; hosts: Record<string, HostDef> }

export type RowStatus = "pending" | "match" | "no-match" | "winner" | "beaten";
export interface LookupRow { route: Route; status: RowStatus }
export interface LookupView { router: string; dest: string; rows: LookupRow[]; result: string }

export interface LookupStep extends Step { view: LookupView }

export interface ForwardStep extends Step {
  where: string;                       // device the packet is at
  l2: { src: string; dst: string } | null;
  l3: { src: string; dst: string; ttl: number };
  lookup?: LookupView;
  outcome?: "delivered" | "dropped";
}

// ─── Address helpers ──────────────────────────────────────────────────────────

export function ipToInt(ip: string): number | null {
  if (!vIPv4(ip).ok) return null;
  const p = ip.trim().split(".").map(Number);
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function maskOf(len: number): number {
  return len <= 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
}

export function inPrefix(ip: string, network: string, len: number): boolean {
  const a = ipToInt(ip);
  const b = ipToInt(network);
  if (a === null || b === null) return false;
  const m = maskOf(len);
  return ((a & m) >>> 0) === ((b & m) >>> 0);
}

export const routeText = (r: Route) => `${r.network}/${r.len}`;

// ─── Route selection ─────────────────────────────────────────────────────────

/** Longest prefix wins; ties go to the lowest administrative distance, then the lowest metric. */
export function lookupRoute(routes: Route[], dest: string): { matches: Route[]; best: Route | null } {
  const matches = routes
    .filter((r) => inPrefix(dest, r.network, r.len))
    .sort((a, b) =>
      b.len - a.len ||
      ADMIN_DISTANCE[a.source] - ADMIN_DISTANCE[b.source] ||
      a.metric - b.metric);
  return { matches, best: matches[0] ?? null };
}

function makeView(router: string, dest: string, routes: Route[]): LookupView {
  const { matches, best } = lookupRoute(routes, dest);
  const rows: LookupRow[] = routes.map((r) => ({
    route: r,
    status: r === best ? "winner" : matches.includes(r) ? "beaten" : "no-match",
  }));
  const result = best
    ? `${routeText(best)} (${best.len === 0 ? "default route" : `${best.len}-bit match`}) -> ${best.nextHop ? `next hop ${best.nextHop}` : "directly connected"} out ${best.iface}`
    : "no matching route";
  return { router, dest, rows, result };
}

// ─── The demo network ────────────────────────────────────────────────────────
//
//   PC-1 ── R1 ──── R2 ──── R3 ── SRV-1
//            └───────────────┘
//
// R1 knows two ways to reach the server network: a specific /24 straight to R3 and a wider /16 via R2.
// Toggling routes off (the `disabled` list) shows traffic falling back to the less specific route.

const mac = (n: number, i: number) => `02:00:00:00:0${n}:0${i}`;

export function buildScenario(disabled: string[] = []): Scenario {
  const R = (id: string, network: string, len: number, nextHop: string | null, iface: string, source: RouteSource, metric = 0): Route =>
    ({ id, network, len, nextHop, iface, source, metric });

  const r1: RouterDef = {
    name: "R1",
    ifaces: [
      { name: "e0", ip: "192.168.1.1", len: 24, mac: mac(1, 0) },
      { name: "e1", ip: "10.0.12.1", len: 30, mac: mac(1, 1) },
      { name: "e2", ip: "10.0.13.1", len: 30, mac: mac(1, 2) },
    ],
    routes: [
      R("r1-c0", "192.168.1.0", 24, null, "e0", "C"),
      R("r1-c1", "10.0.12.0", 30, null, "e1", "C"),
      R("r1-c2", "10.0.13.0", 30, null, "e2", "C"),
      R("r1-o24", "172.16.0.0", 24, "10.0.13.2", "e2", "O", 10),
      R("r1-o16", "172.16.0.0", 16, "10.0.12.2", "e1", "O", 20),
      R("r1-s0", "0.0.0.0", 0, "10.0.12.2", "e1", "S"),
    ].filter((r) => !disabled.includes(r.id)),
  };
  const r2: RouterDef = {
    name: "R2",
    ifaces: [
      { name: "e0", ip: "10.0.12.2", len: 30, mac: mac(2, 0) },
      { name: "e1", ip: "10.0.23.1", len: 30, mac: mac(2, 1) },
    ],
    routes: [
      R("r2-c0", "10.0.12.0", 30, null, "e0", "C"),
      R("r2-c1", "10.0.23.0", 30, null, "e1", "C"),
      R("r2-o16", "172.16.0.0", 16, "10.0.23.2", "e1", "O", 10),
      R("r2-o192", "192.168.1.0", 24, "10.0.12.1", "e0", "O", 10),
    ],
  };
  const r3: RouterDef = {
    name: "R3",
    ifaces: [
      { name: "e0", ip: "10.0.13.2", len: 30, mac: mac(3, 0) },
      { name: "e1", ip: "10.0.23.2", len: 30, mac: mac(3, 1) },
      { name: "e2", ip: "172.16.0.1", len: 24, mac: mac(3, 2) },
    ],
    routes: [
      R("r3-c0", "10.0.13.0", 30, null, "e0", "C"),
      R("r3-c1", "10.0.23.0", 30, null, "e1", "C"),
      R("r3-c2", "172.16.0.0", 24, null, "e2", "C"),
      R("r3-o192", "192.168.1.0", 24, "10.0.13.1", "e0", "O", 10),
    ],
  };
  return {
    routers: { R1: r1, R2: r2, R3: r3 },
    hosts: {
      "PC-1": { name: "PC-1", ip: "192.168.1.10", len: 24, gateway: "192.168.1.1", mac: "02:00:00:aa:00:01" },
      "SRV-1": { name: "SRV-1", ip: "172.16.0.50", len: 24, gateway: "172.16.0.1", mac: "02:00:00:aa:00:02" },
    },
  };
}

/** Route ids a student may switch off in the demo (everything except connected routes). */
export const TOGGLEABLE_ROUTES = ["r1-o24", "r1-o16", "r1-s0"];

// Who owns an IP address on this network?
function owner(s: Scenario, ip: string): { kind: "router"; name: string; iface: Iface } | { kind: "host"; name: string; mac: string } | null {
  for (const r of Object.values(s.routers)) {
    const i = r.ifaces.find((f) => f.ip === ip);
    if (i) return { kind: "router", name: r.name, iface: i };
  }
  for (const h of Object.values(s.hosts)) if (h.ip === ip) return { kind: "host", name: h.name, mac: h.mac };
  return null;
}

// ─── Step 1: a single lookup, one candidate at a time ───────────────────────

export function lookupSteps(router: RouterDef, dest: string): LookupStep[] {
  const steps: LookupStep[] = [];
  if (!vIPv4(dest).ok) {
    return [{ explanation: `"${dest}" is not a valid IPv4 address.`, highlightLine: 1, phase: "error",
      view: { router: router.name, dest, rows: router.routes.map((route) => ({ route, status: "pending" as RowStatus })), result: "invalid address" } }];
  }
  const rows: LookupRow[] = router.routes.map((route) => ({ route, status: "pending" }));
  const snap = (result: string): LookupView => ({ router: router.name, dest, rows: rows.map((r) => ({ ...r })), result });

  steps.push({ explanation: `${router.name} must forward a packet addressed to ${dest}. It compares ${dest} with every route in its table, looking at only the first "prefix length" bits of each.`, highlightLine: 1, view: snap("checking...") });

  router.routes.forEach((route, i) => {
    const hit = inPrefix(dest, route.network, route.len);
    rows[i].status = hit ? "match" : "no-match";
    const why = hit
      ? route.len === 0
        ? `a /0 default route matches every address - it is the route of last resort.`
        : `the first ${route.len} bits of ${dest} equal those of ${route.network}.`
      : `the first ${route.len} bits of ${dest} differ from ${route.network}.`;
    steps.push({ explanation: `${routeText(route)} - ${hit ? "MATCH" : "no match"}: ${why}`, highlightLine: 3, phase: hit ? "found" : "default", view: snap("checking...") });
  });

  const view = makeView(router.name, dest, router.routes);
  const { matches, best } = lookupRoute(router.routes, dest);
  if (!best) {
    steps.push({ explanation: `No route matches ${dest} and there is no default route, so ${router.name} drops the packet and sends ICMP Destination Unreachable (net unreachable) back to the sender.`, highlightLine: 7, phase: "error", view });
  } else {
    const tie = matches.length > 1 && matches[1].len === best.len;
    const why = matches.length === 1
      ? `It is the only match.`
      : tie
        ? `Several routes share the longest prefix, so the lowest administrative distance (${SOURCE_NAME[best.source]} = ${ADMIN_DISTANCE[best.source]}), then the lowest metric, decides.`
        : `${matches.length} routes match, but the one with the LONGEST prefix (${best.len} bits) is the most specific, so it wins - even if a shorter prefix has a better metric.`;
    steps.push({ explanation: `Winner: ${routeText(best)}. ${why} Forward ${best.nextHop ? `to next hop ${best.nextHop}` : "directly to the destination on the connected network"} out ${best.iface}.`, highlightLine: 5, phase: "insert", view });
  }
  return steps;
}

// ─── Step 2: end-to-end forwarding with default gateway and next hops ───────

export function forwardPacket(s: Scenario, fromName: string, destIp: string, startTtl = 64): ForwardStep[] {
  const steps: ForwardStep[] = [];
  const host = s.hosts[fromName];
  if (!host) return [{ explanation: `Unknown host "${fromName}".`, highlightLine: 1, phase: "error", where: fromName, l2: null, l3: { src: "?", dst: destIp, ttl: startTtl }, outcome: "dropped" }];
  if (!vIPv4(destIp).ok) return [{ explanation: `"${destIp}" is not a valid IPv4 address.`, highlightLine: 1, phase: "error", where: host.name, l2: null, l3: { src: host.ip, dst: destIp, ttl: startTtl }, outcome: "dropped" }];

  let ttl = startTtl;
  const l3 = () => ({ src: host.ip, dst: destIp, ttl });
  const push = (where: string, l2: ForwardStep["l2"], explanation: string, hl: number, phase?: string, lookup?: LookupView, outcome?: ForwardStep["outcome"]) =>
    steps.push({ where, l2, l3: l3(), explanation, highlightLine: hl, phase, lookup, outcome });

  // --- the host's own decision -------------------------------------------------
  if (destIp === host.ip) {
    push(host.name, null, `${destIp} is ${host.name}'s own address - the packet loops back inside the host and never touches the network.`, 1, "found", undefined, "delivered");
    return steps;
  }
  const onLink = inPrefix(destIp, host.ip, host.len);
  let nextIp: string;
  if (onLink) {
    nextIp = destIp;
    push(host.name, null, `${host.name} (${host.ip}/${host.len}) checks ${destIp}: it is inside its own subnet, so no router is needed. It will ARP for ${destIp} directly.`, 1, "default");
  } else {
    nextIp = host.gateway;
    push(host.name, null, `${host.name} (${host.ip}/${host.len}) checks ${destIp}: it is NOT in its own subnet, so the packet must leave through the DEFAULT GATEWAY ${host.gateway}. The IP destination stays ${destIp}; only the Ethernet destination will be the gateway's MAC.`, 1, "default");
  }
  const first = owner(s, nextIp);
  if (!first) {
    push(host.name, null, `${host.name} broadcasts "who has ${nextIp}?" and nobody answers - ARP fails, so the host reports "destination host unreachable" and sends nothing.`, 2, "error", undefined, "dropped");
    return steps;
  }
  let frameSrc = host.mac;
  let frameDst = first.kind === "router" ? first.iface.mac : first.mac;
  push(host.name, { src: host.mac, dst: frameDst }, `ARP resolves ${nextIp} to ${frameDst}. ${host.name} sends the frame: Ethernet ${host.mac} -> ${frameDst}, IP ${host.ip} -> ${destIp}, TTL ${ttl}.`, 2, "insert");

  if (first.kind === "host") {
    push(first.name, { src: host.mac, dst: frameDst }, `${first.name} receives the frame and accepts the packet.`, 8, "found", undefined, "delivered");
    return steps;
  }

  // --- router by router --------------------------------------------------------
  let cur: RouterDef = s.routers[first.name];
  let ingress: Iface = first.iface;
  for (let hop = 0; hop < 16; hop++) {
    push(cur.name, { src: frameSrc, dst: frameDst },
      `${cur.name} receives the frame on ${ingress.name} (${ingress.ip}). The destination MAC ${frameDst} is its own, so it accepts the frame, strips the Ethernet header and looks at the IP packet.`, 3, "found");

    if (cur.ifaces.some((f) => f.ip === destIp)) {
      push(cur.name, null, `${destIp} is one of ${cur.name}'s own addresses - the packet is for the router itself, not for forwarding.`, 8, "found", undefined, "delivered");
      return steps;
    }

    const view = makeView(cur.name, destIp, cur.routes);
    const { best } = lookupRoute(cur.routes, destIp);
    if (!best) {
      push(cur.name, null, `${cur.name} looks up ${destIp}: no route matches and there is no default route. The packet is dropped and ICMP Destination Unreachable (net unreachable) goes back to ${host.ip}.`, 5, "error", view, "dropped");
      return steps;
    }
    push(cur.name, null, `${cur.name} looks up ${destIp}: longest match is ${view.result}.`, 4, "insert", view);

    if (ttl <= 1) {
      push(cur.name, null, `TTL would reach 0 here, so ${cur.name} discards the packet and sends ICMP Time Exceeded to ${host.ip} (this is how traceroute works, and what stops routing loops).`, 5, "error", view, "dropped");
      return steps;
    }
    ttl -= 1;

    const target = best.nextHop ?? destIp;
    const next = owner(s, target);
    const egress = cur.ifaces.find((f) => f.name === best.iface)!;
    if (!next) {
      push(cur.name, null, `${cur.name} ARPs for ${target} on ${egress.name} and gets no answer: the route points at a destination that does not exist, so the packet is dropped (host unreachable).`, 5, "error", view, "dropped");
      return steps;
    }
    const nextMac = next.kind === "router" ? next.iface.mac : next.mac;
    push(cur.name, { src: egress.mac, dst: nextMac },
      `${cur.name} decrements TTL to ${ttl} and builds a NEW Ethernet header for the next link: ${egress.mac} -> ${nextMac} (${best.nextHop ? `next hop ${best.nextHop}` : `the destination ${destIp}`}). The IP source and destination do not change.`, 6, "default", view);

    frameSrc = egress.mac;
    frameDst = nextMac;
    if (next.kind === "host") {
      push(next.name, { src: egress.mac, dst: nextMac }, `${next.name} receives the frame and accepts the packet - delivered after ${startTtl - ttl} router hop${startTtl - ttl === 1 ? "" : "s"}.`, 8, "found", undefined, "delivered");
      return steps;
    }
    cur = s.routers[next.name];
    ingress = next.iface;
  }
  push(cur.name, null, "Hop limit of this demo reached - the packet is dropped.", 5, "error", undefined, "dropped");
  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ROUTING_TABLE_CODE: string[] = [
  "function forward(packet):",
  "  candidates = [r for r in routingTable if packet.dst in r.prefix]",
  "  // compare only the first r.len bits of the destination",
  "  best = max(candidates, key = (r.len, -r.adminDistance, -r.metric))",
  "  if best is none: return icmpUnreachable(packet.src)",
  "  if packet.ttl <= 1: return icmpTimeExceeded(packet.src)",
  "  packet.ttl -= 1                      // checksum updated",
  "  nextIp = best.nextHop or packet.dst   // connected route: ARP for the destination itself",
  "  sendFrame(src = best.iface.mac, dst = arp(nextIp), payload = packet)",
];

export const ROUTING_TABLE_ANNOTATIONS: Record<number, string> = {
  1: "A host only needs two facts: its own subnet and its default gateway. Anything outside the subnet is handed to the gateway.",
  3: "A route matches when the first len bits of the destination equal those of the route's network. A /0 route matches everything.",
  4: "Longest prefix match is a rule, not a preference: the most specific route always wins, regardless of metric. Real routers do this in hardware with tries/TCAM.",
  5: "Ties on prefix length are broken by administrative distance (how much the router trusts the source: connected 0, static 1, OSPF 110) and then by metric.",
  6: "Each router rewrites the Layer-2 header for the next link and leaves the Layer-3 addresses alone. MAC addresses only ever mean something on one link.",
  8: "The destination only ever sees its own MAC in the frame - it never learns the MACs of the routers the packet crossed.",
};

export const ROUTING_TABLE_COMPLEXITY = {
  time: "O(routes) here; O(32) in a trie",
  space: "O(routes)",
  note: "This page compares against every route to make the idea visible. Production routers store prefixes in a binary trie or TCAM and find the longest match in at most 32 steps (128 for IPv6), independent of table size - the internet's full table holds roughly a million IPv4 prefixes.",
};
