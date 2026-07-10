import { Step } from "./types";

// ─── Flow Control (receiver window, rwnd) ───────────────────────────────────
// Deliberately kept separate from Congestion Control: this is about ONE
// receiver's buffer filling up because the application reads it slowly — not
// about the network being congested. Same shape of problem (the sender has
// to slow down), completely different cause, which is exactly the confusion
// this page exists to untangle.

export interface FlowControlStep extends Step {
  bufferFilled: number;
  bufferCapacity: number;
  advertisedWindow: number;
  segmentsSent: number;
  totalSegments: number;
  event: "send" | "app-read" | "zero-window" | "window-update" | "done";
}

function st(
  bufferFilled: number, bufferCapacity: number, segmentsSent: number, totalSegments: number,
  event: FlowControlStep["event"], explanation: string, hl: number, phase?: string
): FlowControlStep {
  return {
    bufferFilled, bufferCapacity,
    advertisedWindow: bufferCapacity - bufferFilled,
    segmentsSent, totalSegments,
    event,
    explanation,
    highlightLine: hl,
    phase,
  };
}

// The receiver's application reads `appReadRate` units off the buffer every
// `readEvery` segments — a stand-in for "the receiving application is slow."
export function simulateFlowControl(
  bufferCapacity: number,
  totalSegments: number,
  appReadRate: number,
  readEvery: number
): FlowControlStep[] {
  const steps: FlowControlStep[] = [];
  let filled = 0;
  let sent = 0;

  steps.push(st(filled, bufferCapacity, sent, totalSegments, "send", `Receiver advertises an initial window of ${bufferCapacity} — its buffer is empty, so the sender can send that many segments before pausing.`, 1));

  while (sent < totalSegments) {
    const rwnd = bufferCapacity - filled;

    if (rwnd === 0) {
      steps.push(st(filled, bufferCapacity, sent, totalSegments, "zero-window", `Zero window! The receiver's buffer is completely full — it advertises rwnd=0 and the sender must stop sending entirely, no matter how much data is left.`, 4, "error"));
      const read = Math.max(1, Math.min(appReadRate, filled));
      filled -= read;
      steps.push(st(filled, bufferCapacity, sent, totalSegments, "window-update", `The application finally reads ${read} unit(s) off the buffer. The receiver sends a window update: rwnd is now ${bufferCapacity - filled} — the sender can resume.`, 6, "insert"));
      continue;
    }

    filled += 1;
    sent += 1;
    steps.push(st(filled, bufferCapacity, sent, totalSegments, "send", `Sender transmits segment ${sent}. Receiver's buffer fills to ${filled}/${bufferCapacity} — advertised window shrinks to ${bufferCapacity - filled}.`, 2));

    if (sent % readEvery === 0 && filled > 0) {
      const read = Math.min(appReadRate, filled);
      filled -= read;
      steps.push(st(filled, bufferCapacity, sent, totalSegments, "app-read", `The application reads ${read} unit(s) off the buffer in the background. Advertised window grows back to ${bufferCapacity - filled}.`, 3));
    }
  }

  steps.push(st(filled, bufferCapacity, sent, totalSegments, "done", `All ${totalSegments} segments sent. Flow control never touched how fast the network could go — only how much the receiver could hold.`, 8, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TCP_FLOW_CONTROL_CODE: string[] = [
  "function onEachSegment(sender, receiver) {",
  "  if (receiver.advertisedWindow === 0) {",
  "    sender.pause();                 // zero window — stop completely",
  "    wait for receiver.windowUpdate();",
  "  }",
  "",
  "  receiver.buffer.push(segment);    // app hasn't read it yet",
  "  receiver.advertisedWindow = receiver.bufferCapacity - receiver.buffer.size;",
  "",
  "  // meanwhile, independently:",
  "  application.read(receiver.buffer);  // however fast the app actually is",
  "}",
];

export const TCP_FLOW_CONTROL_ANNOTATIONS: Record<number, string> = {
  1: "rwnd is about the receiver's buffer, not the network — this is why it's a completely different mechanism from congestion control.",
  2: "The buffer fills because data arrives faster than the application reads it — nothing here implies the network itself is struggling.",
  3: "The application draining the buffer is what frees up window — flow control is really just \"don't send more than the receiver can hold onto.\"",
  4: "A zero window is a hard stop — unlike congestion control's gradual slowdown, the sender can't send anything at all until it hears otherwise.",
  6: "A window update is the receiver proactively saying \"I have room again\" — without it, the sender would have no way to know it can resume.",
};

export const TCP_FLOW_CONTROL_COMPLEXITY = {
  time: "O(segments)",
  space: "O(1)",
  note: "Tracking one number (the advertised window) is enough — no per-packet loss detection or backoff math, which is what makes this simpler than congestion control.",
};
