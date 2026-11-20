// A simple, honest link model: serialization delay (bandwidth), propagation delay, and a finite
// drop-tail queue. Two simulations are built on it:
//   1. simulateQueue    - packets arriving at a fixed rate into one link (open loop).
//   2. simulateTcpOnLink - a TCP sender (Reno or CUBIC) filling a bottleneck link (closed loop).

import { CubicState, newCubicState, cubicOnLoss, cubicGrow } from "./congestion-models";

export type Algorithm = "reno" | "cubic";

// ─── Parameters ──────────────────────────────────────────────────────────────

export interface QueueParams {
  bandwidthMbps: number;   // link speed
  delayMs: number;         // one-way propagation delay
  queuePackets: number;    // packets that may WAIT (the one being sent is extra)
  packetBytes: number;
  offeredMbps: number;     // sender's constant rate
  packets: number;         // how many to send
}

export interface TcpParams {
  algorithm: Algorithm;
  bandwidthMbps: number;
  rttMs: number;           // round trip with an empty queue
  queuePackets: number;
  mss: number;
  rounds: number;
  initialCwnd?: number;
}

export const DEFAULT_QUEUE: QueueParams = { bandwidthMbps: 10, delayMs: 20, queuePackets: 8, packetBytes: 1500, offeredMbps: 14, packets: 40 };
export const DEFAULT_TCP: TcpParams = { algorithm: "reno", bandwidthMbps: 50, rttMs: 40, queuePackets: 40, mss: 1460, rounds: 60 };

function check(name: string, v: number, min: number, max: number, integer = false): string | null {
  if (!Number.isFinite(v)) return `${name} must be a number`;
  if (integer && !Number.isInteger(v)) return `${name} must be a whole number`;
  if (v < min || v > max) return `${name} must be between ${min} and ${max}`;
  return null;
}

export function validateQueue(p: QueueParams): string | null {
  return check("Bandwidth", p.bandwidthMbps, 0.1, 10_000) ?? check("Delay", p.delayMs, 0, 1000) ??
    check("Queue size", p.queuePackets, 0, 10_000, true) ?? check("Packet size", p.packetBytes, 64, 9000, true) ??
    check("Offered rate", p.offeredMbps, 0.1, 100_000) ?? check("Packet count", p.packets, 1, 500, true);
}

export function validateTcp(p: TcpParams): string | null {
  return check("Bandwidth", p.bandwidthMbps, 0.1, 10_000) ?? check("RTT", p.rttMs, 1, 2000) ??
    check("Queue size", p.queuePackets, 0, 100_000, true) ?? check("MSS", p.mss, 88, 9000, true) ??
    check("Rounds", p.rounds, 1, 500, true);
}

// ─── 1. Queue simulation ─────────────────────────────────────────────────────

export interface PacketRecord {
  n: number;
  sentMs: number;          // when it reaches the queue
  outcome: "delivered" | "dropped";
  waiting: number;         // packets already waiting when it arrived
  queueDelayMs: number;
  serializeMs: number;
  arrivedMs: number | null; // when the last bit reaches the far end
  note: string;
}

export interface QueueSummary {
  delivered: number;
  dropped: number;
  lossPercent: number;
  avgDelayMs: number;      // end-to-end, delivered packets only
  maxQueue: number;
  goodputMbps: number;
  utilizationPercent: number;
  serializeMs: number;
}

export function simulateQueue(p: QueueParams): { records: PacketRecord[]; summary: QueueSummary } {
  const bad = validateQueue(p);
  if (bad) throw new Error(bad);
  const serializeMs = (p.packetBytes * 8) / (p.bandwidthMbps * 1000);   // ms to put one packet on the wire
  const gapMs = (p.packetBytes * 8) / (p.offeredMbps * 1000);           // ms between arrivals
  const finishTimes: number[] = [];                                       // departure times of accepted packets
  let busyUntil = 0;
  const records: PacketRecord[] = [];
  let maxQueue = 0;

  for (let n = 0; n < p.packets; n++) {
    const t = n * gapMs;
    const inSystem = finishTimes.filter((f) => f > t).length;           // being sent + waiting
    const waiting = Math.max(0, inSystem - (busyUntil > t ? 1 : 0));
    maxQueue = Math.max(maxQueue, waiting);
    if (waiting >= p.queuePackets) {
      records.push({ n: n + 1, sentMs: t, outcome: "dropped", waiting, queueDelayMs: 0, serializeMs, arrivedMs: null,
        note: `Queue full (${waiting}/${p.queuePackets} waiting) - drop-tail discards the arriving packet.` });
      continue;
    }
    const start = Math.max(t, busyUntil);
    const finish = start + serializeMs;
    busyUntil = finish;
    finishTimes.push(finish);
    records.push({ n: n + 1, sentMs: t, outcome: "delivered", waiting, queueDelayMs: start - t, serializeMs, arrivedMs: finish + p.delayMs,
      note: waiting === 0 && start === t ? "Link idle: sent immediately." : `Waits ${(start - t).toFixed(1)} ms behind ${waiting} packet${waiting === 1 ? "" : "s"}.` });
  }

  const ok = records.filter((r) => r.outcome === "delivered");
  const lastArrival = ok.length ? Math.max(...ok.map((r) => r.arrivedMs!)) : 0;
  const firstSend = ok.length ? ok[0].sentMs : 0;
  const span = Math.max(lastArrival - p.delayMs - firstSend, serializeMs);
  const goodputMbps = ok.length ? (ok.length * p.packetBytes * 8) / (span * 1000) : 0;
  return {
    records,
    summary: {
      delivered: ok.length,
      dropped: records.length - ok.length,
      lossPercent: (100 * (records.length - ok.length)) / records.length,
      avgDelayMs: ok.length ? ok.reduce((a, r) => a + (r.arrivedMs! - r.sentMs), 0) / ok.length : 0,
      maxQueue,
      goodputMbps: Math.min(goodputMbps, p.bandwidthMbps),
      utilizationPercent: Math.min(100, (100 * Math.min(goodputMbps, p.bandwidthMbps)) / p.bandwidthMbps),
      serializeMs,
    },
  };
}

// ─── 2. TCP over a bottleneck ───────────────────────────────────────────────

export type RoundEvent = "slow-start" | "avoidance" | "loss";

export interface RoundRecord {
  round: number;
  timeMs: number;
  cwnd: number;           // segments in flight this round
  queue: number;          // segments waiting at the bottleneck
  rttMs: number;          // RTT including queueing delay
  goodputMbps: number;
  lost: number;
  event: RoundEvent;
  explanation: string;
}

export interface TcpSummary {
  bdpPackets: number;
  capacityPackets: number;   // BDP + queue: the most that fits before loss
  lossEvents: number;
  avgGoodputMbps: number;
  utilizationPercent: number;
  avgRttMs: number;
}

export function simulateTcpOnLink(p: TcpParams): { rounds: RoundRecord[]; summary: TcpSummary } {
  const bad = validateTcp(p);
  if (bad) throw new Error(bad);
  const serviceMs = (p.mss * 8) / (p.bandwidthMbps * 1000);            // per-segment serialization
  const bdp = (p.bandwidthMbps * 1000 * p.rttMs) / (p.mss * 8);        // segments needed to fill the pipe
  const capacity = bdp + p.queuePackets;

  let cwnd = p.initialCwnd ?? 10;                                       // IW10, as in modern stacks
  let ssthresh = Infinity;
  let time = 0;
  const cubic: CubicState = newCubicState();
  const rounds: RoundRecord[] = [];
  let lossEvents = 0;

  for (let r = 1; r <= p.rounds; r++) {
    const inFlight = cwnd;
    const queue = Math.max(0, Math.min(inFlight - bdp, p.queuePackets));
    const rttMs = p.rttMs + queue * serviceMs;
    const lost = Math.max(0, inFlight - capacity);
    const delivered = inFlight - lost;
    const goodputMbps = Math.min(p.bandwidthMbps, (delivered * p.mss * 8) / (rttMs * 1000));
    const inSS = cwnd < ssthresh;
    let event: RoundEvent = inSS ? "slow-start" : "avoidance";
    let explanation: string;

    if (lost > 0) {
      event = "loss";
      lossEvents++;
      const before = cwnd;
      if (p.algorithm === "cubic") {
        const res = cubicOnLoss(cwnd, cubic);
        cwnd = res.cwnd; ssthresh = res.ssthresh;
      } else {
        ssthresh = Math.max(2, cwnd / 2);
        cwnd = ssthresh;
      }
      explanation = `Round ${r}: ${before.toFixed(0)} segments in flight but the path holds only ${capacity.toFixed(0)} (${bdp.toFixed(0)} on the wire + ${p.queuePackets} in the queue). The queue overflows, ${lost.toFixed(0)} segment${lost >= 1.5 ? "s are" : " is"} dropped, and ${p.algorithm === "cubic" ? "CUBIC cuts the window to 70%" : "Reno halves the window"} to ${cwnd.toFixed(0)}.`;
    } else if (inSS) {
      explanation = `Round ${r}: slow start - window ${cwnd.toFixed(0)}, doubling each round trip. Queue ${queue.toFixed(0)}, RTT ${rttMs.toFixed(0)} ms.`;
      cwnd = Math.min(cwnd * 2, Number.isFinite(ssthresh) ? Math.max(ssthresh, cwnd) : cwnd * 2);
    } else if (p.algorithm === "cubic") {
      explanation = `Round ${r}: CUBIC avoidance - window ${cwnd.toFixed(0)} follows a cubic curve toward and then past the old W_max. Queue ${queue.toFixed(0)}, RTT ${rttMs.toFixed(0)} ms.`;
      cwnd = cubicGrow(cwnd, cubic, rttMs / 1000);
    } else {
      explanation = `Round ${r}: Reno avoidance - window ${cwnd.toFixed(0)}, +1 segment per round trip. Queue ${queue.toFixed(0)}, RTT ${rttMs.toFixed(0)} ms.`;
      cwnd += 1;
    }

    rounds.push({ round: r, timeMs: time, cwnd: inFlight, queue, rttMs, goodputMbps, lost, event, explanation });
    time += rttMs;
  }

  const avg = rounds.reduce((a, x) => a + x.goodputMbps, 0) / rounds.length;
  return {
    rounds,
    summary: {
      bdpPackets: bdp,
      capacityPackets: capacity,
      lossEvents,
      avgGoodputMbps: avg,
      utilizationPercent: (100 * avg) / p.bandwidthMbps,
      avgRttMs: rounds.reduce((a, x) => a + x.rttMs, 0) / rounds.length,
    },
  };
}

// ─── Pseudocode and notes shown on the lab page ─────────────────────────────

export const LINK_QUEUE_CODE: string[] = [
  "serialize = packetBits / bandwidth;          // time to push one packet onto the wire",
  "for each arriving packet at time t:",
  "  waiting = packets already queued",
  "  if waiting >= queueSize: drop(packet)      // drop-tail",
  "  else:",
  "    start  = max(t, linkBusyUntil)           // wait for the packets ahead",
  "    linkBusyUntil = start + serialize",
  "    arrival = linkBusyUntil + propagation    // last bit reaches the far end",
];

export const LINK_TCP_CODE: string[] = [
  "bdp = bandwidth * rtt / mss;   capacity = bdp + queueSize;",
  "each round trip:",
  "  if cwnd > capacity: queue overflows -> loss",
  "      Reno:  ssthresh = cwnd / 2;  cwnd = ssthresh",
  "      CUBIC: wMax = cwnd;  cwnd = 0.7 * cwnd",
  "  else if cwnd < ssthresh: cwnd *= 2         // slow start",
  "  else Reno:  cwnd += 1",
  "  else CUBIC: cwnd = C*(t - K)^3 + wMax      // cubic curve around the old maximum",
  "rtt = baseRtt + queued * serialize           // a full queue inflates RTT (bufferbloat)",
];

export const LINK_ANNOTATIONS: Record<number, string> = {
  0: "Serialization delay is packet size divided by bandwidth: a 1500-byte packet takes 1.2 ms at 10 Mbit/s but only 12 microseconds at 1 Gbit/s.",
  3: "Real routers mostly drop the newest packet when the buffer is full (drop-tail). Some use AQM such as CoDel or RED to drop earlier and keep queues short.",
  5: "Queueing delay is the part of latency you can actually change: it grows whenever packets arrive faster than the link drains.",
  7: "Propagation delay depends on distance (about 5 microseconds per km in fibre), not on bandwidth - a faster link does not make the signal travel faster.",
};

export const LINK_NOTE =
  "A bigger buffer loses fewer packets but adds delay (bufferbloat); a smaller one keeps latency low but drops bursts. " +
  "Reno fills the buffer and halves on loss, while CUBIC climbs back along a cubic curve, which keeps long, fast paths busier.";
