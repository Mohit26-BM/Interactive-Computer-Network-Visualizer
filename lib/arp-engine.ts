import { Step } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

// per-device cache: deviceId -> (ip -> mac), exactly like a real ARP table
export type ArpCache = Record<string, Record<string, string>>;

export interface ArpStep extends Step {
  topology: TopologyState;
  cache: ArpCache;
  highlightDevices: string[];
  highlightLinks: string[];
}

export interface ArpResult {
  steps: ArpStep[];
  cache: ArpCache; // pass this back into the next call to keep the cache warm
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function st(
  topology: TopologyState,
  cache: ArpCache,
  explanation: string,
  hl: number,
  hd: string[] = [],
  hlk: string[] = [],
  phase?: string
): ArpStep {
  return {
    topology,
    cache: Object.fromEntries(Object.entries(cache).map(([id, m]) => [id, { ...m }])),
    explanation,
    highlightLine: hl,
    highlightDevices: hd,
    highlightLinks: hlk,
    phase,
  };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function linkBetween(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

// ─── Resolve an IP to a MAC address on the local LAN ─────────────────────────
// ARP only ever asks "who on THIS segment has this IP" — it never crosses a
// router, which is why every device it's demonstrated with sits directly on
// the same switch.

export function arpResolve(topology: TopologyState, cache: ArpCache, fromLabel: string, toLabel: string): ArpResult {
  const steps: ArpStep[] = [];
  const from = findDevice(topology, fromLabel);
  const to = findDevice(topology, toLabel);

  if (!from || !to || !from.ip || !to.ip) {
    steps.push(st(topology, cache, `Both "${fromLabel}" and "${toLabel}" need an IP address for ARP to make sense.`, 1, [], [], "error"));
    return { steps, cache };
  }

  const sw = topology.devices.find((d) => d.kind === "switch" && linkBetween(topology, d.id, from.id) && linkBetween(topology, d.id, to.id));
  if (!sw) {
    steps.push(st(topology, cache, `"${fromLabel}" and "${toLabel}" aren't on the same switched segment — ARP can't reach across a router.`, 1, [], [], "error"));
    return { steps, cache };
  }

  const fromLink = linkBetween(topology, from.id, sw.id)!;
  const toLink = linkBetween(topology, sw.id, to.id)!;
  const localCache = { ...(cache[from.id] ?? {}) };

  steps.push(st(topology, cache, `${fromLabel} wants to reach ${to.ip} but only has an IP — it needs a MAC address to actually build a frame.`, 1, [from.id]));
  steps.push(st(topology, cache, `Checking ${fromLabel}'s ARP cache for ${to.ip}...`, 2, [from.id]));

  if (localCache[to.ip]) {
    steps.push(st(
      topology,
      { ...cache, [from.id]: localCache },
      `Cache hit! ${to.ip} is already known to be at ${localCache[to.ip]}. No broadcast needed — send the frame directly.`,
      3, [from.id, to.id], [fromLink.id, toLink.id], "found"
    ));
    return { steps, cache: { ...cache, [from.id]: localCache } };
  }

  steps.push(st(topology, cache, `Not cached. Broadcast: "Who has ${to.ip}? Tell ${from.ip}."`, 5, [from.id], [fromLink.id], "default"));

  const otherLinks = topology.links.filter((l) => (l.from === sw.id || l.to === sw.id) && l.id !== fromLink.id).map((l) => l.id);
  const otherDevices = topology.devices.filter((d) => d.id !== from.id && d.id !== sw.id).map((d) => d.id);
  steps.push(st(topology, cache, `${sw.label} floods the request to every other device on the segment.`, 6, otherDevices, otherLinks, "default"));

  steps.push(st(topology, cache, `${toLabel} recognizes ${to.ip} as its own address and replies: "I have it — my MAC is ${to.mac}."`, 8, [to.id], [toLink.id], "found"));
  steps.push(st(topology, cache, `Every other device silently ignores the request — it isn't their IP.`, 9, otherDevices.filter((id) => id !== to.id)));

  localCache[to.ip] = to.mac;
  steps.push(st(topology, cache, `${fromLabel} caches ${to.ip} → ${to.mac}. Future sends to this IP skip the broadcast entirely.`, 10, [from.id], [], "insert"));

  const finalCache = { ...cache, [from.id]: localCache };
  steps.push(st(topology, finalCache, `${fromLabel} can now build a frame addressed to ${to.mac} and send the original packet.`, 11, [from.id, to.id], [fromLink.id, toLink.id], "found"));

  return { steps, cache: finalCache };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ARP_CODE: string[] = [
  "function resolve(targetIP) {",
  "  if (cache[targetIP]) return cache[targetIP]; // fast path",
  "",
  "  broadcast(ArpRequest{ targetIP, senderIP, senderMAC });",
  "  // every host on the segment receives it",
  "",
  "  on ArpRequest received by host:",
  "    if (host.ip === targetIP)",
  "      reply(ArpReply{ senderMAC: host.mac });",
  "    // else: silently ignore",
  "",
  "  cache[targetIP] = reply.senderMAC;",
  "  return cache[targetIP];",
  "}",
];

export const ARP_ANNOTATIONS: Record<number, string> = {
  2: "Checking the cache first is what makes ARP cheap in practice — the broadcast only happens once per neighbor, not once per packet.",
  5: "A broadcast reaches every device on the local segment simultaneously — there's no way yet to address just one, since the MAC is exactly what's missing.",
  6: "The switch doesn't understand ARP specially — it just floods broadcast frames to every port, same as any unknown-destination frame.",
  8: "Only the device whose IP matches replies — this is a unicast reply straight back to the original sender.",
  9: "Silently ignoring is correct behavior, not an error: a broadcast is addressed to everyone, and everyone gets to decide it isn't for them.",
  10: "The cache entry has a real-world timeout (commonly tens of minutes) — this demo keeps it forever for clarity.",
};

export const ARP_COMPLEXITY = {
  time: "O(1) cached, O(hosts) uncached",
  space: "O(known hosts)",
  note: "A cache hit is a single lookup. A cache miss costs one broadcast reaching every host on the segment, then a single reply.",
};
