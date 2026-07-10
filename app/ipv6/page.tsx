"use client";

import { useState } from "react";
import Link from "next/link";
import RouteHelp from "@/components/shared/RouteHelp";
import Logo from "@/components/shared/Logo";
import { IPV6_TOPICS } from "@/lib/ipv6-reference";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A reference, not a simulation — five things that make IPv6 different from the IPv4 the rest of this project simulates, each contrasted directly against it." },
  { heading: "How to use it", body: "Click a topic. Every one links back to wherever this project already builds the IPv4 equivalent." },
];

export default function IPv6Page() {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">6</div>
          <h1 className="text-xl font-bold truncate">IPv6 Fundamentals</h1>
          <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline">
            Enterprise Networking
          </span>
        </div>
        <RouteHelp title="IPv6 Fundamentals" sections={HELP_SECTIONS} />
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <p className="text-sm text-neutral-400 leading-relaxed">
          Everything else in this project speaks{" "}
          <Link href="/ipv4" className="text-indigo-400 hover:text-indigo-300">IPv4</Link> — this is where its
          successor gets explained, side by side with what you already know.
        </p>

        <div className="space-y-2">
          {IPV6_TOPICS.map((topic, i) => {
            const isOpen = expanded === i;
            return (
              <div key={topic.name} className="bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-neutral-800/40 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{topic.name}</div>
                    <div className="text-xs text-neutral-500">{topic.short}</div>
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
                    <p className="text-sm text-neutral-300 leading-relaxed">{topic.detail}</p>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Example</span>
                      <p className="text-xs text-indigo-300 font-mono leading-relaxed mt-1 break-all">{topic.example}</p>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Compared to IPv4</span>
                      <p className="text-xs text-neutral-400 leading-relaxed mt-1">{topic.ipv4Contrast}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
