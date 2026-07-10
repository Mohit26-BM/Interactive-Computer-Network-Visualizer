import { Step } from "./types";

// ─── Medium Access Control: ALOHA family and CSMA family ────────────────────
// Everything else in this project assumes switches — a collision-free,
// already-solved medium. This is the one page that goes one layer down:
// what happens when several stations share the SAME medium with no switch
// arbitrating at all, and the progressively smarter strategies (sensing,
// early collision detection, proactive avoidance) that were invented to
// make that workable. Same "watch the network misbehave" flavor as the
// congestion-control graph, one layer lower.
//
// Station attempt timings are hand-picked, not random — this project's
// engine convention is a precomputed, scrubbable Step[], so "random" backoff
// is represented as one fixed, illustrative outcome rather than true randomness.
// Outcomes (collision vs success) are always *derived* from the timing data
// via overlap detection, never hand-asserted, so they can be tested.

export type MacMode = "aloha" | "slotted-aloha" | "csma" | "csma-cd" | "csma-ca";

export type BarOutcome = "success" | "collision" | "aborted";

export interface TransmissionBar {
  station: number;
  start: number;
  end: number;
  outcome: BarOutcome;
}

export interface MacStep extends Step {
  mode: MacMode;
  bars: TransmissionBar[];
  attempts: number;
  successes: number;
  collisions: number;
}

interface Attempt {
  station: number;
  start: number;
  duration: number;
}

function rangesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && s2 < e1;
}

// Derives success/collision from the timing data — this is the one thing
// every mode shares, so it's never hand-asserted per scenario.
function resolveOutcomes(attempts: Attempt[]): TransmissionBar[] {
  return attempts.map((a) => {
    const end = a.start + a.duration;
    const collides = attempts.some((b) => b.station !== a.station && rangesOverlap(a.start, end, b.start, b.start + b.duration));
    return { station: a.station, start: a.start, end, outcome: collides ? "collision" : "success" };
  });
}

function st(mode: MacMode, bars: TransmissionBar[], explanation: string, hl: number, phase?: string): MacStep {
  const successes = bars.filter((b) => b.outcome === "success").length;
  const collisions = bars.filter((b) => b.outcome === "collision" || b.outcome === "aborted").length;
  return { mode, bars: bars.map((b) => ({ ...b })), attempts: bars.length, successes, collisions, explanation, highlightLine: hl, phase };
}

// ─── Pure ALOHA — transmit the instant you have data, no coordination at all ─

export function simulateAloha(): MacStep[] {
  const steps: MacStep[] = [];
  const attempts: Attempt[] = [
    { station: 1, start: 0, duration: 4 },
    { station: 2, start: 6, duration: 4 },
    { station: 3, start: 8, duration: 4 },
    { station: 4, start: 16, duration: 4 },
  ];
  const resolved = resolveOutcomes(attempts);
  const revealed: TransmissionBar[] = [];

  steps.push(st("aloha", [], "Pure ALOHA: every station transmits the instant it has data, with zero coordination and no sensing at all.", 1));
  revealed.push(resolved[0]);
  steps.push(st("aloha", revealed, "Station 1 has data and transmits immediately at t=0 — nobody else is on the medium, so it succeeds.", 2, "found"));
  revealed.push(resolved[1]);
  steps.push(st("aloha", revealed, "Station 2 transmits at t=6, completely unaware of what anyone else might be doing.", 2));
  revealed.push(resolved[2]);
  steps.push(st("aloha", revealed, "Station 3 transmits at t=8 — its signal overlaps Station 2's still-ongoing transmission. Neither has any way to know until it's too late: collision.", 3, "error"));
  revealed.push(resolved[3]);
  steps.push(st("aloha", revealed, "After a quiet stretch, Station 4 transmits alone at t=16 — success.", 2, "found"));
  steps.push(st("aloha", revealed, `Done. ${revealed.length} attempts, ${revealed.filter((b) => b.outcome === "success").length} succeeded, ${revealed.filter((b) => b.outcome === "collision").length} collided. With no coordination at all, pure ALOHA's peak efficiency famously tops out around 18%.`, 4, "found"));
  return steps;
}

// ─── Slotted ALOHA — transmissions may only start on a slot boundary ───────

export function simulateSlottedAloha(): MacStep[] {
  const steps: MacStep[] = [];
  const slotWidth = 4;
  const attempts: Attempt[] = [
    { station: 1, start: 0 * slotWidth, duration: slotWidth },
    { station: 2, start: 2 * slotWidth, duration: slotWidth },
    { station: 3, start: 2 * slotWidth, duration: slotWidth },
    { station: 4, start: 4 * slotWidth, duration: slotWidth },
  ];
  const resolved = resolveOutcomes(attempts);
  const revealed: TransmissionBar[] = [];

  steps.push(st("slotted-aloha", [], "Slotted ALOHA: time is divided into slots exactly one transmission wide — a station can only start at a slot boundary, never mid-slot.", 1));
  revealed.push(resolved[0]);
  steps.push(st("slotted-aloha", revealed, "Station 1 transmits in slot 0 — alone, success.", 2, "found"));
  revealed.push(resolved[1]);
  steps.push(st("slotted-aloha", revealed, "Station 2 transmits in slot 2.", 2));
  revealed.push(resolved[2]);
  steps.push(st("slotted-aloha", revealed, "Station 3 also picks slot 2 — the exact same slot as Station 2. Slotting can't prevent two stations choosing the same slot, only stop them from partially overlapping across a slot boundary.", 3, "error"));
  revealed.push(resolved[3]);
  steps.push(st("slotted-aloha", revealed, "Station 4 transmits alone in slot 4 — success.", 2, "found"));
  steps.push(st("slotted-aloha", revealed, `Done. ${revealed.length} attempts, ${revealed.filter((b) => b.outcome === "success").length} succeeded, ${revealed.filter((b) => b.outcome === "collision").length} collided. Restricting the vulnerable period to one slot roughly doubles pure ALOHA's throughput, to about 37%.`, 4, "found"));
  return steps;
}

// ─── CSMA — sense the channel before transmitting ───────────────────────────

export function simulateCsma(): MacStep[] {
  const steps: MacStep[] = [];
  const attempts: Attempt[] = [
    { station: 1, start: 0, duration: 4 },
    { station: 2, start: 4, duration: 4 },
    { station: 3, start: 12, duration: 4 },
    { station: 4, start: 12, duration: 4 },
  ];
  const resolved = resolveOutcomes(attempts);
  const revealed: TransmissionBar[] = [];

  steps.push(st("csma", [], "CSMA: every station listens to the medium first — if it's busy, wait; only transmit once it's sensed idle.", 1));
  revealed.push(resolved[0]);
  steps.push(st("csma", revealed, "Station 1 senses an idle channel at t=0 and transmits — success.", 2, "found"));
  steps.push(st("csma", revealed, "Station 2 wants to send at t=1, but senses the channel busy with Station 1's transmission — it defers instead of colliding.", 3));
  revealed.push(resolved[1]);
  steps.push(st("csma", revealed, "Once the channel goes idle at t=4, Station 2 sends — success. Sensing just prevented a collision that pure ALOHA would have had.", 2, "found"));
  revealed.push(resolved[2]);
  revealed.push(resolved[3]);
  steps.push(st("csma", revealed, "Stations 3 and 4 both want to send around t=12. Both sense the channel idle at essentially the same instant (propagation delay means neither has heard the other yet) and both transmit — collision, despite sensing.", 3, "error"));
  steps.push(st("csma", revealed, `Done. ${revealed.length} attempts, ${revealed.filter((b) => b.outcome === "success").length} succeeded, ${revealed.filter((b) => b.outcome === "collision").length} collided. Sensing eliminates the easy collisions but can't fix the case where two stations sense idle at nearly the same moment.`, 4, "found"));
  return steps;
}

// ─── CSMA/CD — sense before, and keep listening during, to abort early ──────

export function simulateCsmaCd(): MacStep[] {
  const steps: MacStep[] = [];
  const detectionDelay = 2;
  const intent: Attempt[] = [
    { station: 3, start: 0, duration: 4 },
    { station: 4, start: 0, duration: 4 },
  ];
  const intentResolved = resolveOutcomes(intent);
  // Colliding stations abort after detectionDelay instead of transmitting the
  // full duration — the entire point of CD.
  const aborted: TransmissionBar[] = intentResolved.map((b) => (
    b.outcome === "collision" ? { ...b, end: b.start + detectionDelay, outcome: "aborted" } : b
  ));

  const retries: Attempt[] = [
    { station: 3, start: 6, duration: 4 },
    { station: 4, start: 12, duration: 4 },
  ];
  const retriesResolved = resolveOutcomes(retries);

  const revealed: TransmissionBar[] = [];
  steps.push(st("csma-cd", [], "CSMA/CD adds one thing to CSMA: keep listening WHILE transmitting, and abort the instant a collision is detected instead of wasting the rest of the frame.", 1));
  revealed.push(aborted[0], aborted[1]);
  steps.push(st("csma-cd", revealed, "Stations 3 and 4 both sense the channel idle and start transmitting at t=0 — an unavoidable near-simultaneous collision, exactly like plain CSMA.", 2, "error"));
  steps.push(st("csma-cd", revealed, `But this time, both detect the collision after just ${detectionDelay} ticks (instead of the full 4) and abort immediately, sending a jam signal so every station knows to stop.`, 3, "found"));
  revealed.push(retriesResolved[0]);
  steps.push(st("csma-cd", revealed, "Station 3 backs off a random amount and retries at t=6 — alone, success.", 2, "found"));
  revealed.push(retriesResolved[1]);
  steps.push(st("csma-cd", revealed, "Station 4 picked a different random backoff and retries at t=12 — alone, success. Different random backoffs are exactly what keeps them from colliding again.", 2, "found"));
  const totalAttempts = revealed.length;
  const totalSuccess = revealed.filter((b) => b.outcome === "success").length;
  const totalAborted = revealed.filter((b) => b.outcome === "aborted").length;
  steps.push(st("csma-cd", revealed, `Done. ${totalAttempts} attempts, ${totalSuccess} succeeded, ${totalAborted} aborted early. Aborting after ${detectionDelay} ticks instead of 4 is exactly the bandwidth CSMA/CD saves over plain CSMA on every collision.`, 4, "found"));
  return steps;
}

// ─── CSMA/CA — avoid the collision in the first place with a random backoff ─

export function simulateCsmaCa(): MacStep[] {
  const steps: MacStep[] = [];
  const attempts: Attempt[] = [
    { station: 1, start: 2, duration: 4 },
    { station: 2, start: 8, duration: 4 },
  ];
  const resolved = resolveOutcomes(attempts);
  const revealed: TransmissionBar[] = [];

  steps.push(st("csma-ca", [], "CSMA/CA: even when the channel is sensed idle, wait a random backoff before actually transmitting — used where CSMA/CD's \"detect while sending\" isn't feasible, like Wi-Fi.", 1));
  steps.push(st("csma-ca", revealed, "Both Station 1 and Station 2 want to send at t=0 and both sense the channel idle — exactly the setup that collided in plain CSMA.", 2));
  revealed.push(resolved[0]);
  steps.push(st("csma-ca", revealed, "Station 1's random backoff expires first — it transmits at t=2 — success.", 2, "found"));
  revealed.push(resolved[1]);
  steps.push(st("csma-ca", revealed, "Station 2's backoff was longer — it transmits at t=8, well after Station 1 finished. The random backoff spread the two attempts apart before either one touched the wire.", 2, "found"));
  steps.push(st("csma-ca", revealed, `Done. ${revealed.length} attempts, ${revealed.filter((b) => b.outcome === "success").length} succeeded, ${revealed.filter((b) => b.outcome === "collision").length} collided. The exact same starting situation that collided under CSMA never even touches the wire at the same time here.`, 3, "found"));
  return steps;
}

export function simulateMac(mode: MacMode): MacStep[] {
  switch (mode) {
    case "aloha": return simulateAloha();
    case "slotted-aloha": return simulateSlottedAloha();
    case "csma": return simulateCsma();
    case "csma-cd": return simulateCsmaCd();
    case "csma-ca": return simulateCsmaCa();
  }
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const MAC_CODE: Record<MacMode, string[]> = {
  aloha: [
    "function onDataReady(station) {",
    "  transmit(station.frame);   // immediately, no matter what",
    "  // if another station's frame overlaps in time: both are garbled",
    "}",
  ],
  "slotted-aloha": [
    "function onSlotBoundary(station) {",
    "  if (station.hasData)",
    "    transmit(station.frame);  // only ever starts here, never mid-slot",
    "  // still collides if another station picks the same slot",
    "}",
  ],
  csma: [
    "function onDataReady(station) {",
    "  while (channel.busy) wait();     // carrier sense",
    "  transmit(station.frame);",
    "  // can still collide if two stations sense idle at nearly the same instant",
    "}",
  ],
  "csma-cd": [
    "function onDataReady(station) {",
    "  while (channel.busy) wait();",
    "  transmitting = true;",
    "  while (transmitting) {",
    "    if (channel.collisionDetected) {",
    "      sendJamSignal(); transmitting = false;",
    "      backoff(random()); retry();       // abort early, don't waste the frame",
    "    }",
    "  }",
    "}",
  ],
  "csma-ca": [
    "function onDataReady(station) {",
    "  while (channel.busy) wait();",
    "  backoff(random());     // wait even though the channel is already idle",
    "  if (!channel.busy) transmit(station.frame);   // else keep waiting/counting down",
    "}",
  ],
};

export const MAC_ANNOTATIONS: Record<MacMode, Record<number, string>> = {
  aloha: { 1: "No sensing, no slots, no coordination — the simplest possible strategy, and the one every later refinement improves on." },
  "slotted-aloha": { 1: "Halving the vulnerable window (only same-slot collisions are possible) is a cheap win for just requiring clock synchronization." },
  csma: { 1: "Carrier sense is the first real improvement: 'listen before you speak' — cheap, and it eliminates the easy collisions." },
  "csma-cd": { 4: "This loop is what makes Ethernet coax networks viable — detecting a collision early turns a wasted full frame into a wasted couple of ticks." },
  "csma-ca": { 2: "Wi-Fi can't easily listen while transmitting its own radio signal (it would just hear itself) — so CSMA/CA avoids the collision proactively instead of detecting it mid-flight." },
};

export const MAC_COMPLEXITY: Record<MacMode, { time: string; space: string; note: string }> = {
  aloha: { time: "O(1) per attempt", space: "O(1)", note: "Maximum theoretical throughput is about 18% — most of the medium's capacity is wasted to collisions and idle gaps." },
  "slotted-aloha": { time: "O(1) per attempt", space: "O(1)", note: "Roughly double pure ALOHA's throughput (~37%) just by aligning transmissions to slot boundaries." },
  csma: { time: "O(1) per attempt", space: "O(1)", note: "Much higher throughput than either ALOHA variant on typical LANs, since most collisions are simply avoided by sensing first." },
  "csma-cd": { time: "O(1) per attempt, but wasted time on collision is bounded by detection delay, not frame size", space: "O(1)", note: "The classic Ethernet strategy — collisions still happen, but they're cheap when they do." },
  "csma-ca": { time: "O(1) per attempt, plus a mandatory backoff even when idle", space: "O(1)", note: "Trades a small guaranteed delay (the backoff) for avoiding collisions a network that can't detect them mid-flight would otherwise suffer." },
};
