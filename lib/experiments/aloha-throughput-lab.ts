import { Step } from "../types";

// Analytical Lab: no simulation, no randomness — the actual closed-form
// throughput equations for ALOHA. S is normalized throughput (fraction of
// slots/time carrying a successful frame); G is offered load (average
// attempts per frame time, including retransmissions). Pure ALOHA's
// vulnerable period is two frame times (a collision can come from either
// side), Slotted ALOHA's is one — that factor of two in the exponent is the
// entire mathematical reason slotting doubles peak throughput.

export type AlohaMode = "pure" | "slotted";

export function pureAlohaThroughput(g: number): number {
  return g * Math.exp(-2 * g);
}

export function slottedAlohaThroughput(g: number): number {
  return g * Math.exp(-g);
}

export interface AlohaPoint {
  g: number;
  s: number;
}

export interface AlohaCurveStep extends Step {
  points: AlohaPoint[]; // cumulative — every point plotted so far, in order
  currentG: number;
  currentS: number;
}

export function computeAlohaCurve(mode: AlohaMode, maxG = 2.5, stepSize = 0.05): AlohaCurveStep[] {
  const formula = mode === "pure" ? pureAlohaThroughput : slottedAlohaThroughput;
  const steps: AlohaCurveStep[] = [];
  const points: AlohaPoint[] = [];

  const sampleCount = Math.round(maxG / stepSize) + 1;
  for (let i = 0; i < sampleCount; i++) {
    const g = i * stepSize;
    const s = formula(g);
    points.push({ g, s });
    const isFirst = i === 0;
    steps.push({
      points: points.map((p) => ({ ...p })),
      currentG: g,
      currentS: s,
      explanation: isFirst
        ? `At G=0 (no offered load), throughput S is 0 — nobody is sending, so nothing succeeds.`
        : `G=${g.toFixed(2)}: S=${s.toFixed(3)} — ${mode === "pure" ? "S = G·e^(-2G)" : "S = G·e^(-G)"}.`,
      highlightLine: 1,
      phase: undefined,
    });
  }

  const peak = points.reduce((best, p) => (p.s > best.s ? p : best), points[0]);
  const exactPeakG = mode === "pure" ? 0.5 : 1.0;
  const exactPeakS = mode === "pure" ? 1 / (2 * Math.E) : 1 / Math.E;
  steps.push({
    points: points.map((p) => ({ ...p })),
    currentG: peak.g,
    currentS: peak.s,
    explanation: `Peak throughput is at G≈${exactPeakG} — exactly S=${exactPeakS.toFixed(3)} (${mode === "pure" ? "1/(2e)" : "1/e"}). Past that point, more offered load only causes more collisions, and throughput falls even as everyone sends more.`,
    highlightLine: 2,
    phase: "found",
  });

  return steps;
}

export const ALOHA_THROUGHPUT_CODE: string[] = [
  "function pureAloha(G)    { return G * Math.exp(-2 * G); }  // vulnerable period = 2 frame times",
  "function slottedAloha(G) { return G * Math.exp(-1 * G); }  // vulnerable period = 1 frame time",
  "",
  "// Peak throughput: dS/dG = 0",
  "// Pure ALOHA:    G = 0.5,  S = 1/(2e) ~= 0.184",
  "// Slotted ALOHA: G = 1.0,  S = 1/e    ~= 0.368  (exactly double)",
];

export const ALOHA_THROUGHPUT_ANNOTATIONS: Record<number, string> = {
  1: "Every point on this curve is computed directly from the formula — there's no simulated randomness involved, unlike the discrete collision scenarios on the Medium Access Control page.",
  2: "This is why slotting exists: forcing transmissions to start only at slot boundaries halves the window during which two frames can overlap, which is exactly the factor of two between these two formulas.",
};

export const ALOHA_THROUGHPUT_COMPLEXITY = {
  time: "O(1) per sample point — a closed-form formula, not a simulation",
  space: "O(samples)",
  note: "Compare this to the Medium Access Control page's ALOHA demo, which shows one concrete collision scenario — this page shows the aggregate mathematical behavior across every possible offered load at once.",
};
