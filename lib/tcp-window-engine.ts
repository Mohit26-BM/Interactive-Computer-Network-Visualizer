import { Step } from "./types";

// ─── Sliding Window ──────────────────────────────────────────────────────────
// Not a packet-across-a-topology animation like most other engines here —
// the whole point of a window is *several segments in flight at once*, which
// doesn't fit a single packet dot. Instead this tracks the state of every
// segment (pending / in-flight / acked) and how the window of "allowed to be
// unacknowledged" segments slides forward as ACKs arrive.

export type SegmentStatus = "pending" | "in-flight" | "acked";

export interface WindowSegment {
  index: number; // 0-based
  status: SegmentStatus;
}

export interface TcpWindowStep extends Step {
  segments: WindowSegment[];
  windowStart: number; // index of the oldest unacknowledged segment
  windowSize: number;
}

function st(segments: WindowSegment[], windowStart: number, windowSize: number, explanation: string, hl: number, phase?: string): TcpWindowStep {
  return {
    segments: segments.map((s) => ({ ...s })),
    windowStart,
    windowSize,
    explanation,
    highlightLine: hl,
    phase,
  };
}

export function simulateSlidingWindow(totalSegments: number, windowSize: number): TcpWindowStep[] {
  const steps: TcpWindowStep[] = [];
  const segments: WindowSegment[] = Array.from({ length: totalSegments }, (_, i) => ({ index: i, status: "pending" }));

  let windowStart = 0;

  function sendUpToWindow() {
    const windowEnd = Math.min(windowStart + windowSize, totalSegments);
    for (let i = windowStart; i < windowEnd; i++) {
      if (segments[i].status === "pending") {
        segments[i] = { ...segments[i], status: "in-flight" };
      }
    }
  }

  sendUpToWindow();
  const firstBatch = segments.filter((s) => s.status === "in-flight").map((s) => s.index + 1).join(", ");
  steps.push(st(segments, windowStart, windowSize, `Window size ${windowSize}: segments ${firstBatch} all go out immediately, without waiting for any of them to be acknowledged first.`, 3, "insert"));

  while (windowStart < totalSegments) {
    segments[windowStart] = { ...segments[windowStart], status: "acked" };
    const acked = windowStart + 1;
    windowStart += 1;
    steps.push(st(segments, windowStart, windowSize, `ACK ${acked} arrives — segment ${acked} is confirmed. The window's trailing edge slides forward to segment ${windowStart + 1}.`, 5, "found"));

    const newlyEligible = windowStart + windowSize - 1;
    if (newlyEligible < totalSegments && segments[newlyEligible].status === "pending") {
      segments[newlyEligible] = { ...segments[newlyEligible], status: "in-flight" };
      steps.push(st(segments, windowStart, windowSize, `The window's leading edge advances too — segment ${newlyEligible + 1} can now be sent, since the window never grows past ${windowSize} unacknowledged segments.`, 7, "insert"));
    }
  }

  steps.push(st(segments, windowStart, windowSize, `Every segment has been sent and acknowledged. Compare this to stop-and-wait: only one round trip was needed per ${windowSize} segments, not per segment.`, 9, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_WINDOW_CODE: string[] = [
  "function slidingWindowSend(segments, windowSize) {",
  "  base = 0; nextToSend = 0;",
  "",
  "  while (base < segments.length) {",
  "    while (nextToSend < base + windowSize && nextToSend < segments.length) {",
  "      send(segments[nextToSend]);",
  "      nextToSend++;",
  "    }",
  "    on receive(ACK for segments[base]):",
  "      base++;   // window's trailing edge slides forward",
  "  }",
  "}",
];

export const TCP_WINDOW_ANNOTATIONS: Record<number, string> = {
  3: "\"In flight\" here means sent but not yet acknowledged — the window size is the maximum number of segments allowed in that state at once.",
  5: "An ACK only ever slides the trailing edge — it can't un-send something that's already in flight.",
  7: "The leading edge only advances as far as the window allows — sending everything at once regardless of window size would just be recreating no flow control at all.",
  9: "Bigger windows mean more throughput per round trip — but also more data that has to be retransmitted if something upstream drops it.",
};

export const TCP_WINDOW_COMPLEXITY = {
  time: "O(segments / windowSize) round trips",
  space: "O(windowSize)",
  note: "Compared to stop-and-wait's one round trip per segment, a window of size W cuts round trips by roughly a factor of W — at the cost of having to track W segments' worth of unacknowledged state.",
};
