"use client";

// "Where am I in the stack?" — a condensed TCP/IP model strip shared by every
// Phase 5 page. Application-layer protocols move fast conceptually (DHCP,
// DNS, HTTP, TLS) but they all still ride on the same Transport/Network/Data
// Link/Physical layers built in Phases 2-4 — this keeps that visible instead
// of implying application protocols float on their own.

const LAYERS = ["Application", "Transport", "Network", "Data Link", "Physical"];

interface Props {
  active: string; // one of LAYERS
}

export default function StackIndicator({ active }: Props) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-neutral-800">
      {LAYERS.map((layer) => {
        const isActive = layer === active;
        return (
          <div
            key={layer}
            className={`flex-1 text-center py-1.5 text-[10px] font-mono border-r last:border-r-0 border-neutral-800 transition-colors duration-300 ${
              isActive ? "bg-indigo-500/20 text-indigo-200 font-bold" : "bg-neutral-900 text-neutral-600"
            }`}
          >
            {layer}
          </div>
        );
      })}
    </div>
  );
}
