import { Step } from "./types";

// ─── Reliable Transmission: Go-Back-N vs Selective Repeat ───────────────────
// Not a rerun of TCP Data Transfer (stop-and-wait) or TCP Sliding Window
// (pipelining, but only ever shown succeeding) — this is the one comparison
// neither of those pages makes: when a pipelined segment IS lost, what does
// the receiver do with everything that arrives after it? The two textbook
// answers diverge completely, and that divergence is the whole point here.
// Real TCP is closer to a Selective-Repeat hybrid (via SACK), but these two
// are taught as pure, contrasting strategies, so they're modeled that way.

export type SegmentStatus = "pending" | "in-flight" | "lost" | "buffered" | "acked";

export interface TrackSegment {
  index: number;
  status: SegmentStatus;
}

export interface ReliableTransmissionStep extends Step {
  gbn: TrackSegment[];
  sr: TrackSegment[];
  gbnBase: number;
  srBase: number;
  gbnSent: number; // total segments transmitted so far, including retransmits
  srSent: number;
}

function st(
  gbn: TrackSegment[], sr: TrackSegment[], gbnBase: number, srBase: number, gbnSent: number, srSent: number,
  explanation: string, hl: number, phase?: string
): ReliableTransmissionStep {
  return {
    gbn: gbn.map((s) => ({ ...s })),
    sr: sr.map((s) => ({ ...s })),
    gbnBase, srBase, gbnSent, srSent,
    explanation, highlightLine: hl, phase,
  };
}

function fillWindow(track: TrackSegment[], base: number, windowSize: number, total: number): number {
  const end = Math.min(base + windowSize, total);
  let sent = 0;
  for (let i = base; i < end; i++) {
    if (track[i].status === "pending") { track[i].status = "in-flight"; sent++; }
  }
  return sent;
}

export function compareReliableTransmission(totalSegments: number, windowSize: number, lossIndex: number): ReliableTransmissionStep[] {
  const steps: ReliableTransmissionStep[] = [];

  const gbn: TrackSegment[] = Array.from({ length: totalSegments }, (_, i) => ({ index: i, status: "pending" }));
  const sr: TrackSegment[] = Array.from({ length: totalSegments }, (_, i) => ({ index: i, status: "pending" }));
  let gbnBase = 0, srBase = 0;
  let gbnSent = 0, srSent = 0;

  if (lossIndex < 0 || lossIndex >= Math.min(windowSize, totalSegments)) {
    steps.push(st(gbn, sr, gbnBase, srBase, 0, 0, `The lost segment must fall within the first window (segments 1-${Math.min(windowSize, totalSegments)}) to demonstrate the recovery difference.`, 1, "error"));
    return steps;
  }

  // --- Both send an identical first window ---
  gbnSent += fillWindow(gbn, gbnBase, windowSize, totalSegments);
  srSent += fillWindow(sr, srBase, windowSize, totalSegments);
  const windowEnd = Math.min(windowSize, totalSegments);
  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent, `Both protocols send an identical first window: segments 1-${windowEnd}. So far there's no difference between them at all.`, 1, "insert"));

  // --- Segment at lossIndex is lost, identically, in both ---
  gbn[lossIndex].status = "lost";
  sr[lossIndex].status = "lost";
  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent, `Segment ${lossIndex + 1} is lost in transit — this happens identically in both scenarios. Everything else in the window is still on its way.`, 2, "error"));

  // --- Segments before the loss arrive fine and get acked in both ---
  for (let i = gbnBase; i < lossIndex; i++) { gbn[i].status = "acked"; sr[i].status = "acked"; }
  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent, `Segments before the loss arrive in order and are acknowledged normally — no difference yet.`, 3, "found"));

  // --- Segments after the loss (already in flight): GBN discards, SR buffers ---
  for (let i = lossIndex + 1; i < windowEnd; i++) {
    gbn[i].status = "pending"; // discarded — receiver won't hold onto it, so it'll need a real resend
    sr[i].status = "buffered"; // held individually, ACKed on its own
  }
  const afterLoss = windowEnd - (lossIndex + 1);
  if (afterLoss > 0) {
    steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent,
      `Segments ${lossIndex + 2}-${windowEnd} still arrive at the receiver, out of order. Go-Back-N's receiver only accepts segments strictly in order — it discards all ${afterLoss} of them and will need them resent. Selective Repeat's receiver buffers each one individually and ACKs it right away.`,
      4, "insert"));
  }

  // --- Sender's timer for the lost segment fires: GBN resends the whole window from there, SR resends only the one segment ---
  const gbnResend = windowEnd - lossIndex;
  for (let i = lossIndex; i < windowEnd; i++) gbn[i].status = "in-flight";
  gbnSent += gbnResend;

  sr[lossIndex].status = "in-flight";
  srSent += 1;

  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent,
    `Timeout on segment ${lossIndex + 1}. Go-Back-N resends the entire window from there on — ${gbnResend} segments, including ones the receiver already had once and threw away. Selective Repeat resends only segment ${lossIndex + 1} — the one segment that actually needs it.`,
    5, "insert"));

  // --- Retransmission succeeds: GBN gets everything acked in order; SR's resend plus its buffered segments all deliver at once ---
  for (let i = lossIndex; i < windowEnd; i++) gbn[i].status = "acked";
  gbnBase = windowEnd;

  sr[lossIndex].status = "acked";
  for (let i = lossIndex + 1; i < windowEnd; i++) sr[i].status = "acked"; // already buffered — delivered immediately, no resend needed
  srBase = windowEnd;

  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent,
    `Retransmission arrives. Go-Back-N's whole resent window is now acknowledged. Selective Repeat's receiver combines the resent segment with what it already had buffered and delivers all of them at once — without the sender ever having to resend the segments that weren't actually lost.`,
    6, "found"));

  // --- Any remaining segments beyond the first window send normally, identically ---
  if (windowEnd < totalSegments) {
    const moreGbn = fillWindow(gbn, gbnBase, windowSize, totalSegments);
    const moreSr = fillWindow(sr, srBase, windowSize, totalSegments);
    gbnSent += moreGbn; srSent += moreSr;
    for (let i = gbnBase; i < totalSegments; i++) { gbn[i].status = "acked"; sr[i].status = "acked"; }
    gbnBase = totalSegments; srBase = totalSegments;
    steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent, `The remaining segments send and acknowledge normally — no more loss, so both protocols behave identically again.`, 7, "found"));
  }

  const diff = gbnSent - srSent;
  steps.push(st(gbn, sr, gbnBase, srBase, gbnSent, srSent,
    `Done. Go-Back-N transmitted ${gbnSent} segments total to deliver all ${totalSegments}; Selective Repeat transmitted ${srSent} — ${diff} fewer, entirely because it never re-sent data the receiver already had.`,
    8, "found"));

  return steps;
}

// ─── Pseudocode (two strategies, side by side) ──────────────────────────────

export const RELIABLE_TRANSMISSION_CODE: string[] = [
  "// Go-Back-N                                    // Selective Repeat",
  "on receive(segment N):",
  "  if (N == expectedNext)                        if (N in window)",
  "    deliver(N); expectedNext++;                    buffer(N); ACK(N);",
  "  else                                             if (N == expectedNext)",
  "    discard(N);  // out of order, drop it              deliver all consecutive buffered from N",
  "                                                       expectedNext advances past them",
  "",
  "on timeout(segment N):",
  "  resend(N .. windowEnd);   // the WHOLE window        resend(N);   // just the one segment",
];

export const RELIABLE_TRANSMISSION_ANNOTATIONS: Record<number, string> = {
  1: "Identical so far — the difference only shows up once something is actually lost.",
  2: "The loss itself is identical in both scenarios; what differs is entirely how each receiver reacts to what arrives afterward.",
  4: "This is the core tradeoff: Go-Back-N's receiver is simple (no buffering) but wasteful; Selective Repeat's receiver is more complex (must buffer and ACK individually) but efficient.",
  5: "Go-Back-N's sender doesn't know the later segments arrived — from its point of view, the whole window past the loss might as well be lost too.",
  6: "Selective Repeat never re-sends data across the wire twice — everything the receiver already safely has just gets delivered, no bandwidth wasted re-transmitting it.",
  8: "This gap is exactly why real TCP evolved toward something closer to Selective Repeat (via SACK) once large windows made Go-Back-N's waste too costly.",
};

export const RELIABLE_TRANSMISSION_COMPLEXITY = {
  time: "O(segments) for both, but Go-Back-N's constant factor grows with window size on loss",
  space: "O(1) for Go-Back-N's receiver, O(windowSize) for Selective Repeat's receiver",
  note: "The efficiency gap is exactly the cost of the receiver buffer: Go-Back-N avoids it and pays in wasted retransmissions; Selective Repeat pays in receiver memory and gets those retransmissions back.",
};
