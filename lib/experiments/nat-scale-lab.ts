import { TopologyState } from "../topology-engine";
import { sendThroughNat, NatTable, NatStep } from "../nat-engine";
import { randomEphemeralPort } from "../ports-engine";

// Parameter Lab: same sendThroughNat logic as /nat, unchanged. Device 1 gets
// the full illustrative hop-by-hop trace (identical to the NAT page); devices
// 2..N are fast-forwarded — only their resulting table entry matters here,
// not another full replay of the same mechanism. This is "N devices behind
// one router" modeled as N distinct client ports on the one simulated PC,
// since PAT's uniqueness key is (private IP, private port) either way.

export interface NatScaleStep extends NatStep {
  deviceIndex: number; // which simulated device this step belongs to; deviceCount for the summary
}

export function simulateNatScale(topology: TopologyState, deviceCount: number): NatScaleStep[] {
  const steps: NatScaleStep[] = [];
  let table: NatTable = [];
  const usedPorts = new Set<number>();

  function freshPort(): number {
    let p = randomEphemeralPort();
    while (usedPorts.has(p)) p = randomEphemeralPort();
    usedPorts.add(p);
    return p;
  }

  const firstResult = sendThroughNat(topology, "PC-1", "R-1", "SRV-PUBLIC", table, freshPort());
  firstResult.steps.forEach((s) => steps.push({ ...s, deviceIndex: 0 }));
  table = firstResult.table;

  for (let i = 1; i < deviceCount; i++) {
    const result = sendThroughNat(topology, "PC-1", "R-1", "SRV-PUBLIC", table, freshPort());
    table = result.table;
  }

  const lastStep = steps[steps.length - 1];
  const ports = table.map((m) => m.insideGlobalPort);
  const minPort = Math.min(...ports);
  const maxPort = Math.max(...ports);

  steps.push({
    ...lastStep,
    natTable: table.map((m) => ({ ...m })),
    explanation: `${deviceCount} device${deviceCount === 1 ? "" : "s"} later: ${table.length} NAT table entries, all sharing the one public IP (${table[0]?.insideGlobalIp}), spread across public ports ${minPort}-${maxPort}.`,
    highlightLine: 4,
    phase: "found",
    deviceIndex: deviceCount,
  });

  return steps;
}

export const NAT_SCALE_CODE: string[] = [
  "function simulateScale(deviceCount) {",
  "  const table = [];",
  "  for (let i = 0; i < deviceCount; i++) {",
  "    const port = freshEphemeralPort();       // each simulated device gets its own private port",
  "    sendThroughNat(client, router, server, table, port); // exact same PAT logic as the NAT page",
  "  }",
  "  // table.length === deviceCount: one entry per device, one shared public IP",
  "}",
];

export const NAT_SCALE_ANNOTATIONS: Record<number, string> = {
  4: "This is the entire point of PAT: the public IP never runs out, because what actually multiplexes connections is the port number, not the address.",
};

export const NAT_SCALE_COMPLEXITY = {
  time: "O(deviceCount) NAT translations, each O(1)",
  space: "O(deviceCount) table entries",
  note: "The router's NAT table grows linearly with active connections, not with how much data any of them moves — this is what limits real routers (table size, not address space).",
};
