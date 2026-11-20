"use client";

// A plain SVG line chart — no charting library. Deliberately small and
// specific to "G on x, S on y" rather than a generic reusable chart, since
// this is the first Analytical Lab; if a second one needs the same shape,
// generalize then.

interface Point {
  g: number;
  s: number;
}

interface Props {
  points: Point[];
  maxG: number;
  maxS: number;
  currentG?: number;
  currentS?: number;
}

const WIDTH = 500;
const HEIGHT = 260;
const PAD = 36;

export default function ThroughputChart({ points, maxG, maxS, currentG, currentS }: Props) {
  const xScale = (g: number) => PAD + (g / maxG) * (WIDTH - PAD * 1.5);
  const yScale = (s: number) => HEIGHT - PAD - (s / maxS) * (HEIGHT - PAD * 1.5);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.g).toFixed(1)} ${yScale(p.s).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full max-w-xl mx-auto">
      <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - 10} y2={HEIGHT - PAD} stroke="#2a3547" strokeWidth={1} />
      <line x1={PAD} y1={PAD - 10} x2={PAD} y2={HEIGHT - PAD} stroke="#2a3547" strokeWidth={1} />
      <text x={WIDTH / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill="#7d8aa0" fontFamily="monospace">Offered load (G)</text>
      <text x={12} y={HEIGHT / 2} textAnchor="middle" fontSize={11} fill="#7d8aa0" fontFamily="monospace" transform={`rotate(-90 12 ${HEIGHT / 2})`}>Throughput (S)</text>

      {points.length > 1 && <path d={path} fill="none" stroke="#ffc266" strokeWidth={2} />}

      {currentG !== undefined && currentS !== undefined && (
        <circle cx={xScale(currentG)} cy={yScale(currentS)} r={4.5} fill="#ffe3b8" stroke="#ffc266" strokeWidth={1.5} />
      )}
    </svg>
  );
}
