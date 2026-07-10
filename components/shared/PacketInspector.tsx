"use client";

import { PacketHeaderLayer } from "@/lib/types";

interface Props {
  layers: PacketHeaderLayer[];
  activeLayerIndex?: number; // which layer was just added/removed/touched this step
  emptyLabel?: string;
}

const LAYER_ACCENT: Record<string, string> = {
  Ethernet: "border-amber-500/40 text-amber-300",
  ARP: "border-amber-500/40 text-amber-300",
  IPv4: "border-violet-500/40 text-violet-300",
  ICMP: "border-violet-500/40 text-violet-300",
  TCP: "border-indigo-500/40 text-indigo-300",
  UDP: "border-indigo-500/40 text-indigo-300",
  TLS: "border-emerald-500/40 text-emerald-300",
  HTTP: "border-rose-500/40 text-rose-300",
  DNS: "border-rose-500/40 text-rose-300",
  DHCP: "border-rose-500/40 text-rose-300",
};

function accentFor(protocol: string): string {
  return LAYER_ACCENT[protocol] ?? "border-neutral-600/50 text-neutral-300";
}

export default function PacketInspector({ layers, activeLayerIndex, emptyLabel }: Props) {
  if (layers.length === 0) {
    return (
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center text-neutral-600 text-sm italic">
        {emptyLabel ?? "No packet selected — raw payload only"}
      </div>
    );
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 border-b border-neutral-800">
        <svg className="w-3.5 h-3.5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
          <path d="M3 9h18M3 15h18" strokeWidth={1.5} />
        </svg>
        <span className="text-xs text-neutral-500 font-mono">inside the packet</span>
      </div>

      <div className="p-3 space-y-2">
        {layers.map((layer, i) => {
          const isActive = activeLayerIndex === i;
          return (
            <div
              key={`${layer.protocol}-${i}`}
              className={`border rounded-lg overflow-hidden transition-all duration-300 ${accentFor(layer.protocol)} ${
                isActive ? "ring-1 ring-current shadow-lg" : "opacity-90"
              }`}
              style={{ marginLeft: i * 10 }}
            >
              <div className="px-3 py-1.5 bg-neutral-900/60 flex items-center justify-between">
                <span className="text-xs font-mono font-bold">{layer.protocol}</span>
                <span className="text-[10px] font-mono opacity-60">layer {i + 1}</span>
              </div>
              <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 bg-neutral-950/60">
                {Object.entries(layer.fields).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 text-[11px] font-mono">
                    <span className="text-neutral-500">{key}</span>
                    <span className="text-neutral-200 truncate">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
