"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface Props {
  href: string;
  preview: ReactNode;
  title: string;
  subtitle: string;
  badges: string[];
  description: string;
  disabled?: boolean;
  phaseTag?: string;
}

// Badge text is free-form across the site, but a handful of recurring words
// carry real semantic meaning — color them consistently instead of leaving
// every badge the same flat gray.
const BADGE_COLORS: [RegExp, string][] = [
  [/^interactive$|^playback$/i, "bg-blue-500/10 text-blue-300 border-blue-500/20"],
  [/^reference$/i, "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"],
  [/^flagship$/i, "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"],
  [/^calculator$/i, "bg-amber-500/10 text-amber-300 border-amber-500/20"],
  [/broadcast|switching|frame|simulation/i, "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"],
  [/header|dijkstra|ping|traceroute/i, "bg-violet-500/10 text-violet-300 border-violet-500/20"],
  [/connectionless|connection|reliability|congestion/i, "bg-teal-500/10 text-teal-300 border-teal-500/20"],
  [/DORA|resolution|request|response|TLS/i, "bg-rose-500/10 text-rose-300 border-rose-500/20"],
  [/capture|labs|terminal/i, "bg-amber-500/10 text-amber-300 border-amber-500/20"],
];

function badgeClass(label: string): string {
  for (const [pattern, cls] of BADGE_COLORS) {
    if (pattern.test(label)) return cls;
  }
  return "bg-neutral-800 text-neutral-400 border-neutral-700";
}

export default function TypeCard({ href, preview, title, subtitle, badges, description, disabled, phaseTag }: Props) {
  const content = (
    <>
      <div className={`w-full h-20 rounded-lg bg-neutral-950/60 border border-neutral-800 flex items-center justify-center p-3 transition-shadow duration-300 ${!disabled ? "group-hover:shadow-[0_0_16px_-4px_rgba(99,102,241,0.35)] group-hover:border-neutral-700" : ""}`}>
        {preview}
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {phaseTag && <p className="text-[10px] font-mono text-indigo-400/70 uppercase tracking-wider mb-0.5">{phaseTag}</p>}
          <h3 className="font-bold text-white text-base">{title}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        </div>
        {!disabled && (
          <svg className="w-4 h-4 text-neutral-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-200 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      <p className="text-sm text-neutral-400 leading-relaxed group-hover:text-neutral-300 transition-colors duration-300">{description}</p>

      <div className="flex flex-wrap gap-1.5 mt-auto">
        {badges.map((b) => (
          <span key={b} className={`text-[10px] border px-2 py-0.5 rounded-full font-mono ${badgeClass(b)}`}>
            {b}
          </span>
        ))}
      </div>
    </>
  );

  const className = "group bg-neutral-900 border border-neutral-700 hover:border-indigo-500/40 hover:-translate-y-0.5 rounded-xl p-5 flex flex-col gap-3 transition-all duration-200";

  if (disabled) {
    return (
      <div className="opacity-60 cursor-not-allowed bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-3">
        {content}
        <span className="text-[10px] text-neutral-600 uppercase tracking-wider">Not yet built</span>
      </div>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
