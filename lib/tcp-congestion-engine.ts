import { Step } from "./types";

// ─── TCP Congestion Control ──────────────────────────────────────────────────
// Like Sliding Window, this doesn't animate a packet across a topology — the
// thing worth watching is a number (cwnd) changing round by round, so each
// round IS a Step and the graph is just a derived view over the rounds seen
// so far. No new timer/kernel machinery: this is still a precomputed,
// scrubbable Step[], exactly like everything else in this project.

export type CongestionEvent = "slow-start" | "congestion-avoidance" | "timeout" | "fast-retransmit";

export interface CongestionRoundStep extends Step {
  round: number;
  cwnd: number;
  ssthresh: number;
  event: CongestionEvent;
}

function st(round: number, cwnd: number, ssthresh: number, event: CongestionEvent, explanation: string, hl: number, phase?: string): CongestionRoundStep {
  return { round, cwnd, ssthresh, event, explanation, highlightLine: hl, phase };
}

// timeoutRounds: a full retransmission timeout — the harsh reset (cwnd -> 1).
// fastRetransmitRounds: three duplicate ACKs — a milder reset (cwnd -> new
// ssthresh, not all the way down to 1), since the ACKs still arriving prove
// segments *are* getting through, just not one of them.
export function simulateCongestionControl(
  rounds: number,
  initialSsthresh: number,
  timeoutRounds: number[] = [],
  fastRetransmitRounds: number[] = []
): CongestionRoundStep[] {
  const steps: CongestionRoundStep[] = [];
  let cwnd = 1;
  let ssthresh = initialSsthresh;

  steps.push(st(0, cwnd, ssthresh, "slow-start", `Connection starts cautiously: cwnd=1, ssthresh=${ssthresh}. Every round below ssthresh doubles cwnd (slow start) — above it, cwnd only grows by 1 (congestion avoidance).`, 2));

  for (let r = 1; r <= rounds; r++) {
    if (timeoutRounds.includes(r)) {
      ssthresh = Math.max(Math.floor(cwnd / 2), 1);
      cwnd = 1;
      steps.push(st(r, cwnd, ssthresh, "timeout", `Round ${r}: retransmission timeout — no ACK arrived in time. This is the harsh case: ssthresh drops to ${ssthresh} (half of where cwnd was) and cwnd collapses all the way back to 1.`, 8, "error"));
      continue;
    }
    if (fastRetransmitRounds.includes(r)) {
      ssthresh = Math.max(Math.floor(cwnd / 2), 1);
      cwnd = ssthresh;
      steps.push(st(r, cwnd, ssthresh, "fast-retransmit", `Round ${r}: three duplicate ACKs — a segment was lost, but later ones are still arriving. Fast Retransmit resends it immediately; Fast Recovery only drops cwnd to the new ssthresh=${ssthresh}, not all the way to 1.`, 10, "error"));
      continue;
    }

    const inSlowStart = cwnd < ssthresh;
    cwnd = inSlowStart ? cwnd * 2 : cwnd + 1;
    const event: CongestionEvent = inSlowStart ? "slow-start" : "congestion-avoidance";
    const explanation = inSlowStart
      ? `Round ${r}: slow start — cwnd was below ssthresh (${ssthresh}), so it doubles to ${cwnd}.`
      : `Round ${r}: congestion avoidance — cwnd reached ssthresh (${ssthresh}), so growth switches from doubling to +1 per round: cwnd=${cwnd}.`;
    steps.push(st(r, cwnd, ssthresh, event, explanation, event === "slow-start" ? 4 : 6));
  }

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_CONGESTION_CODE: string[] = [
  "cwnd = 1; ssthresh = initialSsthresh;",
  "",
  "on each round:",
  "  if (cwnd < ssthresh)",
  "    cwnd = cwnd * 2;              // slow start: exponential",
  "  else",
  "    cwnd = cwnd + 1;              // congestion avoidance: linear",
  "",
  "  on timeout (no ACK at all):",
  "    ssthresh = max(cwnd / 2, 1);",
  "    cwnd = 1;                     // harsh — back to slow start",
  "",
  "  on 3 duplicate ACKs (fast retransmit):",
  "    ssthresh = max(cwnd / 2, 1);",
  "    cwnd = ssthresh;              // milder — straight into avoidance",
];

export const TCP_CONGESTION_ANNOTATIONS: Record<number, string> = {
  2: "ssthresh isn't a hard limit — it's the boundary between \"grow fast, we don't know the network's limit yet\" and \"grow carefully, we're close to it.\"",
  4: "Doubling every round is deliberately aggressive — the sender is still trying to discover how much the network can carry.",
  6: "Once past ssthresh, a lost segment would be expensive, so growth becomes cautious — +1 per round instead of x2.",
  8: "A timeout means the network gave no signal at all — TCP assumes the worst and starts over almost from scratch.",
  10: "Duplicate ACKs are actually good news in disguise — they prove the pipe still mostly works, so recovery doesn't need to be as drastic as a full timeout.",
};

export const TCP_CONGESTION_COMPLEXITY = {
  time: "O(rounds)",
  space: "O(1)",
  note: "Only two numbers (cwnd, ssthresh) need to be tracked — the entire algorithm is a handful of comparisons per round, not per packet.",
};
