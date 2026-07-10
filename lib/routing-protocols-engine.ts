import { Step } from "./types";
import { TopologyState } from "./topology-engine";
import { dijkstra, RoutingStep } from "./routing-engine";

// Distance Vector (RIP) vs Link State (OSPF), on the same router mesh
// routing.ts already uses. RIP is reimplemented here as synchronous
// Bellman-Ford rounds (hop count only, ignoring link weight — that's the
// actual RIP metric); OSPF is *not* reimplemented — it's exactly Dijkstra,
// which is already built, wrapped with one preamble step explaining the
// flood-then-compute-once framing that makes it a different protocol from
// RIP despite solving the same problem.

export interface DvStep extends Step {
  round: number;
  distances: Record<string, number>; // deviceId -> hop count
  changedIds: string[];
}

export function simulateRip(topology: TopologyState, startLabel: string): DvStep[] {
  const steps: DvStep[] = [];
  const ids = topology.devices.map((d) => d.id);
  const distances: Record<string, number> = {};
  ids.forEach((id) => { distances[id] = Infinity; });

  const start = topology.devices.find((d) => d.label === startLabel);
  if (!start) return [{ explanation: `Router "${startLabel}" not found.`, highlightLine: 1, round: 0, distances, changedIds: [], phase: "error" }];

  distances[start.id] = 0;
  steps.push({ explanation: `${startLabel} starts knowing only itself: hop count 0. Every other router is unreachable (infinity) until a neighbor tells it otherwise.`, highlightLine: 1, round: 0, distances: { ...distances }, changedIds: [start.id] });

  const adj: Record<string, string[]> = {};
  ids.forEach((id) => { adj[id] = []; });
  topology.links.forEach((l) => { adj[l.from].push(l.to); adj[l.to].push(l.from); });

  let round = 0;
  let changedAny = true;
  while (changedAny && round < ids.length) {
    round++;
    changedAny = false;
    const changedIds: string[] = [];
    const newDistances = { ...distances };
    for (const id of ids) {
      for (const n of adj[id]) {
        if (distances[n] + 1 < newDistances[id]) {
          newDistances[id] = distances[n] + 1;
          changedAny = true;
          if (!changedIds.includes(id)) changedIds.push(id);
        }
      }
    }
    Object.assign(distances, newDistances);
    if (changedIds.length > 0) {
      const summary = changedIds.map((id) => {
        const d = topology.devices.find((x) => x.id === id)!;
        return `${d.label}=${distances[id]}`;
      }).join(", ");
      steps.push({ explanation: `Round ${round}: every router exchanges its distance vector with directly connected neighbors only — nobody sees the full topology. Updated hop counts this round: ${summary}.`, highlightLine: 2, round, distances: { ...distances }, changedIds });
    }
  }

  const summary = topology.devices.map((d) => `${d.label}:${distances[d.id] === Infinity ? "∞" : distances[d.id]}`).join(", ");
  steps.push({ explanation: `Converged after ${round} round${round === 1 ? "" : "s"} of neighbor-to-neighbor exchange. Final hop counts from ${startLabel}: ${summary}.`, highlightLine: 3, round, distances: { ...distances }, changedIds: [], phase: "found" });
  return steps;
}

export function simulateOspf(topology: TopologyState, startLabel: string): RoutingStep[] {
  const core = dijkstra(topology, startLabel);
  if (core.length === 0) return core;
  const preamble: RoutingStep = {
    ...core[0],
    explanation: `Every router floods a Link State Advertisement (LSA) describing only its own directly connected links and costs — but that LSA propagates to everyone, so ${startLabel} ends up with the entire topology, not just its neighbors' summaries.`,
    highlightLine: 0,
    phase: undefined,
  };
  const rest = core.map((s) => ({ ...s, explanation: `[Local Dijkstra over the flooded topology] ${s.explanation}` }));
  return [preamble, ...rest];
}

export const RIP_CODE: string[] = [
  "function rip(routers, links, start) {",
  "  dist[start] = 0; dist[rest] = Infinity;",
  "  do {",
  "    changed = false;",
  "    for (r of routers)",
  "      for (n of neighbors(r))              // only directly connected routers",
  "        if (dist[n] + 1 < dist[r]) {        // hop count, not weighted cost",
  "          dist[r] = dist[n] + 1; changed = true;",
  "        }",
  "  } while (changed);                        // converges in <= diameter rounds",
  "}",
];

export const RIP_ANNOTATIONS: Record<number, string> = {
  1: "Distance Vector: a router only ever tells its neighbors \"here's my distance to everything I know\" — never the topology itself.",
  2: "Convergence is gradual and round-based, because information about a distant router has to hop, neighbor by neighbor, before it arrives.",
  3: "RIP's real limit is exactly this: hop count only (never bandwidth/latency), capped at 15 hops, and slow (30s periodic) to notice failures — which is why link-state protocols like OSPF exist.",
};

export const RIP_COMPLEXITY = {
  time: "O(V · E) worst case",
  space: "O(V) per router",
  note: "Bellman-Ford-style relaxation, repeated once per round until nothing changes — up to the network's diameter in rounds.",
};

export const OSPF_ANNOTATIONS: Record<number, string> = {
  0: "This is the entire philosophical difference from RIP: link state floods raw topology facts everywhere first, then each router computes independently — distance vector never shares the raw topology at all.",
};

export const OSPF_COMPLEXITY = {
  time: "O(V²) per router (Dijkstra), once per topology change",
  space: "O(V + E) — the full topology database, not just a distance table",
  note: "Because every router already has the whole graph, OSPF recomputes its table in one pass instead of waiting several rounds the way RIP does.",
};
