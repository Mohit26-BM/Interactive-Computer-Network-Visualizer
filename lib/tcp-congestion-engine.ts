import { Step } from "./types";
import { CUBIC_BETA, CubicState, newCubicState, cubicOnLoss, cubicGrow } from "./congestion-models";

export type CongestionAlgorithm = "reno" | "cubic";
// CUBIC grows with real time, so the round-based view assumes a fixed round trip of 100 ms.
const ASSUMED_RTT_SECONDS = 0.1;

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
  fastRetransmitRounds: number[] = [],
  algorithm: CongestionAlgorithm = "reno"
): CongestionRoundStep[] {
  const steps: CongestionRoundStep[] = [];
  const cubic: CubicState = newCubicState();
  const isCubic = algorithm === "cubic";
  let cwnd = 1;          // exact value (CUBIC grows by fractions); shown rounded
  let ssthresh = initialSsthresh;
  const shown = (v: number) => Math.max(1, Math.round(v));

  steps.push(st(0, cwnd, ssthresh, "slow-start", `Connection starts cautiously: cwnd=1, ssthresh=${ssthresh}. Every round below ssthresh doubles cwnd (slow start) — above it, ${isCubic ? "CUBIC grows cwnd along a cubic curve" : "cwnd only grows by 1 (congestion avoidance)"}.`, 2));

  for (let r = 1; r <= rounds; r++) {
    if (timeoutRounds.includes(r)) {
      if (isCubic) {
        cubicOnLoss(cwnd, cubic);
        ssthresh = Math.max(2, cwnd * CUBIC_BETA);
      } else {
        ssthresh = Math.max(Math.floor(cwnd / 2), 1);
      }
      cwnd = 1;
      steps.push(st(r, cwnd, shown(ssthresh), "timeout", `Round ${r}: retransmission timeout — no ACK arrived in time. This is the harsh case: ssthresh drops to ${shown(ssthresh)} (${isCubic ? "70%" : "half"} of where cwnd was) and cwnd collapses all the way back to 1.`, 10, "error"));
      continue;
    }
    if (fastRetransmitRounds.includes(r)) {
      const before = cwnd;
      if (isCubic) {
        const res = cubicOnLoss(cwnd, cubic);
        cwnd = res.cwnd; ssthresh = res.ssthresh;
      } else {
        ssthresh = Math.max(Math.floor(cwnd / 2), 1);
        cwnd = ssthresh;
      }
      steps.push(st(r, shown(cwnd), shown(ssthresh), "fast-retransmit", `Round ${r}: three duplicate ACKs — a segment was lost, but later ones are still arriving. Fast Retransmit resends it immediately; ${isCubic ? `CUBIC keeps 70% of the window (${shown(before)} -> ${shown(cwnd)}) and remembers ${shown(cubic.wMax)} as W_max` : `Fast Recovery only drops cwnd to the new ssthresh=${shown(ssthresh)}, not all the way to 1`}.`, 14, "error"));
      continue;
    }

    const inSlowStart = cwnd < ssthresh;
    if (inSlowStart) {
      cwnd = Math.min(cwnd * 2, Math.max(ssthresh, cwnd + 1));
      if (cwnd > ssthresh) cwnd = ssthresh;
    } else if (isCubic) {
      cwnd = cubicGrow(cwnd, cubic, ASSUMED_RTT_SECONDS);
    } else {
      cwnd = cwnd + 1;
    }
    const event: CongestionEvent = inSlowStart ? "slow-start" : "congestion-avoidance";
    const explanation = inSlowStart
      ? `Round ${r}: slow start — cwnd was below ssthresh (${shown(ssthresh)}), so it doubles to ${shown(cwnd)}.`
      : isCubic
        ? `Round ${r}: CUBIC congestion avoidance — cwnd follows C*(t-K)^3 + W_max, steep far from W_max (${shown(cubic.wMax)}), flat near it, then probing beyond: cwnd=${shown(cwnd)}.`
        : `Round ${r}: congestion avoidance — cwnd reached ssthresh (${shown(ssthresh)}), so growth switches from doubling to +1 per round: cwnd=${shown(cwnd)}.`;
    steps.push(st(r, shown(cwnd), shown(ssthresh), event, explanation, event === "slow-start" ? 4 : isCubic ? 7 : 6));
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
  "    cwnd = cwnd + 1;              // Reno avoidance: linear",
  "    cwnd = C*(t-K)^3 + wMax;      // CUBIC avoidance: cubic curve around the old maximum",
  "",
  "  on timeout (no ACK at all):",
  "    ssthresh = max(cwnd * beta, 2);   // Reno beta = 0.5, CUBIC beta = 0.7",
  "    cwnd = 1;                     // harsh — back to slow start",
  "",
  "  on 3 duplicate ACKs (fast retransmit):",
  "    wMax = cwnd; ssthresh = cwnd * beta;",
  "    cwnd = ssthresh;              // milder — straight into avoidance",
];

export const TCP_CONGESTION_ANNOTATIONS: Record<number, string> = {
  2: "ssthresh isn't a hard limit — it's the boundary between \"grow fast, we don't know the network's limit yet\" and \"grow carefully, we're close to it.\"",
  4: "Doubling every round is deliberately aggressive — the sender is still trying to discover how much the network can carry. (Real stacks start with 10 segments, not 1.)",
  6: "Reno: once past ssthresh, a lost segment would be expensive, so growth becomes cautious — +1 per round instead of x2. On a fast, long path this takes a very long time to refill the pipe.",
  7: "CUBIC (the default on Linux, Windows and macOS): after a loss it climbs back quickly, flattens near the old maximum W_max, then probes past it. Growth depends on elapsed time, not on how many ACKs arrive, so long-RTT flows are not starved.",
  10: "A timeout means the network gave no signal at all — TCP assumes the worst and starts over almost from scratch.",
  14: "Duplicate ACKs are actually good news in disguise — they prove the pipe still mostly works, so recovery doesn't need to be as drastic as a full timeout. CUBIC cuts less (30%) than Reno (50%).",
};

export const TCP_CONGESTION_COMPLEXITY = {
  time: "O(rounds)",
  space: "O(1)",
  note: "Only two numbers (cwnd, ssthresh) need to be tracked — the entire algorithm is a handful of comparisons per round, not per packet.",
};
