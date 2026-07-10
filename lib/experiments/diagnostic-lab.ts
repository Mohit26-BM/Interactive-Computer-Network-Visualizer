import { Step } from "../types";
import { JOURNEY_STAGES } from "../browser-journey";

// Diagnostic Lab: a sibling to /browser-journey, not an edit to it — that
// page stays exactly what it is (a lightweight table of contents linking to
// nine already-built simulators, deliberately with no engine of its own).
// This file reuses its JOURNEY_STAGES data but adds the one thing that page
// deliberately doesn't have: a real branching failure path. Walk the same
// stage order; at the configured failure point, stop and explain why —
// nothing downstream of a real failure ever happens, so nothing downstream
// is simulated either.

export type FailureType = "dns-down" | "arp-no-reply" | "gateway-down" | "port-closed";

export interface DiagnosticStep extends Step {
  stageId: string | null;
  outcome: "ok" | "failed" | null;
}

interface FailureConfig {
  label: string;
  failStageId: string;
  failExplanation: string;
  suggestion: string;
}

const FAILURES: Record<FailureType, FailureConfig> = {
  "dns-down": {
    label: "DNS server unreachable",
    failStageId: "dns",
    failExplanation: "The resolver never replies to the query at all — not a cache miss, an actual timeout. Without an IP address for the destination, nothing downstream (ARP, TCP, HTTP) can even begin.",
    suggestion: "Check whether the configured resolver is reachable at all, and whether DHCP handed out a working DNS server address in the first place.",
  },
  "arp-no-reply": {
    label: "Default gateway unreachable (ARP)",
    failStageId: "arp",
    failExplanation: "DNS already resolved a destination IP, but the broadcast ARP request for the default gateway's MAC address gets no reply — the gateway isn't answering on this local segment at all.",
    suggestion: "Check the physical link to the gateway (cable, Wi-Fi association) and whether the gateway device is powered on and configured with the address this host expects.",
  },
  "gateway-down": {
    label: "No route beyond the gateway",
    failStageId: "ip",
    failExplanation: "ARP succeeded — the gateway does answer on the local segment — but it has no route to the destination network, so the packet can't be forwarded any further.",
    suggestion: "Check the gateway's own routing table and its uplink toward the rest of the network — the local segment is fine, the problem is one hop further out.",
  },
  "port-closed": {
    label: "Connection refused",
    failStageId: "tcp",
    failExplanation: "The IP packet reaches the server's network just fine, but the TCP handshake never completes — no SYN-ACK comes back. Either nothing is listening on that port, or a firewall/ACL is silently dropping the SYN.",
    suggestion: "Check whether the server process is actually running on that port, and check a Firewall/ACL rule list for anything that would deny this connection.",
  },
};

export const FAILURE_LABELS: Record<FailureType, string> = Object.fromEntries(
  Object.entries(FAILURES).map(([k, v]) => [k, v.label])
) as Record<FailureType, string>;

export function simulateDiagnostic(failureType: FailureType): DiagnosticStep[] {
  const config = FAILURES[failureType];
  const steps: DiagnosticStep[] = [];

  for (const stage of JOURNEY_STAGES) {
    if (stage.id === "render") break; // a failure scenario never reaches rendering

    if (stage.id === config.failStageId) {
      steps.push({
        explanation: `${stage.label} fails: ${config.failExplanation}`,
        highlightLine: 2, stageId: stage.id, outcome: "failed", phase: "error",
      });
      steps.push({
        explanation: `Suggested fix: ${config.suggestion}`,
        highlightLine: 3, stageId: null, outcome: null, phase: "error",
      });
      return steps;
    }

    steps.push({
      explanation: `${stage.label}: succeeds normally.`,
      highlightLine: 1, stageId: stage.id, outcome: "ok",
    });
  }

  return steps;
}

export const DIAGNOSTIC_CODE: string[] = [
  "function diagnose(stages, failureType) {",
  "  for (const stage of stages) {",
  "    if (stage.id === failureConfig[failureType].stage) {",
  "      explainFailure(stage, failureType);",
  "      suggestFix(failureType);",
  "      return; // nothing downstream of a real failure ever runs",
  "    }",
  "    markSucceeded(stage);",
  "  }",
  "}",
];

export const DIAGNOSTIC_ANNOTATIONS: Record<number, string> = {
  1: "Every stage before the failure point genuinely succeeds — a real diagnosis has to rule these out, not skip past them.",
  2: "This is the one piece of information a user actually has in real life: browsing stopped, with no visibility into which layer failed. The simulation makes that layer visible.",
  3: "A good diagnosis ends in an actionable next step, not just a root cause label.",
};

export const DIAGNOSTIC_COMPLEXITY = {
  time: "O(stages up to the failure point)",
  space: "O(1)",
  note: "Nothing after the failing stage is computed at all — a real network doesn't keep negotiating TLS after the TCP handshake never completed.",
};
