import { TopologyState, cloneTopology } from "../topology-engine";
import { dijkstra, shortestPathTo, RoutingStep } from "../routing-engine";

// Parameter Lab: dijkstra() and shortestPathTo() (lib/routing-engine.ts) run
// completely unchanged, against a mutated copy of the same router mesh the
// Routing page already uses. The only new logic is applying a mutation to a
// cloned topology before handing it to the existing algorithm.

export type RoutingChange =
  | { type: "reweight"; linkId: string; newWeight: number }
  | { type: "failLink"; linkId: string }
  | { type: "failRouter"; deviceId: string };

function applyChange(topology: TopologyState, change: RoutingChange): TopologyState {
  const t = cloneTopology(topology);
  if (change.type === "reweight") {
    const link = t.links.find((l) => l.id === change.linkId);
    if (link) link.weight = change.newWeight;
  } else if (change.type === "failLink") {
    t.links = t.links.filter((l) => l.id !== change.linkId);
  } else {
    t.links = t.links.filter((l) => l.from !== change.deviceId && l.to !== change.deviceId);
    t.devices = t.devices.filter((d) => d.id !== change.deviceId);
    delete t.positions[change.deviceId];
  }
  return t;
}

function describeChange(topology: TopologyState, change: RoutingChange): string {
  if (change.type === "reweight") {
    const link = topology.links.find((l) => l.id === change.linkId);
    const a = topology.devices.find((d) => d.id === link?.from)?.label;
    const b = topology.devices.find((d) => d.id === link?.to)?.label;
    return `reweighting ${a}-${b} to ${change.newWeight}`;
  }
  if (change.type === "failLink") {
    const link = topology.links.find((l) => l.id === change.linkId);
    const a = topology.devices.find((d) => d.id === link?.from)?.label;
    const b = topology.devices.find((d) => d.id === link?.to)?.label;
    return `failing the ${a}-${b} link`;
  }
  const router = topology.devices.find((d) => d.id === change.deviceId)?.label;
  return `failing ${router}`;
}

export function simulateRoutingWhatIf(
  topology: TopologyState,
  change: RoutingChange,
  startLabel = "R-A",
  targetLabel = "R-E"
): RoutingStep[] {
  const baselineSteps = dijkstra(topology, startLabel);
  const baselineLast = baselineSteps[baselineSteps.length - 1];
  const baselinePath = shortestPathTo(baselineLast, topology, targetLabel);
  const targetDevice = topology.devices.find((d) => d.label === targetLabel);
  const baselineCost = targetDevice ? baselineLast.distances[targetDevice.id] : Infinity;

  const mutatedTopology = applyChange(topology, change);
  const mutatedSteps = dijkstra(mutatedTopology, startLabel);
  const mutatedLast = mutatedSteps[mutatedSteps.length - 1];
  const mutatedTargetDevice = mutatedTopology.devices.find((d) => d.label === targetLabel);
  const mutatedStartExists = mutatedTopology.devices.some((d) => d.label === startLabel);
  const mutatedPath = mutatedStartExists ? shortestPathTo(mutatedLast, mutatedTopology, targetLabel) : null;
  const mutatedCost = mutatedTargetDevice ? mutatedLast.distances[mutatedTargetDevice.id] : Infinity;

  const baselinePathStr = baselinePath
    ? baselinePath.devices.map((id) => topology.devices.find((d) => d.id === id)?.label).join(" -> ")
    : "unreachable";
  const mutatedPathStr = mutatedPath
    ? mutatedPath.devices.map((id) => mutatedTopology.devices.find((d) => d.id === id)?.label).join(" -> ")
    : "unreachable";

  const summary: RoutingStep = {
    ...mutatedLast,
    explanation: `Before ${describeChange(topology, change)}: ${startLabel} -> ${targetLabel} cost ${baselineCost === Infinity ? "unreachable" : baselineCost}, via ${baselinePathStr}. After: cost ${mutatedCost === Infinity ? "unreachable" : mutatedCost}, via ${mutatedPathStr}.`,
    highlightLine: 9,
    highlightDevices: mutatedPath ? mutatedPath.devices : [],
    highlightLinks: mutatedPath ? mutatedPath.links : [],
    phase: "found",
  };

  return [...mutatedSteps, summary];
}

export const ROUTING_WHATIF_CODE: string[] = [
  "function whatIf(topology, change, start, target) {",
  "  const baseline = dijkstra(topology, start);              // unmodified network",
  "  const mutated = applyChange(clone(topology), change);     // reweight / fail a link / fail a router",
  "  const after = dijkstra(mutated, start);                   // exact same algorithm, new input",
  "  compare(baseline.distances[target], after.distances[target]);",
  "}",
];

export const ROUTING_WHATIF_ANNOTATIONS: Record<number, string> = {
  9: "Nothing about Dijkstra changed here — only the graph it ran on did. Every cost/path difference you see is a direct consequence of the one edit.",
};

export const ROUTING_WHATIF_COMPLEXITY = {
  time: "O(V^2) per run — baseline and mutated each run once",
  space: "O(V)",
  note: "Real routers do exactly this after a link-state change: recompute shortest paths from scratch against the new topology, not patch the old result.",
};
