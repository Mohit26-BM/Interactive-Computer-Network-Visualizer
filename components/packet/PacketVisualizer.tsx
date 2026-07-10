"use client";

import { TopologyState } from "@/lib/topology-engine";
import { PacketState } from "@/lib/types";

interface Props {
  topology: TopologyState;
  packet: PacketState;
  width?: number;
  height?: number;
}

const fateColor: Record<PacketState["fate"], string> = {
  "in-flight": "#6366f1",
  queued: "#a3a3a3",
  delivered: "#4ade80",
  dropped: "#f87171",
};

// Tailwind arbitrary-value filter classes per fate — avoids a dynamic inline
// style prop for the packet-dot glow.
const fateGlowClass: Record<PacketState["fate"], string> = {
  "in-flight": "filter-[drop-shadow(0_0_6px_#6366f190)]",
  queued: "filter-[drop-shadow(0_0_6px_#a3a3a390)]",
  delivered: "filter-[drop-shadow(0_0_6px_#4ade8090)]",
  dropped: "filter-[drop-shadow(0_0_6px_#f8717190)]",
};

export default function PacketVisualizer({ topology, packet, width = 640, height = 360 }: Props) {
  const { devices, links, positions } = topology;

  let dot: { x: number; y: number } | null = null;

  if (packet.currentLink) {
    const link = links.find((l) => l.id === packet.currentLink);
    if (link) {
      const fp = positions[link.from];
      const tp = positions[link.to];
      if (fp && tp) {
        dot = {
          x: fp.x + (tp.x - fp.x) * packet.progress,
          y: fp.y + (tp.y - fp.y) * packet.progress,
        };
      }
    }
  } else if (packet.atNode) {
    dot = positions[packet.atNode] ?? null;
  }

  const color = fateColor[packet.fate];

  return (
    <div className="flex justify-center py-4 overflow-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="max-w-full min-w-80">
        {links.map((l) => {
          const fp = positions[l.from];
          const tp = positions[l.to];
          if (!fp || !tp) return null;
          const isActive = packet.currentLink === l.id;
          return (
            <line
              key={l.id}
              x1={fp.x} y1={fp.y} x2={tp.x} y2={tp.y}
              stroke={isActive ? color : "#404040"}
              strokeWidth={isActive ? 2.5 : 2}
              className="transition-all duration-200"
            />
          );
        })}

        {devices.map((d) => {
          const pos = positions[d.id];
          if (!pos) return null;
          const isActive = packet.atNode === d.id;
          return (
            <g key={d.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                x={-22} y={-22} width={44} height={44} rx={9}
                fill={isActive ? color : "#171717"}
                fillOpacity={isActive ? 0.18 : 1}
                stroke={isActive ? color : "#525252"}
                strokeWidth={2}
                className="transition-all duration-300"
              />
              <text x={0} y={34} textAnchor="middle" fill="#a3a3a3" fontSize={11} fontFamily="monospace" fontWeight="bold">
                {d.label}
              </text>
            </g>
          );
        })}

        {dot && (
          <circle
            cx={dot.x} cy={dot.y} r={7}
            fill={color}
            className={`transition-[cx,cy,fill] duration-700 ease-linear ${fateGlowClass[packet.fate]}`}
          />
        )}
      </svg>
    </div>
  );
}
