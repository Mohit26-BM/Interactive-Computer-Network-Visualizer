"use client";
import { useEffect, useState } from "react";

// A scripted, looping preview — same technique as a hard-coded demo reel:
// fixed frame data + a self-rescheduling timeout. It does not call any real
// engine; it exists purely to set the scene on the home page.

const VBW = 440;
const VBH = 170;
const NODE_Y = 90;

const NODES = [
  { label: "PC", x: 26 },
  { label: "Switch", x: 130 },
  { label: "Router", x: 234 },
  { label: "DNS", x: 338 },
  { label: "Server", x: 414 },
] as const;

interface Frame {
  caption: string;
  layer: string;
  dotX: number | null;
  activeNode: number | null;
  pause?: boolean;
}

function travelFrames(fromIdx: number, toIdx: number, layer: string, caption: string, count = 4): Frame[] {
  const fromX = NODES[fromIdx].x;
  const toX = NODES[toIdx].x;
  const frames: Frame[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    frames.push({ caption, layer, dotX: fromX + (toX - fromX) * t, activeNode: null });
  }
  return frames;
}

const FRAMES: Frame[] = [
  { caption: "Tracing a request to google.com", layer: "Application", dotX: null, activeNode: 0, pause: true },
  { caption: "Wrapping the request — HTTP, then TCP, then IP, then Ethernet", layer: "Encapsulation", dotX: null, activeNode: 0 },
  ...travelFrames(0, 1, "Data Link", "Leaving the PC, forwarded by the switch"),
  { caption: "Switch reads the destination MAC address", layer: "Data Link", dotX: NODES[1].x, activeNode: 1 },
  ...travelFrames(1, 2, "Network", "Router reads the destination IP address"),
  { caption: "Router decrements TTL and forwards toward the destination", layer: "Network", dotX: NODES[2].x, activeNode: 2 },
  ...travelFrames(2, 3, "Application", "First, resolve the name — a quick detour to DNS"),
  { caption: "DNS resolves \"google.com\" to an IP address", layer: "Application", dotX: NODES[3].x, activeNode: 3, pause: true },
  ...travelFrames(3, 4, "Application", "Now request the page from the actual server"),
  { caption: "Server receives the HTTP request", layer: "Application", dotX: NODES[4].x, activeNode: 4 },
  { caption: "Server sends the response back the same way", layer: "Application", dotX: null, activeNode: 4, pause: true },
  { caption: "Response arrives — the browser renders the page", layer: "Application", dotX: null, activeNode: 0, pause: true },
  { caption: "Restarting…", layer: "Application", dotX: null, activeNode: null, pause: true },
];

export default function JourneyHero() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const frame = FRAMES[idx];
    const t = setTimeout(() => setIdx((p) => (p + 1) % FRAMES.length), frame.pause ? 1300 : 320);
    return () => clearTimeout(t);
  }, [idx]);

  const frame = FRAMES[idx];

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl overflow-hidden w-full shadow-md shadow-black/20 motion-safe:animate-[pulse-glow_4s_ease-in-out_infinite]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-neutral-950/60">
        <span className="text-xs text-neutral-400 font-medium tracking-wide">The Journey of a Packet</span>
        <span className="text-[10px] text-indigo-400/70 font-mono uppercase tracking-wider">{frame.layer}</span>
      </div>

      <div className="px-4 pt-4 pb-1">
        <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full max-h-48" aria-label="Packet journey preview">
          <line x1={NODES[0].x} y1={NODE_Y} x2={NODES[4].x} y2={NODE_Y} stroke="#262626" strokeWidth={2} />

          {NODES.map((n, i) => {
            const active = frame.activeNode === i;
            return (
              <g key={n.label}>
                <circle
                  cx={n.x} cy={NODE_Y} r={16}
                  fill={active ? "#1e1b4b" : "#171717"}
                  stroke={active ? "#6366f1" : "#404040"}
                  strokeWidth={2}
                  className={`transition-all duration-300 ease-out ${active ? "filter-[drop-shadow(0_0_6px_#6366f180)]" : ""}`}
                />
                <text x={n.x} y={NODE_Y + 32} textAnchor="middle" fill={active ? "#a5b4fc" : "#737373"} fontSize={9.5} fontFamily="monospace" fontWeight="bold">
                  {n.label}
                </text>
              </g>
            );
          })}

          {frame.dotX !== null && (
            <circle
              cx={frame.dotX} cy={NODE_Y} r={5.5} fill="#6366f1"
              className="filter-[drop-shadow(0_0_6px_#6366f190)] transition-[cx] duration-300 ease-linear"
            />
          )}
        </svg>
      </div>

      <div className="border-t border-neutral-800 px-4 py-3 min-h-11.5 flex items-center">
        <span className="text-[11px] font-mono text-neutral-400 leading-relaxed">{frame.caption}</span>
      </div>
    </div>
  );
}
