// Small, schematic, educational SVG previews — one per topic on the home
// page. Deliberately not decorative icons: each one is meant to teach the
// shape of the concept at a glance, the same way the DSA app's home page
// diagrams did. Consistent stroke width (1.5), consistent corner radius,
// consistent palette: neutral for structure, indigo for the "active" bit.

const LINE = "#44546a";      // neutral-600 — structural lines/boxes
const LINE_SOFT = "#2a3547"; // neutral-700 — dashed/secondary lines
const ACCENT = "#ffc266";    // indigo-400 — the one thing to look at
const SURFACE = "#0f151e";   // neutral-900 — box fill

const wrap = "w-full h-full";

// ─── Phase 1 — Foundation ─────────────────────────────────────────────────

export function TopologyPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <line x1="14" y1="28" x2="34" y2="28" stroke={LINE} strokeWidth="1.5" />
      <line x1="42" y1="28" x2="54" y2="28" stroke={LINE} strokeWidth="1.5" />
      <line x1="62" y1="28" x2="82" y2="28" stroke={LINE} strokeWidth="1.5" />
      {/* PC */}
      <rect x="4" y="20" width="14" height="10" rx="1.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="8" y1="33" x2="14" y2="33" stroke={LINE} strokeWidth="1.5" />
      {/* Switch */}
      <rect x="34" y="23" width="16" height="10" rx="2" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="37" y1="28" x2="37" y2="31" stroke={LINE} strokeWidth="1.5" />
      <line x1="41" y1="28" x2="41" y2="31" stroke={LINE} strokeWidth="1.5" />
      <line x1="45" y1="28" x2="45" y2="31" stroke={LINE} strokeWidth="1.5" />
      {/* Router */}
      <circle cx="58" cy="28" r="8" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M55 25l3 3-3 3M61 25l-3 3 3 3" stroke={ACCENT} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Server */}
      <rect x="78" y="18" width="14" height="20" rx="1.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="78" y1="24" x2="92" y2="24" stroke={LINE} strokeWidth="1" />
      <line x1="78" y1="30" x2="92" y2="30" stroke={LINE} strokeWidth="1" />
    </svg>
  );
}

export function PacketPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="74" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="24" y1="28" x2="72" y2="28" stroke={LINE_SOFT} strokeWidth="1.5" />
      <circle className="preview-packet" cx="24" cy="28" r="4" fill={ACCENT} style={{ ["--glide-distance" as string]: "48px" }} />
    </svg>
  );
}

export function OSIPreview() {
  const layers = 6;
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {Array.from({ length: layers }, (_, i) => (
        <rect
          key={i}
          x="14" y={4 + i * 8} width="68" height="6" rx="1.5"
          fill={i === 0 ? "rgba(129,140,248,0.15)" : SURFACE}
          stroke={i === 0 ? ACCENT : LINE}
          strokeWidth="1.3"
        />
      ))}
    </svg>
  );
}

export function EncapsulationPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="6" width="84" height="44" rx="4" fill="none" stroke={LINE} strokeWidth="1.3" />
      <rect x="14" y="14" width="68" height="28" rx="3" fill="none" stroke={LINE} strokeWidth="1.3" />
      <rect x="22" y="21" width="52" height="14" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.3" />
      <rect x="32" y="26" width="32" height="6" rx="1.5" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
    </svg>
  );
}

// ─── Phase 2 — Layer 2 ────────────────────────────────────────────────────

export function EthernetPreview() {
  const fields = [0, 20, 40, 56, 78];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="22" width="88" height="14" rx="2" fill="none" stroke={LINE} strokeWidth="1.5" />
      {fields.slice(1).map((x) => (
        <line key={x} x1={4 + x} y1="22" x2={4 + x} y2="36" stroke={LINE} strokeWidth="1.3" />
      ))}
      <rect x={4 + fields[1]} y="22" width={fields[2] - fields[1]} height="14" fill="rgba(129,140,248,0.15)" stroke="none" />
      <text x="10" y="16" fontSize="6" fill={LINE} fontFamily="monospace">dst</text>
      <text x="26" y="16" fontSize="6" fill={ACCENT} fontFamily="monospace">src</text>
      <text x="44" y="16" fontSize="6" fill={LINE} fontFamily="monospace">type</text>
      <text x="62" y="16" fontSize="6" fill={LINE} fontFamily="monospace">data</text>
      <text x="82" y="16" fontSize="6" fill={LINE} fontFamily="monospace">crc</text>
    </svg>
  );
}

export function MacLearningPreview() {
  const hosts = [{ x: 16, y: 12 }, { x: 16, y: 28 }, { x: 16, y: 44 }];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="66" y="20" width="18" height="16" rx="2.5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      {hosts.map((h, i) => (
        <g key={i}>
          <line x1={h.x + 8} y1={h.y} x2="66" y2="28" stroke={i === 2 ? ACCENT : LINE_SOFT} strokeWidth="1.3" strokeDasharray={i === 2 ? undefined : "3 2"} />
          <circle cx={h.x} cy={h.y} r="6" fill="none" stroke={LINE} strokeWidth="1.5" />
        </g>
      ))}
      <line x1="70" y1="24" x2="80" y2="24" stroke={ACCENT} strokeWidth="1" />
      <line x1="70" y1="32" x2="80" y2="32" stroke={ACCENT} strokeWidth="1" />
    </svg>
  );
}

export function ArpPreview() {
  const targets = [{ x: 80, y: 12 }, { x: 88, y: 28 }, { x: 80, y: 44 }];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="14" cy="28" r="7" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <circle className="preview-ping" cx="14" cy="28" r="7" fill="none" stroke={ACCENT} strokeWidth="1.2" opacity="0.6" />
      {targets.map((t, i) => (
        <g key={i}>
          <line x1="21" y1="28" x2={t.x - 6} y2={t.y} stroke={LINE_SOFT} strokeWidth="1.2" strokeDasharray="3 2" />
          <circle cx={t.x} cy={t.y} r="6" fill="none" stroke={i === 1 ? ACCENT : LINE} strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

export function NetworkDevicesPreview() {
  const kinds = [
    { x: 14, shape: "switch" }, { x: 40, shape: "router" }, { x: 66, shape: "server" },
  ];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {kinds.map((k, i) => (
        <rect key={i} x={k.x} y="20" width="16" height="16" rx="2.5" fill={i === 1 ? "rgba(129,140,248,0.15)" : "none"} stroke={i === 1 ? ACCENT : LINE} strokeWidth="1.4" />
      ))}
      <text x="22" y="46" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">L2</text>
      <text x="48" y="46" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">L3</text>
      <text x="74" y="46" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">host</text>
    </svg>
  );
}

// ─── Phase 3 — Layer 3 ────────────────────────────────────────────────────

export function IPv4Preview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="16" width="84" height="24" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="6" y1="28" x2="90" y2="28" stroke={LINE} strokeWidth="1.2" />
      <text x="10" y="24" fontSize="6" fill={LINE} fontFamily="monospace">src 192.168.1.10</text>
      <text x="10" y="36" fontSize="6" fill={LINE} fontFamily="monospace">dst 93.184.216.34</text>
      <circle cx="80" cy="10" r="7" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
      <text x="80" y="12.5" fontSize="6.5" textAnchor="middle" fill={ACCENT} fontFamily="monospace" fontWeight="bold">64</text>
    </svg>
  );
}

export function FragmentationPreview() {
  const frags = [{ x: 20, w: 14 }, { x: 38, w: 14 }, { x: 56, w: 10 }];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="10" y="8" width="56" height="12" rx="2" fill="none" stroke={LINE} strokeWidth="1.3" />
      <text x="38" y="6" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">4000B packet</text>
      {frags.map((f, i) => (
        <rect key={i} x={f.x} y="32" width={f.w} height="12" rx="1.5" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
      ))}
      <path d="M38,20 V26 M20,26 H66 M20,26 V32 M38,26 V32 M56,26 V32" stroke={LINE_SOFT} strokeWidth="1" fill="none" />
    </svg>
  );
}

export function NatPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <text x="16" y="16" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">192.168.1.10</text>
      <rect x="4" y="20" width="24" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <circle cx="48" cy="28" r="9" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.4" />
      <path d="M-6,-3 L6,-3 M2,-7 L6,-3 L2,1" transform="translate(48 28)" stroke={ACCENT} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="68" y="20" width="24" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <text x="80" y="16" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">203.0.113.5</text>
      <line x1="28" y1="28" x2="39" y2="28" stroke={LINE} strokeWidth="1.3" />
      <line x1="57" y1="28" x2="68" y2="28" stroke={ACCENT} strokeWidth="1.3" />
    </svg>
  );
}

export function SubnettingPreview() {
  const cells = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="8" y="8" width="80" height="40" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      {cells.map((i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <rect key={i} x={8 + col * 20} y={8 + row * 20} width="20" height="20"
            fill={i === 1 ? "rgba(129,140,248,0.15)" : "none"}
            stroke={i === 1 ? ACCENT : LINE_SOFT} strokeWidth="1" />
        );
      })}
    </svg>
  );
}

export function RoutingPreview() {
  const nodes = [{ x: 12, y: 28 }, { x: 36, y: 12 }, { x: 36, y: 44 }, { x: 64, y: 28 }, { x: 88, y: 28 }];
  const path: [number, number][] = [[0, 1], [1, 3], [3, 4]];
  const other: [number, number][] = [[0, 2], [2, 3]];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {other.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={LINE_SOFT} strokeWidth="1.3" />
      ))}
      {path.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={ACCENT} strokeWidth="2" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="6" fill={i === 0 || i === 4 ? "rgba(129,140,248,0.15)" : SURFACE} stroke={LINE} strokeWidth="1.3" />
      ))}
    </svg>
  );
}

export function ICMPPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="74" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <path d="M24 24 H70" stroke={ACCENT} strokeWidth="1.4" markerEnd="url(#icmp-arrow)" />
      <path d="M70 32 H24" stroke={LINE_SOFT} strokeWidth="1.4" strokeDasharray="3 2" markerEnd="url(#icmp-arrow-soft)" />
      <defs>
        <marker id="icmp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={ACCENT} />
        </marker>
        <marker id="icmp-arrow-soft" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={LINE_SOFT} />
        </marker>
      </defs>
    </svg>
  );
}

// ─── Phase 4 — Layer 4 ────────────────────────────────────────────────────

export function PortsPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="18" width="20" height="20" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="70" y="18" width="20" height="20" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="26" y1="28" x2="70" y2="28" stroke={ACCENT} strokeWidth="1.4" />
      <circle cx="80" cy="28" r="3.5" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
      <text x="16" y="44" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">:52341</text>
      <text x="80" y="44" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">:443</text>
    </svg>
  );
}

export function UDPPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="74" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="24" y1="28" x2="72" y2="28" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="5 3" />
      <path d="M66,23 L72,28 L66,33" stroke={ACCENT} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function sequenceDiagram(labels: { text: string; dir: "right" | "left"; color: string }[]) {
  const top = 8;
  const gap = 12;
  return (
    <>
      <line x1="20" y1={top} x2="20" y2={top + gap * labels.length + 4} stroke={LINE} strokeWidth="1.3" />
      <line x1="76" y1={top} x2="76" y2={top + gap * labels.length + 4} stroke={LINE} strokeWidth="1.3" />
      {labels.map((l, i) => {
        const y = top + 8 + i * gap;
        const [x1, x2] = l.dir === "right" ? [20, 76] : [76, 20];
        return (
          <g key={i}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={l.color} strokeWidth="1.4" />
            <path
              d={l.dir === "right" ? `M${x2 - 5},${y - 3} L${x2},${y} L${x2 - 5},${y + 3}` : `M${x2 + 5},${y - 3} L${x2},${y} L${x2 + 5},${y + 3}`}
              stroke={l.color} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"
            />
            <text x={48} y={y - 2} fontSize="5.5" textAnchor="middle" fill={l.color} fontFamily="monospace">{l.text}</text>
          </g>
        );
      })}
    </>
  );
}

export function TCPHandshakePreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {sequenceDiagram([
        { text: "SYN", dir: "right", color: ACCENT },
        { text: "SYN-ACK", dir: "left", color: LINE },
        { text: "ACK", dir: "right", color: ACCENT },
      ])}
    </svg>
  );
}

export function TCPDataTransferPreview() {
  const segs = [0, 1, 2];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {segs.map((i) => (
        <rect key={i} x={16 + i * 18} y="16" width="14" height="12" rx="1.5" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
      ))}
      <path d="M16 34 H68" stroke={LINE_SOFT} strokeWidth="1.3" strokeDasharray="3 2" markerEnd="url(#dt-arrow)" />
      <text x="42" y="46" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">ACK 4</text>
      <defs>
        <marker id="dt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={LINE_SOFT} />
        </marker>
      </defs>
    </svg>
  );
}

export function TCPFlowControlPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="60" y="8" width="26" height="40" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="63" y="30" width="20" height="15" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1" />
      <path d="M40 28 H56" stroke={ACCENT} strokeWidth="1.4" markerEnd="url(#fc-arrow)" />
      <text x="30" y="20" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">rwnd</text>
      <defs>
        <marker id="fc-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={ACCENT} />
        </marker>
      </defs>
    </svg>
  );
}

export function TCPTerminationPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {sequenceDiagram([
        { text: "FIN", dir: "right", color: ACCENT },
        { text: "ACK", dir: "left", color: LINE },
        { text: "FIN", dir: "left", color: LINE },
        { text: "ACK", dir: "right", color: ACCENT },
      ])}
    </svg>
  );
}

export function TCPvsUDPPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <line x1="48" y1="4" x2="48" y2="52" stroke={LINE_SOFT} strokeWidth="1.2" strokeDasharray="3 2" />
      <path d="M8 16 H40" stroke={ACCENT} strokeWidth="1.4" />
      <text x="24" y="10" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">TCP</text>
      <path d="M56 16 H88" stroke={LINE} strokeWidth="1.4" strokeDasharray="4 2" />
      <text x="72" y="10" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">UDP</text>
      <text x="24" y="44" fontSize="5.5" textAnchor="middle" fill={LINE} fontFamily="monospace">reliable</text>
      <text x="72" y="44" fontSize="5.5" textAnchor="middle" fill={LINE} fontFamily="monospace">fast</text>
    </svg>
  );
}

export function TCPWindowPreview() {
  const segs = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {segs.map((i) => (
        <rect key={i} x={6 + i * 14} y="24" width="12" height="12" rx="1.5"
          fill={i < 3 ? "rgba(129,140,248,0.15)" : "none"}
          stroke={i < 3 ? ACCENT : LINE} strokeWidth="1.3" />
      ))}
      <path d="M6 18 H48" stroke={ACCENT} strokeWidth="1.2" />
      <path d="M6 15 V21 M48 15 V21" stroke={ACCENT} strokeWidth="1.2" />
      <text x="27" y="12" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">window</text>
    </svg>
  );
}

export function TCPCongestionPreview() {
  const points = "6,44 20,20 34,44 34,44 50,14 64,44 64,44 80,24 90,10";
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <line x1="6" y1="46" x2="90" y2="46" stroke={LINE} strokeWidth="1.2" />
      <line x1="6" y1="6" x2="6" y2="46" stroke={LINE} strokeWidth="1.2" />
      <polyline points={points} fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Phase 5 — Application layer ─────────────────────────────────────────

export function DHCPPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {sequenceDiagram([
        { text: "DISCOVER", dir: "right", color: ACCENT },
        { text: "OFFER", dir: "left", color: LINE },
        { text: "REQUEST", dir: "right", color: ACCENT },
        { text: "ACK", dir: "left", color: LINE },
      ])}
    </svg>
  );
}

export function DNSPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="48" cy="10" r="6" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.4" />
      <line x1="48" y1="16" x2="20" y2="30" stroke={LINE} strokeWidth="1.3" />
      <line x1="48" y1="16" x2="76" y2="30" stroke={LINE} strokeWidth="1.3" />
      <circle cx="20" cy="34" r="6" fill="none" stroke={LINE} strokeWidth="1.4" />
      <circle cx="76" cy="34" r="6" fill="none" stroke={LINE} strokeWidth="1.4" />
      <line x1="76" y1="40" x2="76" y2="48" stroke={ACCENT} strokeWidth="1.3" />
      <circle cx="76" cy="50" r="4" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.3" />
    </svg>
  );
}

export function HTTPPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="16" width="20" height="24" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="4" y1="22" x2="24" y2="22" stroke={LINE} strokeWidth="1.2" />
      <rect x="72" y="16" width="20" height="24" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="72" y1="22" x2="92" y2="22" stroke={LINE} strokeWidth="1.2" />
      <line x1="30" y1="24" x2="66" y2="24" stroke={ACCENT} strokeWidth="1.4" />
      <path d="M60,20 L66,24 L60,28" stroke={ACCENT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="66" y1="34" x2="30" y2="34" stroke={LINE_SOFT} strokeWidth="1.4" strokeDasharray="4 2" />
      <path d="M36,30 L30,34 L36,38" stroke={LINE_SOFT} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="48" y="20" fontSize="6" textAnchor="middle" fill={ACCENT} fontFamily="monospace">GET</text>
      <text x="48" y="45" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">200 OK</text>
    </svg>
  );
}

export function HTTPSPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="16" width="20" height="24" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="72" y="16" width="20" height="24" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="26" y1="28" x2="70" y2="28" stroke={ACCENT} strokeWidth="1.4" />
      <rect x="42" y="18" width="12" height="10" rx="2" fill={SURFACE} stroke={ACCENT} strokeWidth="1.4" />
      <path d="M44,18 v-3 a4,4 0 0 1 8,0 v3" fill="none" stroke={ACCENT} strokeWidth="1.4" />
    </svg>
  );
}

export function BrowserJourneyPreview() {
  const dots = [10, 26, 42, 58, 74];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="8" width="88" height="40" rx="3" fill="none" stroke={LINE} strokeWidth="1.4" />
      <line x1="4" y1="18" x2="92" y2="18" stroke={LINE} strokeWidth="1" />
      <circle cx="11" cy="13" r="1.4" fill={LINE} />
      <line x1="8" y1="34" x2="88" y2="34" stroke={LINE_SOFT} strokeWidth="1.3" strokeDasharray="3 2" />
      {dots.map((x, i) => (
        <circle key={x} cx={x} cy={34} r={i === dots.length - 1 ? 3.5 : 2.2} fill={i === dots.length - 1 ? "rgba(129,140,248,0.25)" : ACCENT} stroke={i === dots.length - 1 ? ACCENT : "none"} strokeWidth="1.3" />
      ))}
    </svg>
  );
}

// ─── Network Algorithms ───────────────────────────────────────────────────

export function ErrorDetectionPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {["1", "1", "0", "1"].map((b, i) => (
        <rect key={i} x={10 + i * 14} y="20" width="11" height="16" rx="1.5" fill="none" stroke={LINE} strokeWidth="1.3" />
      ))}
      {["1", "1", "0", "1"].map((b, i) => (
        <text key={i} x={15.5 + i * 14} y="31" fontSize="7" textAnchor="middle" fill={LINE} fontFamily="monospace">{b}</text>
      ))}
      <rect x="66" y="20" width="11" height="16" rx="1.5" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.4" />
      <text x="71.5" y="31" fontSize="7" textAnchor="middle" fill={ACCENT} fontFamily="monospace" fontWeight="bold">1</text>
      <path d="M82 22 L92 12 M82 12 L92 22" stroke="#ff7d8e" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MacProtocolsPreview() {
  const stations = [{ x: 16, y: 14 }, { x: 16, y: 42 }, { x: 80, y: 14 }, { x: 80, y: 42 }];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <line x1="8" y1="28" x2="88" y2="28" stroke={LINE} strokeWidth="1.6" />
      {stations.map((s, i) => (
        <line key={i} x1={s.x} y1={s.y} x2={s.x} y2="28" stroke={i < 2 ? ACCENT : LINE_SOFT} strokeWidth="1.3" strokeDasharray={i < 2 ? undefined : "3 2"} />
      ))}
      {stations.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="6" fill={i < 2 ? "rgba(129,140,248,0.15)" : "none"} stroke={i < 2 ? ACCENT : LINE} strokeWidth="1.4" />
      ))}
      <path d="M40,24 L56,32 M40,32 L56,24" stroke="#ff7d8e" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ReliableTransmissionPreview() {
  const segs = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {segs.map((i) => (
        <rect key={i} x={8 + i * 17} y="12" width="14" height="12" rx="1.5"
          fill={i === 2 ? "none" : "rgba(129,140,248,0.15)"} stroke={i === 2 ? "#ff7d8e" : ACCENT} strokeWidth="1.3"
          strokeDasharray={i === 2 ? "2 2" : undefined} />
      ))}
      <path d="M8 34 H92" stroke={LINE_SOFT} strokeWidth="1.2" strokeDasharray="3 2" markerEnd="url(#rt-arrow)" />
      <text x="50" y="46" fontSize="6" textAnchor="middle" fill={LINE} fontFamily="monospace">resend from lost segment</text>
      <defs>
        <marker id="rt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={LINE_SOFT} />
        </marker>
      </defs>
    </svg>
  );
}


// ─── Enterprise Networking ────────────────────────────────────────────────

export function VlanPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="38" y="4" width="20" height="10" rx="2" fill="none" stroke={LINE} strokeWidth="1.4" />
      <line x1="48" y1="14" x2="48" y2="22" stroke={LINE} strokeWidth="1.4" />
      <rect x="6" y="22" width="40" height="12" rx="2" fill="rgba(96,165,250,0.1)" stroke="#7eb3ff" strokeWidth="1.3" />
      <rect x="50" y="22" width="40" height="12" rx="2" fill="rgba(251,191,36,0.1)" stroke="#e6e25a" strokeWidth="1.3" />
      <rect x="12" y="40" width="12" height="9" rx="1.5" fill="none" stroke="#7eb3ff" strokeWidth="1.2" />
      <rect x="28" y="40" width="12" height="9" rx="1.5" fill="none" stroke="#7eb3ff" strokeWidth="1.2" />
      <rect x="56" y="40" width="12" height="9" rx="1.5" fill="none" stroke="#e6e25a" strokeWidth="1.2" />
      <rect x="72" y="40" width="12" height="9" rx="1.5" fill="none" stroke="#e6e25a" strokeWidth="1.2" />
    </svg>
  );
}

export function StpPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="48" cy="14" r="8" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.5" />
      <circle cx="16" cy="42" r="7" fill="none" stroke={LINE} strokeWidth="1.4" />
      <circle cx="80" cy="42" r="7" fill="none" stroke={LINE} strokeWidth="1.4" />
      <line x1="42" y1="20" x2="20" y2="36" stroke={ACCENT} strokeWidth="1.5" />
      <line x1="54" y1="20" x2="76" y2="36" stroke={ACCENT} strokeWidth="1.5" />
      <line x1="16" y1="35" x2="80" y2="35" stroke="#ff7d8e" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M42 33 L50 33 M42 37 L50 37" stroke="#ff7d8e" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function RoutingProtocolsPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="14" cy="28" r="7" fill="none" stroke={LINE} strokeWidth="1.5" />
      <circle cx="48" cy="12" r="7" fill="none" stroke={LINE} strokeWidth="1.5" />
      <circle cx="48" cy="44" r="7" fill="none" stroke={LINE} strokeWidth="1.5" />
      <circle cx="82" cy="28" r="7" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.5" />
      <line x1="20" y1="25" x2="42" y2="15" stroke={LINE_SOFT} strokeWidth="1.3" />
      <line x1="20" y1="31" x2="42" y2="41" stroke={ACCENT} strokeWidth="1.6" />
      <line x1="54" y1="12" x2="76" y2="24" stroke={LINE_SOFT} strokeWidth="1.3" />
      <line x1="54" y1="43" x2="76" y2="31" stroke={ACCENT} strokeWidth="1.6" />
    </svg>
  );
}

export function IPv6Preview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <text x="48" y="24" fontSize="9" textAnchor="middle" fill={LINE} fontFamily="monospace">2001:0db8:0000</text>
      <text x="48" y="36" fontSize="9" textAnchor="middle" fill={ACCENT} fontFamily="monospace" fontWeight="bold">::ff00:42:8329</text>
      <line x1="12" y1="42" x2="84" y2="42" stroke={LINE_SOFT} strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

export function WirelessPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="40" y="34" width="16" height="12" rx="2" fill="none" stroke={LINE} strokeWidth="1.4" />
      <path d="M32 30 A24 24 0 0 1 64 30" stroke={LINE_SOFT} strokeWidth="1.4" fill="none" />
      <path d="M38 34 A16 16 0 0 1 58 34" stroke={ACCENT} strokeWidth="1.5" fill="none" />
      <circle cx="48" cy="40" r="1.8" fill={ACCENT} />
      <rect x="10" y="18" width="14" height="10" rx="1.5" fill="none" stroke={LINE} strokeWidth="1.4" />
      <rect x="72" y="18" width="14" height="10" rx="1.5" fill="none" stroke={LINE} strokeWidth="1.4" />
    </svg>
  );
}

export function WebSocketPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="6" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <rect x="74" y="20" width="16" height="16" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.5" />
      <path d="M24 24 L72 24" stroke={LINE_SOFT} strokeWidth="1.3" strokeDasharray="3 2" />
      <path d="M24 32 L40 32 L44 26 L48 38 L52 32 L72 32" stroke={ACCENT} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmailPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="14" y="16" width="68" height="26" rx="2.5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M14 18 L48 36 L82 18" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SshPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="10" y="10" width="76" height="36" rx="3" fill={SURFACE} stroke={LINE} strokeWidth="1.4" />
      <rect x="38" y="20" width="20" height="16" rx="2" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M42 20 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <circle cx="48" cy="27" r="1.8" fill={ACCENT} />
    </svg>
  );
}

export function LoadBalancingPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="22" width="14" height="12" rx="2" fill="none" stroke={LINE} strokeWidth="1.4" />
      <rect x="41" y="22" width="14" height="12" rx="2" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.4" />
      <line x1="18" y1="28" x2="41" y2="28" stroke={LINE_SOFT} strokeWidth="1.3" />
      <path d="M55 24 L78 12 M55 28 L78 28 M55 32 L78 44" stroke={ACCENT} strokeWidth="1.3" fill="none" />
      <rect x="78" y="7" width="12" height="10" rx="1.5" fill="none" stroke="#4fe0cc" strokeWidth="1.2" />
      <rect x="78" y="23" width="12" height="10" rx="1.5" fill="none" stroke="#4fe0cc" strokeWidth="1.2" />
      <rect x="78" y="39" width="12" height="10" rx="1.5" fill="none" stroke="#ff7d8e" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

export function PacketLifePreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="4" y="24" width="10" height="10" rx="1.5" fill="none" stroke="#e6e25a" strokeWidth="1.3" />
      <rect x="16" y="22" width="10" height="14" rx="1.5" fill="none" stroke="#8b9cff" strokeWidth="1.3" />
      <rect x="28" y="20" width="10" height="18" rx="1.5" fill="none" stroke={ACCENT} strokeWidth="1.3" />
      <rect x="40" y="18" width="10" height="22" rx="1.5" fill="none" stroke="#ff7d8e" strokeWidth="1.3" />
      <line x1="56" y1="28" x2="90" y2="28" stroke={LINE_SOFT} strokeWidth="1.4" strokeDasharray="3 2" />
      <circle className="preview-packet" cx="56" cy="28" r="4" fill={ACCENT} style={{ ["--glide-distance" as string]: "34px" }} />
    </svg>
  );
}

export function FirewallAclPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="8" y="8" width="50" height="10" rx="2" fill="rgba(74,222,128,0.15)" stroke="#4fe0cc" strokeWidth="1.3" />
      <rect x="8" y="21" width="50" height="10" rx="2" fill="rgba(248,113,113,0.15)" stroke="#ff7d8e" strokeWidth="1.3" />
      <rect x="8" y="34" width="50" height="10" rx="2" fill="none" stroke={LINE_SOFT} strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M64 13 L88 13 M64 26 L88 26" stroke={LINE} strokeWidth="1.2" strokeDasharray="3 2" />
      <path d="M66 39 L92 39" stroke="#ff7d8e" strokeWidth="1.6" />
      <path d="M78 34 L86 44 M86 34 L78 44" stroke="#ff7d8e" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ─── Experiments ───────────────────────────────────────────────────────────

export function ArpTimeoutLabPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="48" cy="28" r="18" fill="none" stroke={LINE} strokeWidth="1.5" />
      <line x1="48" y1="28" x2="48" y2="14" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="48" y1="28" x2="58" y2="32" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="48" cy="28" r="2" fill={ACCENT} />
    </svg>
  );
}

export function NatScaleLabPreview() {
  const rows = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <rect x="8" y="6" width="80" height="44" rx="2.5" fill="none" stroke={LINE} strokeWidth="1.4" />
      {rows.map((i) => (
        <rect key={i} x="12" y={11 + i * 10} width="72" height="6"
          fill={i < 3 ? "rgba(129,140,248,0.15)" : "none"}
          stroke={i < 3 ? ACCENT : LINE_SOFT} strokeWidth="1" strokeDasharray={i === 3 ? "2 2" : undefined} />
      ))}
    </svg>
  );
}

export function RoutingWhatIfLabPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <circle cx="14" cy="28" r="7" fill="none" stroke={LINE} strokeWidth="1.5" />
      <circle cx="82" cy="28" r="7" fill="rgba(129,140,248,0.15)" stroke={ACCENT} strokeWidth="1.5" />
      <path d="M20 25 L76 25" stroke="#ff7d8e" strokeWidth="1.6" strokeDasharray="4 3" />
      <path d="M42 20 L52 20 M42 30 L52 30" stroke="#ff7d8e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 32 L50 42 L76 32" stroke={ACCENT} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DiagnosticLabPreview() {
  const rows = [0, 1, 2];
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      {rows.map((i) => (
        <rect key={i} x="14" y={8 + i * 13} width="60" height="9" rx="2"
          fill={i < 2 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.15)"}
          stroke={i < 2 ? "#4fe0cc" : "#ff7d8e"} strokeWidth="1.2" />
      ))}
      <path d="M40 34 L48 44 M48 34 L40 44" stroke="#ff7d8e" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AlohaThroughputLabPreview() {
  return (
    <svg viewBox="0 0 96 56" className={wrap} aria-hidden="true">
      <line x1="12" y1="46" x2="88" y2="46" stroke={LINE} strokeWidth="1.2" />
      <line x1="12" y1="46" x2="12" y2="8" stroke={LINE} strokeWidth="1.2" />
      <path d="M12 46 C 30 10, 40 10, 50 30 S 70 44, 88 45" fill="none" stroke={ACCENT} strokeWidth="1.8" />
    </svg>
  );
}
