import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

// Cache lives at the resolver, keyed by domain — same "state persisted
// across calls, returned alongside steps" pattern as the ARP cache.
export type DnsCache = Record<string, { ip: string; ttl: number }>;

export interface DnsStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  cache: DnsCache;
}

export interface DnsResult {
  steps: DnsStep[];
  cache: DnsCache;
}

const FRAMES_PER_LINK = 5;
const DEFAULT_TTL = 300;

// A tiny, fixed "zone file" — enough to demonstrate the referral chain
// without needing a general-purpose DNS zone model.
const AUTHORITATIVE_IP = "142.250.80.14";

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

function st(topology: TopologyState, packet: PacketState, cache: DnsCache, explanation: string, hl: number, phase?: string): DnsStep {
  return {
    topology,
    packet: clonePacket(packet),
    cache: { ...cache },
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── Recursive resolution: client -> resolver -> root -> TLD -> authoritative ─
// The client only ever talks to the resolver — every referral hop after that
// is the resolver doing the recursive legwork on the client's behalf.

export function resolveDns(topology: TopologyState, cache: DnsCache, clientLabel: string, resolverLabel: string, domain: string): DnsResult {
  const steps: DnsStep[] = [];

  const client = findDevice(topology, clientLabel);
  const resolver = findDevice(topology, resolverLabel);
  const root = findDevice(topology, "ROOT");
  const tld = findDevice(topology, "TLD-COM");
  const auth = findDevice(topology, "AUTH-GOOGLE");

  let packet: PacketState = { id: "dns", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client || !resolver || !root || !tld || !auth) {
    steps.push(st(topology, packet, cache, `One of the required devices is missing from this topology.`, 1, "error"));
    return { steps, cache };
  }

  function travel(pkt: PacketState, label: string, fromLabel: string, toLabel: string) {
    const pathLabels = findPath(topology, fromLabel, toLabel)!;
    const path = pathLabels.map((l) => findDevice(topology, l)!);
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const hopFrom = path[i];
      const hopTo = path[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, cache, `${label} leaving ${hopFrom.label}.`, 2));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, cache, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 2));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 52123, dstPort: 53 } }, { protocol: "DNS", fields: { query: domain, type: "A", recursionDesired: "yes" } }] };
  steps.push(st(topology, packet, cache, `${clientLabel} asks ${resolverLabel} to resolve "${domain}" — "recursion desired" means the client wants a final answer, not just referrals.`, 1, "insert"));
  packet = travel(packet, "QUERY", clientLabel, resolverLabel);
  steps.push(st(topology, packet, cache, `${resolverLabel} receives the query and checks its cache first.`, 3, "found"));

  const cached = cache[domain];
  if (cached) {
    packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 52123 } }, { protocol: "DNS", fields: { answer: domain, ip: cached.ip, ttl: cached.ttl, source: "cache" } }] };
    steps.push(st(topology, packet, cache, `Cache hit! "${domain}" → ${cached.ip} is already known (TTL ${cached.ttl}s remaining) — no root, TLD, or authoritative server needs to be asked.`, 4, "found"));
    packet = travel(packet, "ANSWER", resolverLabel, clientLabel);
    packet = { ...clonePacket(packet), fate: "delivered" };
    steps.push(st(topology, packet, cache, `${clientLabel} receives ${cached.ip} for "${domain}" — resolved without leaving the resolver.`, 4, "found"));
    return { steps, cache };
  }

  steps.push(st(topology, packet, cache, `Cache miss — "${domain}" isn't known yet. ${resolverLabel} has to walk the DNS hierarchy from the top.`, 5, "error"));

  // Resolver -> Root
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { query: domain, type: "A" } }] };
  steps.push(st(topology, packet, cache, `${resolverLabel} asks the ROOT server about "${domain}".`, 6, "insert"));
  packet = travel(packet, "QUERY", resolverLabel, "ROOT");
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { referral: "TLD-COM", note: "\"I don't know — ask the .com TLD server.\"" } }] };
  steps.push(st(topology, packet, cache, `ROOT doesn't know the answer, but it knows who handles ".com" — it refers ${resolverLabel} to TLD-COM.`, 7, "found"));
  packet = travel(packet, "REFERRAL", "ROOT", resolverLabel);

  // Resolver -> TLD
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { query: domain, type: "A" } }] };
  steps.push(st(topology, packet, cache, `${resolverLabel} asks TLD-COM about "${domain}".`, 8, "insert"));
  packet = travel(packet, "QUERY", resolverLabel, "TLD-COM");
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { referral: "AUTH-GOOGLE", note: "\"I don't know either — ask google.com's own authoritative server.\"" } }] };
  steps.push(st(topology, packet, cache, `TLD-COM doesn't have the answer either, but knows who's authoritative for "${domain}" — another referral.`, 9, "found"));
  packet = travel(packet, "REFERRAL", "TLD-COM", resolverLabel);

  // Resolver -> Authoritative
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { query: domain, type: "A" } }] };
  steps.push(st(topology, packet, cache, `${resolverLabel} asks AUTH-GOOGLE — the server that actually owns "${domain}"'s records.`, 10, "insert"));
  packet = travel(packet, "QUERY", resolverLabel, "AUTH-GOOGLE");
  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 53 } }, { protocol: "DNS", fields: { answer: domain, ip: AUTHORITATIVE_IP, ttl: DEFAULT_TTL } }] };
  steps.push(st(topology, packet, cache, `AUTH-GOOGLE has the real answer: "${domain}" → ${AUTHORITATIVE_IP}, valid for ${DEFAULT_TTL}s.`, 11, "found"));
  packet = travel(packet, "ANSWER", "AUTH-GOOGLE", resolverLabel);

  const newCache = { ...cache, [domain]: { ip: AUTHORITATIVE_IP, ttl: DEFAULT_TTL } };
  steps.push(st(topology, packet, newCache, `${resolverLabel} caches "${domain}" → ${AUTHORITATIVE_IP} for ${DEFAULT_TTL}s — the next lookup for this domain will be a cache hit.`, 12, "insert"));

  packet = { ...clonePacket(packet), layers: [{ protocol: "UDP", fields: { srcPort: 53, dstPort: 52123 } }, { protocol: "DNS", fields: { answer: domain, ip: AUTHORITATIVE_IP, ttl: DEFAULT_TTL } }] };
  packet = travel(packet, "ANSWER", resolverLabel, clientLabel);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, newCache, `${clientLabel} finally receives ${AUTHORITATIVE_IP} for "${domain}" — three referrals later, the browser can now open a connection to that address.`, 13, "found"));

  return { steps, cache: newCache };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const DNS_CODE: string[] = [
  "function resolve(resolver, domain) {",
  "  if (cache[domain] && !expired(cache[domain]))",
  "    return cache[domain];                 // cache hit — done immediately",
  "",
  "  server = ROOT;",
  "  while (true) {",
  "    response = query(server, domain);",
  "    if (response.isAnswer) {",
  "      cache[domain] = response;           // cache miss path ends here",
  "      return response;",
  "    }",
  "    server = response.referral;           // follow the referral down one level",
  "  }",
  "}",
];

export const DNS_ANNOTATIONS: Record<number, string> = {
  1: "\"Recursion desired\" is what makes this the resolver's job — the client would otherwise have to walk root -> TLD -> authoritative itself.",
  4: "A cache hit skips the entire hierarchy walk — this is exactly why DNS caching matters so much for real-world latency.",
  7: "A referral isn't an answer — it's the server saying \"not my job, but I know whose it is.\"",
  9: "Each referral moves one level more specific: root knows TLDs, a TLD knows authoritative servers, an authoritative server knows the actual record.",
  11: "Only the authoritative server's reply is a real answer — everything before it was a signpost pointing further down the hierarchy.",
  12: "The TTL is what eventually expires this cache entry — until then, every other client asking this same resolver benefits from this one lookup.",
};

export const DNS_COMPLEXITY = {
  time: "O(1) cached, O(hierarchy depth) uncached",
  space: "O(cached domains)",
  note: "A cache hit is one round trip. A cache miss costs one round trip per level of the hierarchy — root, TLD, authoritative — regardless of how large the internet's total namespace is.",
};
