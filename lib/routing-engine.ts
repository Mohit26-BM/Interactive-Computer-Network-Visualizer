import { Step } from "./types";
import { TopologyState, DeviceNode, cloneTopology } from "./topology-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingStep extends Step {
  topology: TopologyState;
  distances: Record<string, number>; // deviceId -> distance
  previous: Record<string, string | null>;
  highlightDevices: string[];
  highlightLinks: string[];
  visited?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function st(
  topology: TopologyState,
  distances: Record<string, number>,
  previous: Record<string, string | null>,
  explanation: string,
  hl: number,
  hd: string[] = [],
  hlk: string[] = [],
  phase?: string,
  visited?: string[]
): RoutingStep {
  return {
    topology: cloneTopology(topology),
    distances: { ...distances },
    previous: { ...previous },
    explanation,
    highlightLine: hl,
    highlightDevices: hd,
    highlightLinks: hlk,
    phase,
    visited,
  };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function linkLabel(topology: TopologyState, fromId: string, toId: string): string {
  const fv = topology.devices.find((d) => d.id === fromId);
  const tv = topology.devices.find((d) => d.id === toId);
  return `${fv?.label}-${tv?.label}`;
}

// ─── Dijkstra — same algorithm as the DSA app's graph-algorithms-engine, ────
// ported from vertices/edges onto this project's devices/links.

export function dijkstra(topology: TopologyState, startLabel: string): RoutingStep[] {
  const steps: RoutingStep[] = [];
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};

  for (const d of topology.devices) {
    distances[d.id] = Infinity;
    previous[d.id] = null;
  }

  const start = findDevice(topology, startLabel);
  if (!start) {
    steps.push(st(topology, distances, previous, `Router "${startLabel}" not found.`, 1, [], [], "error"));
    return steps;
  }

  distances[start.id] = 0;
  steps.push(st(topology, distances, previous, `Start from ${startLabel}. dist[${startLabel}] = 0, all others = infinity.`, 1, [start.id]));

  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const unvisited = new Set(topology.devices.map((d) => d.id));

  while (unvisited.size > 0) {
    let u: string | null = null;
    let minDist = Infinity;
    for (const id of unvisited) {
      if (distances[id] < minDist) { minDist = distances[id]; u = id; }
    }

    if (u === null || distances[u] === Infinity) {
      steps.push(st(topology, distances, previous, `Remaining routers are unreachable from ${startLabel}.`, 8, [], [], "default", [...visitedOrder]));
      break;
    }

    const uNode = topology.devices.find((d) => d.id === u)!;
    unvisited.delete(u);
    visited.add(u);
    visitedOrder.push(uNode.label);

    steps.push(st(topology, distances, previous, `Visit ${uNode.label} (dist=${distances[u]}). Relax its links.`, 3, [u], [], "found", [...visitedOrder]));

    const neighborLinks = topology.links.filter((l) => l.from === u || l.to === u);
    for (const link of neighborLinks) {
      const neighborId = link.from === u ? link.to : link.from;
      if (visited.has(neighborId)) continue;
      const neighbor = topology.devices.find((d) => d.id === neighborId)!;
      const weight = link.weight ?? 1;
      const newDist = distances[u] + weight;
      const lbl = linkLabel(topology, u, neighborId);

      steps.push(st(topology, distances, previous, `Relax ${uNode.label}→${neighbor.label} (w=${weight}): ${distances[u]}+${weight}=${newDist} vs current ${distances[neighborId] === Infinity ? "infinity" : distances[neighborId]}.`, 5, [u, neighborId], [lbl], "default", [...visitedOrder]));

      if (newDist < distances[neighborId]) {
        distances[neighborId] = newDist;
        previous[neighborId] = u;
        steps.push(st(topology, distances, previous, `Updated dist[${neighbor.label}] = ${newDist}, via ${uNode.label}.`, 6, [neighborId], [lbl], "insert", [...visitedOrder]));
      } else {
        steps.push(st(topology, distances, previous, `No improvement — dist[${neighbor.label}] stays ${distances[neighborId]}.`, 7, [neighborId], [lbl], "default", [...visitedOrder]));
      }
    }
  }

  const summary = topology.devices.map((d) => `${d.label}:${distances[d.id] === Infinity ? "∞" : distances[d.id]}`).join(", ");
  steps.push(st(topology, distances, previous, `Done. Shortest distances from ${startLabel}: ${summary}.`, 9, [], [], "found", [...visitedOrder]));
  return steps;
}

// Reconstruct the shortest path from a completed Dijkstra run's final step.
export function shortestPathTo(step: RoutingStep, topology: TopologyState, targetLabel: string): { devices: string[]; links: string[] } | null {
  const target = findDevice(topology, targetLabel);
  if (!target || step.distances[target.id] === undefined || step.distances[target.id] === Infinity) return null;

  const devices: string[] = [target.id];
  let cur: string | null = target.id;
  while (step.previous[cur!]) {
    const prev: string = step.previous[cur!]!;
    devices.unshift(prev);
    cur = prev;
  }

  const links: string[] = [];
  for (let i = 0; i < devices.length - 1; i++) {
    links.push(linkLabel(topology, devices[i], devices[i + 1]));
  }
  return { devices, links };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const ROUTING_CODE: string[] = [
  "function dijkstra(graph, start) {",
  "  dist[start] = 0; dist[rest] = Infinity;",
  "  while (unvisited not empty) {",
  "    u = closest unvisited router;",
  "    mark u visited;",
  "    for each neighbor v of u:",
  "      if dist[u] + weight(u,v) < dist[v]:",
  "        dist[v] = dist[u] + weight(u,v);",
  "        prev[v] = u;",
  "  }",
  "  // dist[] is now the routing table",
  "}",
];

export const ROUTING_ANNOTATIONS: Record<number, string> = {
  1: "Every router starts unreachable except the source itself — distance 0 to itself.",
  3: "Greedy choice: always process the closest unvisited router next. Safe because link weights are never negative.",
  6: "Relaxation: if reaching v through u beats the best known path to v, replace it.",
  9: "The finished dist[] table is exactly what a router's routing table represents — cost to reach every other router.",
};

export const ROUTING_COMPLEXITY = {
  time: "O(V²)",
  space: "O(V)",
  note: "Simple array scan for the minimum each round — O((V+E) log V) with a priority queue, not needed at this scale.",
};
