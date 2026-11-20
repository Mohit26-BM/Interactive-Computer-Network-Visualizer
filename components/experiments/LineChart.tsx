"use client";

// A small multi-series SVG line chart (no charting library).

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

interface Props {
  series: Series[];
  xLabel: string;
  yLabel: string;
  hLine?: { y: number; label: string };
  cursor?: { x: number; y: number; color?: string };
  height?: number;
}

const WIDTH = 520;
const PAD_L = 44;
const PAD_B = 30;
const PAD_T = 12;
const PAD_R = 12;

export default function LineChart({ series, xLabel, yLabel, hLine, cursor, height = 220 }: Props) {
  const all = series.flatMap((s) => s.points);
  const maxX = Math.max(1, ...all.map((p) => p.x));
  const maxY = Math.max(1, hLine?.y ?? 0, ...all.map((p) => p.y)) * 1.08;
  const sx = (x: number) => PAD_L + (x / maxX) * (WIDTH - PAD_L - PAD_R);
  const sy = (y: number) => height - PAD_B - (y / maxY) * (height - PAD_B - PAD_T);
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto bg-neutral-900/60 border border-neutral-800 rounded-lg" role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={WIDTH - PAD_R} y1={sy(maxY * f / 1.08)} y2={sy(maxY * f / 1.08)} stroke="#262626" />
            <text x={PAD_L - 6} y={sy(maxY * f / 1.08) + 3} textAnchor="end" fontSize={9} fill="#737373" fontFamily="monospace">{fmt(maxY * f / 1.08)}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={WIDTH - PAD_R} y1={height - PAD_B} y2={height - PAD_B} stroke="#525252" />
        <text x={PAD_L} y={height - 8} fontSize={9} fill="#737373" fontFamily="monospace">0</text>
        <text x={WIDTH - PAD_R} y={height - 8} fontSize={9} fill="#737373" textAnchor="end" fontFamily="monospace">{fmt(maxX)}</text>
        <text x={(PAD_L + WIDTH) / 2} y={height - 8} fontSize={9} fill="#a3a3a3" textAnchor="middle">{xLabel}</text>
        <text x={10} y={PAD_T + 6} fontSize={9} fill="#a3a3a3" transform={`rotate(-90 10 ${height / 2})`} textAnchor="middle" >{yLabel}</text>
        {hLine && (
          <g>
            <line x1={PAD_L} x2={WIDTH - PAD_R} y1={sy(hLine.y)} y2={sy(hLine.y)} stroke="#f87171" strokeDasharray="4 3" />
            <text x={WIDTH - PAD_R - 2} y={sy(hLine.y) - 3} fontSize={9} fill="#f87171" textAnchor="end">{hLine.label}</text>
          </g>
        )}
        {series.map((s) => (
          <path key={s.name} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 3" : undefined}
            d={s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ")} />
        ))}
        {cursor && <circle cx={sx(cursor.x)} cy={sy(cursor.y)} r={5} fill={cursor.color ?? "#fafafa"} stroke="#0a0a0a" strokeWidth={1.5} />}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-neutral-400">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}
