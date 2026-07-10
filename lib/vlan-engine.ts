import { Step } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";

// VLANs split one physical switch into multiple separate broadcast domains.
// Membership is derived from the demo topology's fixed labels (PC-1/PC-2 →
// VLAN 10, PC-3/PC-4 → VLAN 20) rather than a field on DeviceNode — VLAN is
// the only page that cares, same call NAT made for the router's public IP.

export interface VlanInfo {
  id: number;
  name: string;
  subnet: string;
}

export const VLANS: VlanInfo[] = [
  { id: 10, name: "Sales", subnet: "10.0.10.0/24" },
  { id: 20, name: "Engineering", subnet: "10.0.20.0/24" },
];

export function vlanForLabel(label: string): VlanInfo | undefined {
  if (label === "PC-1" || label === "PC-2") return VLANS[0];
  if (label === "PC-3" || label === "PC-4") return VLANS[1];
  return undefined;
}

export type VlanOutcome = "delivered" | "blocked";

export interface VlanStep extends Step {
  activeLabel: string | null; // which device glows this step
  viaTrunk: boolean;          // whether the switch<->router trunk link glows
  outcome: VlanOutcome | null;
}

function st(explanation: string, hl: number, activeLabel: string | null, viaTrunk: boolean, phase?: string, outcome: VlanOutcome | null = null): VlanStep {
  return { explanation, highlightLine: hl, activeLabel, viaTrunk, outcome, phase };
}

export function sendFrame(
  topology: TopologyState,
  fromLabel: string,
  toLabel: string,
  interVlanRoutingEnabled: boolean
): VlanStep[] {
  const steps: VlanStep[] = [];
  const from = topology.devices.find((d: DeviceNode) => d.label === fromLabel);
  const to = topology.devices.find((d: DeviceNode) => d.label === toLabel);
  if (!from || !to) return [st(`Device not found.`, 1, null, false, "error")];

  const fromVlan = vlanForLabel(fromLabel);
  const toVlan = vlanForLabel(toLabel);

  steps.push(st(`${fromLabel} sends a frame. Its switch port is an access port assigned to VLAN ${fromVlan?.id} (${fromVlan?.name}) — the frame is implicitly tagged the moment it enters SW-1.`, 1, fromLabel, false));

  if (fromVlan?.id === toVlan?.id) {
    steps.push(st(`SW-1 looks up ${toLabel} in its VLAN ${fromVlan?.id} MAC table — same VLAN, so it forwards directly, exactly like ordinary switching.`, 2, "SW-1", false));
    steps.push(st(`Frame delivered to ${toLabel}. Nothing left VLAN ${fromVlan?.id} — the other VLAN never saw this traffic.`, 3, toLabel, false, "insert", "delivered"));
    return steps;
  }

  steps.push(st(`SW-1 looks up ${toLabel} — it belongs to VLAN ${toVlan?.id} (${toVlan?.name}), a different broadcast domain.`, 2, "SW-1", false));

  if (!interVlanRoutingEnabled) {
    steps.push(st(`No inter-VLAN routing is configured. A switch never bridges two VLANs on its own — the frame is dropped here.`, 3, "SW-1", false, "error", "blocked"));
    return steps;
  }

  steps.push(st(`SW-1 forwards the frame up the 802.1Q trunk to R-1 ("router-on-a-stick") — the only device attached to both VLANs.`, 3, "SW-1", true));
  steps.push(st(`R-1 routes between VLAN ${fromVlan?.id}'s subnet (${fromVlan?.subnet}) and VLAN ${toVlan?.id}'s subnet (${toVlan?.subnet}), then sends the frame back down the trunk re-tagged for VLAN ${toVlan?.id}.`, 4, "R-1", true));
  steps.push(st(`SW-1 forwards the re-tagged frame to ${toLabel}. Delivered — but only because a router explicitly connects the two VLANs.`, 5, toLabel, false, "insert", "delivered"));
  return steps;
}

export const VLAN_CODE: string[] = [
  "function sendFrame(from, to, interVlanRoutingEnabled) {",
  "  const fromVlan = vlanOf(from), toVlan = vlanOf(to);",
  "  if (fromVlan === toVlan) return switchForward(from, to); // same broadcast domain",
  "  if (!interVlanRoutingEnabled) return drop(); // switch alone never bridges VLANs",
  "  sendToTrunk(router);      // 802.1Q trunk carries every VLAN's tagged traffic",
  "  router.route(fromVlan.subnet, toVlan.subnet);",
  "  return deliver(to);       // re-tagged into the destination VLAN",
  "}",
];

export const VLAN_ANNOTATIONS: Record<number, string> = {
  1: "Access ports (where end hosts plug in) belong to exactly one VLAN and never see the 802.1Q tag — the switch adds and strips it internally.",
  2: "A VLAN is a separate broadcast domain layered on top of one physical switch — same wires, different logical networks.",
  3: "This is the entire point of VLANs: isolation is the default. Reaching across requires an explicit router.",
  4: "A trunk port carries traffic for multiple VLANs, each frame tagged with its VLAN ID — that's what 802.1Q defines.",
  5: "\"Router-on-a-stick\": one physical router interface, subdivided into per-VLAN sub-interfaces, doing the routing a switch structurally can't.",
};

export const VLAN_COMPLEXITY = {
  time: "O(1) same-VLAN, O(1) + router hop cross-VLAN",
  space: "O(V) — one VLAN tag per port",
  note: "The cost isn't computational — it's topological: without a router touching every VLAN, no path between them exists at all.",
};
