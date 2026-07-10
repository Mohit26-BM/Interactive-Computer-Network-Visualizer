"use client";

import { useRef, useState } from "react";
import { TopologyState, DeviceKind } from "@/lib/topology-engine";

export type Tool = "select" | DeviceKind;

interface Props {
  state: TopologyState;
  highlightDevices?: string[];
  highlightLinks?: string[];
  phase?: string;
  width?: number;
  height?: number;
  onMoveDevice?: (id: string, x: number, y: number) => void;
  /** "select" for pointing/dragging/connecting; a DeviceKind arms placement mode. */
  tool?: Tool;
  onPlace?: (x: number, y: number) => void;
  onCreateLink?: (fromId: string, toId: string) => void;
  onRenameDevice?: (id: string, newLabel: string) => void;
  selectedDeviceId?: string | null;
  onSelectDevice?: (id: string | null) => void;
  selectedLinkId?: string | null;
  onSelectLink?: (id: string | null) => void;
}

const phaseColor: Record<string, string> = {
  insert: "#22c55e",
  found: "#f97316",
  delete: "#ef4444",
  error: "#ef4444",
  default: "#6366f1",
};

// Tailwind arbitrary-value filter classes per phase — avoids a dynamic inline
// style prop for the highlight glow, same convention the DSA app uses.
const phaseGlowClass: Record<string, string> = {
  insert: "filter-[drop-shadow(0_0_8px_#22c55e80)]",
  found: "filter-[drop-shadow(0_0_8px_#f9731680)]",
  delete: "filter-[drop-shadow(0_0_8px_#ef444480)]",
  error: "filter-[drop-shadow(0_0_8px_#ef444480)]",
  default: "filter-[drop-shadow(0_0_8px_#6366f180)]",
};

const SELECTED_COLOR = "#fbbf24";

// Hand-drawn SVG glyphs per device kind — no emoji, no photographic icons.
function DeviceGlyph({ kind, muted }: { kind: DeviceKind; muted: boolean }) {
  const stroke = muted ? "#737373" : "#e5e5e5";
  switch (kind) {
    case "pc":
      return (
        <g>
          <rect x={-14} y={-11} width={28} height={18} rx={2} fill="none" stroke={stroke} strokeWidth={1.6} />
          <line x1={-6} y1={11} x2={6} y2={11} stroke={stroke} strokeWidth={1.6} />
          <line x1={0} y1={7} x2={0} y2={11} stroke={stroke} strokeWidth={1.6} />
        </g>
      );
    case "switch":
      return (
        <g>
          <rect x={-16} y={-8} width={32} height={16} rx={2} fill="none" stroke={stroke} strokeWidth={1.6} />
          {[-10, -3.5, 3, 9.5].map((x) => (
            <rect key={x} x={x} y={-3} width={3.5} height={6} fill={stroke} />
          ))}
        </g>
      );
    case "router":
      return (
        <g>
          <circle r={15} fill="none" stroke={stroke} strokeWidth={1.6} />
          <path d="M-7,-2 L7,-2 M2,-7 L7,-2 L2,3" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7,4 L-7,4 M-2,-1 L-7,4 L-2,9" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "server":
      return (
        <g>
          <rect x={-13} y={-14} width={26} height={28} rx={2} fill="none" stroke={stroke} strokeWidth={1.6} />
          <line x1={-13} y1={-5} x2={13} y2={-5} stroke={stroke} strokeWidth={1.2} />
          <line x1={-13} y1={4} x2={13} y2={4} stroke={stroke} strokeWidth={1.2} />
          <circle cx={-7} cy={-9.5} r={1.3} fill={stroke} />
          <circle cx={-7} cy={-0.5} r={1.3} fill={stroke} />
          <circle cx={-7} cy={9} r={1.3} fill={stroke} />
        </g>
      );
  }
}

const HANDLE_OFFSETS = [
  { dx: 0, dy: -34 },
  { dx: 34, dy: 0 },
  { dx: 0, dy: 34 },
  { dx: -34, dy: 0 },
];

export default function TopologyVisualizer({
  state,
  highlightDevices = [],
  highlightLinks = [],
  phase,
  width = 640,
  height = 360,
  onMoveDevice,
  tool = "select",
  onPlace,
  onCreateLink,
  onRenameDevice,
  selectedDeviceId = null,
  onSelectDevice,
  selectedLinkId = null,
  onSelectLink,
}: Props) {
  const hlDeviceSet = new Set(highlightDevices);
  const hlLinkSet = new Set(highlightLinks);
  const { devices, links, positions } = state;
  const svgRef = useRef<SVGSVGElement>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectPoint, setConnectPoint] = useState<{ x: number; y: number } | null>(null);
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const interactive = Boolean(onMoveDevice || onPlace || onCreateLink);

  if (devices.length === 0 && !onPlace) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-600 text-sm italic">
        Empty topology — add a device to begin
      </div>
    );
  }

  const highlightColor = phase ? (phaseColor[phase] ?? phaseColor.default) : phaseColor.default;

  function toViewBoxPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  }

  function deviceIdAtPoint(clientX: number, clientY: number): string | null {
    const el = document.elementFromPoint(clientX, clientY);
    const target = el?.closest?.("[data-device-id]") as Element | null;
    return target?.getAttribute("data-device-id") ?? null;
  }

  function handleDevicePointerDown(e: React.PointerEvent, id: string) {
    if (tool !== "select") return; // placement tool ignores existing devices
    e.stopPropagation();
    if (renamingId || !onMoveDevice) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function handleDeviceClick(e: React.MouseEvent, id: string) {
    if (tool !== "select") return; // let the click pass through to place a device
    e.stopPropagation();
    onSelectDevice?.(id);
  }

  function handleHandlePointerDown(e: React.PointerEvent, id: string) {
    if (!onCreateLink) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setConnectingFrom(id);
    const p = toViewBoxPoint(e.clientX, e.clientY);
    if (p) setConnectPoint(p);
  }

  function handleSvgPointerMove(e: React.PointerEvent) {
    if (draggingId && onMoveDevice) {
      const p = toViewBoxPoint(e.clientX, e.clientY);
      if (p) onMoveDevice(draggingId, Math.round(p.x), Math.round(p.y));
      return;
    }
    if (connectingFrom) {
      const p = toViewBoxPoint(e.clientX, e.clientY);
      if (p) setConnectPoint(p);
      const overId = deviceIdAtPoint(e.clientX, e.clientY);
      setConnectTarget(overId && overId !== connectingFrom ? overId : null);
      return;
    }
    if (tool !== "select") {
      const p = toViewBoxPoint(e.clientX, e.clientY);
      if (p) setGhostPos(p);
    }
  }

  function handleSvgPointerUp() {
    if (connectingFrom && connectTarget && onCreateLink) {
      onCreateLink(connectingFrom, connectTarget);
    }
    setDraggingId(null);
    setConnectingFrom(null);
    setConnectPoint(null);
    setConnectTarget(null);
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (tool !== "select") {
      const p = toViewBoxPoint(e.clientX, e.clientY);
      if (p) onPlace?.(Math.round(p.x), Math.round(p.y));
    } else {
      onSelectDevice?.(null);
      onSelectLink?.(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const p = toViewBoxPoint(e.clientX, e.clientY);
    if (p) onPlace?.(Math.round(p.x), Math.round(p.y));
  }

  function startRename(d: { id: string; label: string }) {
    if (!onRenameDevice) return;
    setRenamingId(d.id);
    setRenameValue(d.label);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) onRenameDevice?.(renamingId, renameValue.trim());
    setRenamingId(null);
  }

  return (
    <div
      className="flex justify-center py-4 overflow-auto"
      onDragOver={onPlace ? (e) => e.preventDefault() : undefined}
      onDrop={onPlace ? handleDrop : undefined}
    >
      <svg
        ref={svgRef}
        width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        className={`max-w-full min-w-80 ${tool !== "select" ? "cursor-crosshair" : ""}`}
        onPointerMove={interactive ? handleSvgPointerMove : undefined}
        onPointerUp={interactive ? handleSvgPointerUp : undefined}
        onPointerLeave={interactive ? handleSvgPointerUp : undefined}
        onClick={interactive ? handleBackgroundClick : undefined}
      >
        {links.map((l) => {
          const fp = positions[l.from];
          const tp = positions[l.to];
          if (!fp || !tp) return null;
          const isHl = hlLinkSet.has(l.id);
          const isSelected = selectedLinkId === l.id;
          return (
            <line
              key={l.id}
              x1={fp.x} y1={fp.y} x2={tp.x} y2={tp.y}
              stroke={isHl ? highlightColor : isSelected ? SELECTED_COLOR : "#404040"}
              strokeWidth={isHl || isSelected ? 3 : 2}
              className="transition-all duration-300"
              style={{ cursor: onSelectLink && tool === "select" ? "pointer" : undefined, pointerEvents: "stroke" }}
              onClick={
                onSelectLink && tool === "select"
                  ? (e) => { e.stopPropagation(); onSelectLink(l.id); }
                  : undefined
              }
            />
          );
        })}

        {connectingFrom && connectPoint && positions[connectingFrom] && (
          <line
            x1={positions[connectingFrom].x} y1={positions[connectingFrom].y}
            x2={connectPoint.x} y2={connectPoint.y}
            stroke="#818cf8" strokeWidth={2} strokeDasharray="4 4"
          />
        )}

        {devices.map((d) => {
          const pos = positions[d.id];
          if (!pos) return null;
          const isHl = hlDeviceSet.has(d.id);
          const isSelected = selectedDeviceId === d.id;
          const isConnectTarget = connectTarget === d.id;
          const fill = isHl ? highlightColor : "#171717";
          const stroke = isHl ? highlightColor : isSelected || isConnectTarget ? SELECTED_COLOR : "#525252";
          const showHandles = tool === "select" && onCreateLink && hoveredId === d.id && !draggingId && !connectingFrom;
          return (
            <g
              key={d.id}
              data-device-id={d.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onPointerDown={(e) => handleDevicePointerDown(e, d.id)}
              onClick={(e) => handleDeviceClick(e, d.id)}
              onPointerEnter={() => setHoveredId(d.id)}
              onPointerLeave={() => setHoveredId((h) => (h === d.id ? null : h))}
              className={tool === "select" && onMoveDevice ? (draggingId === d.id ? "cursor-grabbing" : "cursor-grab") : undefined}
            >
              <rect
                x={-24} y={-24} width={48} height={48} rx={10}
                fill={fill} fillOpacity={isHl ? 0.18 : 1}
                stroke={stroke} strokeWidth={2}
                className={`transition-all duration-300 ${isHl ? (phaseGlowClass[phase ?? "default"] ?? phaseGlowClass.default) : ""}`}
              />
              <DeviceGlyph kind={d.kind} muted={!isHl} />

              {renamingId === d.id ? (
                <foreignObject x={-45} y={22} width={90} height={22}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full px-1 py-0 text-[11px] font-mono font-bold text-center bg-neutral-900 border border-indigo-500 rounded text-white focus:outline-none"
                  />
                </foreignObject>
              ) : (
                <text
                  x={0} y={36} textAnchor="middle"
                  fill={isHl ? highlightColor : "#a3a3a3"}
                  fontSize={11} fontFamily="monospace" fontWeight="bold"
                  style={{ cursor: onRenameDevice ? "text" : undefined }}
                  onDoubleClick={(e) => { e.stopPropagation(); startRename(d); }}
                >
                  {d.label}
                </text>
              )}

              {showHandles && HANDLE_OFFSETS.map(({ dx, dy }, i) => (
                <circle
                  key={i}
                  cx={dx} cy={dy} r={5}
                  fill="#1e1b4b" stroke="#818cf8" strokeWidth={1.5}
                  className="cursor-crosshair"
                  onPointerDown={(e) => handleHandlePointerDown(e, d.id)}
                />
              ))}
            </g>
          );
        })}

        {tool !== "select" && ghostPos && !connectingFrom && (
          <g transform={`translate(${ghostPos.x}, ${ghostPos.y})`} opacity={0.45} pointerEvents="none">
            <rect x={-24} y={-24} width={48} height={48} rx={10} fill="#171717" stroke="#818cf8" strokeWidth={2} strokeDasharray="3 3" />
            <DeviceGlyph kind={tool} muted={false} />
          </g>
        )}
      </svg>
    </div>
  );
}
