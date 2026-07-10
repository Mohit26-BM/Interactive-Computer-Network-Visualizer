import { TopologyState } from "../topology-engine";
import { arpResolve, ArpCache, ArpStep } from "../arp-engine";

// Parameter Lab: same ARP logic as /arp, unchanged — the only new thing is
// a simulated clock. Between attempts, simulated time passes; if it exceeds
// the configured cache timeout, the entry expires before the next attempt,
// forcing a fresh broadcast. Short timeout -> more broadcasts; long timeout
// -> the cache stays warm across more attempts. No new ARP logic at all.

export interface ArpTimeoutStep extends ArpStep {
  attemptIndex: number;
  broadcastOccurred: boolean | null;
}

function wrap(step: ArpStep, attemptIndex: number, broadcastOccurred: boolean | null): ArpTimeoutStep {
  return { ...step, attemptIndex, broadcastOccurred };
}

export function simulateArpOverTime(
  topology: TopologyState,
  fromLabel: string,
  toLabel: string,
  timeoutSeconds: number,
  attempts = 4,
  intervalSeconds = 10
): ArpTimeoutStep[] {
  const steps: ArpTimeoutStep[] = [];
  let cache: ArpCache = {};
  let broadcastCount = 0;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      const expires = intervalSeconds >= timeoutSeconds;
      if (expires) {
        const from = topology.devices.find((d) => d.label === fromLabel);
        const to = topology.devices.find((d) => d.label === toLabel);
        if (from && to && to.ip && cache[from.id]) {
          const newLocal = { ...cache[from.id] };
          delete newLocal[to.ip];
          cache = { ...cache, [from.id]: newLocal };
        }
      }
      steps.push(wrap(
        {
          topology, cache,
          explanation: `${intervalSeconds}s pass before the next attempt. ${expires
            ? `That's >= the ${timeoutSeconds}s cache timeout — the entry expires.`
            : `That's under the ${timeoutSeconds}s cache timeout — the entry is still valid.`}`,
          highlightLine: 1, highlightDevices: [], highlightLinks: [], phase: expires ? "error" : "default",
        },
        i, null
      ));
    }

    const result = arpResolve(topology, cache, fromLabel, toLabel);
    const broadcasted = result.steps.some((s) => s.explanation.startsWith("Not cached"));
    if (broadcasted) broadcastCount++;
    result.steps.forEach((s) => steps.push(wrap({ ...s, highlightLine: 2 }, i, broadcasted)));
    cache = result.cache;
  }

  steps.push(wrap(
    {
      topology, cache,
      explanation: `Over ${attempts} attempts spaced ${intervalSeconds}s apart with a ${timeoutSeconds}s cache timeout: ${broadcastCount} of ${attempts} attempts needed a fresh broadcast.`,
      highlightLine: 3, highlightDevices: [], highlightLinks: [], phase: "found",
    },
    attempts, null
  ));

  return steps;
}

export const ARP_TIMEOUT_CODE: string[] = [
  "function simulateOverTime(timeoutSeconds, attempts, intervalSeconds) {",
  "  for (let i = 0; i < attempts; i++) {",
  "    if (i > 0 && intervalSeconds >= timeoutSeconds) cache.expire(entry); // idle time passed",
  "    arpResolve(topology, cache, from, to);   // the exact same ARP logic as the ARP page",
  "  }",
  "  // tally how many attempts needed a fresh broadcast",
  "}",
];

export const ARP_TIMEOUT_ANNOTATIONS: Record<number, string> = {
  1: "Between attempts, simulated time passes — standing in for however long a real host waits before talking to the same destination again.",
  2: "This reuses ARP's real cache-hit / cache-miss logic completely unchanged — only whether the entry survived the wait is new.",
  3: "The timeout doesn't change ARP's cost per attempt — it changes how often the expensive (uncached) path gets paid at all.",
};

export const ARP_TIMEOUT_COMPLEXITY = {
  time: "O(attempts) resolves, each O(1) cached or O(hosts) uncached",
  space: "O(known hosts)",
  note: "A short timeout looks cheap per-attempt but is expensive in aggregate, because it forces the broadcast path far more often.",
};
