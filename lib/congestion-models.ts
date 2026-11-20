// Window-growth rules used by the TCP pages. Units are segments (packets) and seconds.
// Reno: +1 segment per round trip in congestion avoidance, halve on loss.
// CUBIC (RFC 9438, the default on Linux, Windows and macOS): the window follows a cubic curve
// anchored at the window size where the last loss happened (W_max), so it climbs back quickly,
// flattens out near W_max, then probes beyond it.

export const CUBIC_C = 0.4;     // aggressiveness constant (segments / s^3)
export const CUBIC_BETA = 0.7;  // multiplicative decrease: keep 70% of the window on loss (Reno keeps 50%)

export interface CubicState {
  wMax: number;      // window just before the last reduction (0 = no loss yet)
  elapsed: number;   // seconds since the last reduction
}

export const newCubicState = (): CubicState => ({ wMax: 0, elapsed: 0 });

/** Loss reaction. Returns the new window and ssthresh. Applies "fast convergence" when W_max keeps shrinking. */
export function cubicOnLoss(cwnd: number, st: CubicState): { cwnd: number; ssthresh: number } {
  st.wMax = cwnd < st.wMax ? (cwnd * (1 + CUBIC_BETA)) / 2 : cwnd;
  st.elapsed = 0;
  const next = Math.max(2, cwnd * CUBIC_BETA);
  return { cwnd: next, ssthresh: next };
}

/** Time (s) the cubic curve needs to climb back to W_max after a reduction. */
export const cubicK = (wMax: number): number => Math.cbrt((wMax * (1 - CUBIC_BETA)) / CUBIC_C);

/** One round trip of congestion avoidance. Mutates `st`; returns the new window. */
export function cubicGrow(cwnd: number, st: CubicState, rttSec: number): number {
  if (st.wMax === 0) st.wMax = cwnd; // entered avoidance without a loss: probe from here
  st.elapsed += rttSec;
  const t = st.elapsed;
  const wCubic = CUBIC_C * Math.pow(t - cubicK(st.wMax), 3) + st.wMax;
  // "TCP-friendly region": never grow slower than Reno would have
  const wEst = st.wMax * CUBIC_BETA + ((3 * (1 - CUBIC_BETA)) / (1 + CUBIC_BETA)) * (t / rttSec);
  const target = Math.max(wCubic, wEst);
  return Math.max(cwnd, Math.min(target, cwnd * 1.5)); // at most +50% per round trip
}
