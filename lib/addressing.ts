import type { TopologyState, DeviceNode } from "./topology-engine";
import { Route, ipToInt, intToIp, maskOf, lookupRoute, routeText } from "./routing-table-engine";

// Real IP addressing for topologies that contain routers.
//
// In a real network a router joins DIFFERENT subnets: every link or LAN attached to it is its own
// subnet, the router has one interface (with its own IP and MAC) on each, hosts point at the
// router's interface as their default gateway, and routers hold a routing table with a route to
// every subnet. This module derives all of that from the topology graph:
//   - segments = groups of hosts/switches that are directly connected (a "broadcast domain"),
//   - one subnet per segment (and one /30 per router-to-router link),
//   - interfaces on routers, a default gateway on hosts,
//   - a routing table per router (connected routes + routes learned from neighbouring routers).

export interface DeviceIface {
  name: string;      // e0, e1, ...
  ip: string;
  len: number;
  mac: string;
  peers: string[];   // ids of the devices directly reachable through this interface
}

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

export function assignRoutedAddressing(state: TopologyState): TopologyState {
  const devices: DeviceNode[] = state.devices.map((d) => ({ ...d, ifaces: undefined, gateway: undefined }));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const router = (id: string) => byId.get(id)!.kind === "router";
  const num = (id: string) => devices.findIndex((d) => d.id === id) + 1;

  // union-find over hosts and switches that are directly linked
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  for (const d of devices) if (d.kind !== "router") parent.set(d.id, d.id);
  for (const l of state.links) if (!router(l.from) && !router(l.to)) parent.set(find(l.from), find(l.to));

  // segments in device order
  const segOrder: string[] = [];
  for (const d of devices) if (d.kind !== "router") { const r = find(d.id); if (!segOrder.includes(r)) segOrder.push(r); }

  type Att = { routerId: string; peers: string[] };
  const attach = new Map<string, Att[]>(); // segment root -> router attachments
  const p2p: { a: string; b: string }[] = [];
  for (const l of state.links) {
    const fr = router(l.from), tr = router(l.to);
    if (fr && tr) { p2p.push({ a: l.from, b: l.to }); continue; }
    if (fr !== tr) {
      const r = fr ? l.from : l.to;
      const other = fr ? l.to : l.from;
      const root = find(other);
      const list = attach.get(root) ?? [];
      const existing = list.find((x) => x.routerId === r);
      if (existing) existing.peers.push(other); else list.push({ routerId: r, peers: [other] });
      attach.set(root, list);
    }
  }

  const ifaceCount = new Map<string, number>();
  const addIface = (routerId: string, ip: string, len: number, peers: string[]) => {
    const dev = byId.get(routerId)!;
    const k = ifaceCount.get(routerId) ?? 0;
    ifaceCount.set(routerId, k + 1);
    const iface: DeviceIface = { name: `e${k}`, ip, len, mac: `AA:BB:CC:${hex2(num(routerId))}:01:${hex2(k)}`, peers };
    dev.ifaces = [...(dev.ifaces ?? []), iface];
    return iface;
  };

  // host LANs
  let lan = 0;
  for (const root of segOrder) {
    const members = devices.filter((d) => d.kind !== "router" && find(d.id) === root);
    const atts = attach.get(root) ?? [];
    const hosts = members.filter((d) => d.kind !== "switch");
    if (hosts.length === 0 && atts.length === 0) continue;
    const base = lan === 0 ? "192.168.1" : `10.0.${lan}`;
    lan++;
    let gw: string | undefined;
    atts.forEach((a, i) => { const f = addIface(a.routerId, `${base}.${1 + i}`, 24, a.peers); gw = gw ?? f.ip; });
    hosts.forEach((h, i) => { h.ip = `${base}.${10 + i}`; h.gateway = gw; });
  }

  // router-to-router links: a /30 each
  p2p.forEach((link, i) => {
    const base = `172.16.${i + 1}`;
    addIface(link.a, `${base}.1`, 30, [link.b]);
    addIface(link.b, `${base}.2`, 30, [link.a]);
  });

  for (const d of devices) if (d.kind === "router" && d.ifaces?.length) d.ip = d.ifaces[0].ip;
  return { ...state, devices };
}

const netOf = (ip: string, len: number) => intToIp(((ipToInt(ip)! & maskOf(len)) >>> 0));

/** Routing table of every router: connected routes plus routes learned from neighbouring routers. */
export function computeRoutes(state: TopologyState): Record<string, Route[]> {
  const routers = state.devices.filter((d) => d.kind === "router" && d.ifaces?.length);
  const tables: Record<string, Route[]> = {};
  const nets = new Map<string, number>(); // network -> len
  for (const r of routers) for (const f of r.ifaces!) nets.set(netOf(f.ip, f.len), f.len);

  for (const r of routers) {
    const routes: Route[] = [];
    const reached = new Map<string, { hops: number; nextHop: string; iface: string }>(); // router id -> first hop
    const have = new Set<string>();
    for (const f of r.ifaces!) {
      const n = netOf(f.ip, f.len);
      have.add(n);
      routes.push({ id: `${r.id}-C-${n}`, network: n, len: f.len, nextHop: null, iface: f.name, source: "C", metric: 0 });
    }
    // breadth-first search over routers that share a subnet
    const queue: { id: string; hops: number; nextHop: string; iface: string }[] = [];
    const seen = new Set<string>([r.id]);
    for (const f of r.ifaces!) {
      for (const o of routers) {
        if (seen.has(o.id)) continue;
        const of = o.ifaces!.find((x) => netOf(x.ip, x.len) === netOf(f.ip, f.len));
        if (of) { seen.add(o.id); const e = { id: o.id, hops: 1, nextHop: of.ip, iface: f.name }; queue.push(e); reached.set(o.id, e); }
      }
    }
    while (queue.length) {
      const cur = queue.shift()!;
      const curDev = routers.find((x) => x.id === cur.id)!;
      for (const f of curDev.ifaces!) {
        for (const o of routers) {
          if (seen.has(o.id)) continue;
          if (o.ifaces!.some((x) => netOf(x.ip, x.len) === netOf(f.ip, f.len))) {
            seen.add(o.id);
            const e = { id: o.id, hops: cur.hops + 1, nextHop: cur.nextHop, iface: cur.iface };
            queue.push(e); reached.set(o.id, e);
          }
        }
      }
    }
    for (const [n, len] of nets) {
      if (have.has(n)) continue;
      let best: { hops: number; nextHop: string; iface: string } | null = null;
      for (const o of routers) {
        const via = reached.get(o.id);
        if (!via) continue;
        if (o.ifaces!.some((x) => netOf(x.ip, x.len) === n) && (!best || via.hops < best.hops)) best = via;
      }
      if (best) routes.push({ id: `${r.id}-O-${n}`, network: n, len, nextHop: best.nextHop, iface: best.iface, source: "O", metric: best.hops });
    }
    tables[r.id] = routes;
  }
  return tables;
}

/** The interface of `router` that faces `peerId` (the next device on the path). */
export function ifaceToward(router: DeviceNode, peerId: string): DeviceIface | undefined {
  return router.ifaces?.find((f) => f.peers.includes(peerId));
}

/** Plain-language description of a router's lookup, for step narration. */
export function describeLookup(routes: Route[], dest: string): string {
  const { matches, best } = lookupRoute(routes, dest);
  if (!best) return `no route matches ${dest}`;
  const how = best.nextHop ? `via next hop ${best.nextHop} out ${best.iface}` : `directly connected on ${best.iface}`;
  return `longest match is ${routeText(best)} (${how})${matches.length > 1 ? `, chosen over ${matches.length - 1} shorter match${matches.length > 2 ? "es" : ""}` : ""}`;
}
