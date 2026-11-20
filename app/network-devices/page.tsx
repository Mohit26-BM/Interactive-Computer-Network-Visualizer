"use client";

import { useState } from "react";
import Link from "next/link";
import RouteHelp from "@/components/shared/RouteHelp";
import Logo from "@/components/shared/Logo";
import { NETWORK_DEVICES } from "@/lib/network-devices";
import SiteFooter from "@/components/shared/SiteFooter";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A reference, not a simulation — click any device to see which OSI layer it operates at, what unit it forwards, and how it affects collision/broadcast domains." },
  { heading: "How to use it", body: "You've already placed most of these in the Network Lab — this is where their behavior gets explained." },
];

export default function NetworkDevicesPage() {
  const [expanded, setExpanded] = useState<number | null>(2); // Switch, open by default

  return (
    <div className="min-h-screen flex flex-col text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">&#9635;</div>
          <h1 className="text-xl font-bold truncate">Network Devices</h1>
          <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline">
            Phase 1 &middot; Foundation
          </span>
        </div>
        <RouteHelp title="Network Devices" sections={HELP_SECTIONS} />
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <p className="text-sm text-neutral-400 leading-relaxed">
          You&apos;ve already placed PCs, switches, and routers in the{" "}
          <Link href="/topology" className="text-indigo-400 hover:text-indigo-300">Network Lab</Link> — this is
          where each one&apos;s actual behavior gets spelled out, layer by layer.
        </p>

        <div className="space-y-2">
          {NETWORK_DEVICES.map((device, i) => {
            const isOpen = expanded === i;
            return (
              <div key={device.name} className="bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-neutral-800/40 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{device.name}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">{device.osiLayer}</span>
                    </div>
                    <div className="text-xs text-neutral-500">{device.short}</div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 space-y-3 border-t border-neutral-800">
                    <p className="text-sm text-neutral-300 leading-relaxed">{device.detail}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Forwards</span>
                        <p className="text-xs text-neutral-400 leading-relaxed mt-1">{device.forwardingUnit}</p>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Collision domain</span>
                        <p className="text-xs text-neutral-400 leading-relaxed mt-1">{device.collisionDomain}</p>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Broadcast domain</span>
                        <p className="text-xs text-neutral-400 leading-relaxed mt-1">{device.broadcastDomain}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] text-neutral-600 uppercase tracking-wider font-mono">Built here:</span>
                      {device.buildsHere.map((b) =>
                        b.href ? (
                          <Link key={b.label} href={b.href} className="text-xs text-indigo-400 hover:text-indigo-300 font-mono underline decoration-indigo-500/30 underline-offset-2">
                            {b.label}
                          </Link>
                        ) : (
                          <span key={b.label} className="text-xs text-neutral-500 font-mono italic">{b.label}</span>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
