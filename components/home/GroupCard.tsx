"use client";

import Link from "next/link";
import { ReactNode } from "react";

interface Props {
  href: string;
  preview: ReactNode;
  title: string;
  phase: string;
  blurb: string;
}

export default function GroupCard({ href, preview, title, phase, blurb }: Props) {
  return (
    <Link
      href={href}
      className="group bg-neutral-900 border border-neutral-700 hover:border-indigo-500/40 hover:-translate-y-0.5 rounded-xl p-5 flex items-center gap-5 transition-all duration-200"
    >
      <div className="w-24 h-24 shrink-0 rounded-lg bg-neutral-950/60 border border-neutral-800 flex items-center justify-center p-4 transition-shadow duration-300 group-hover:shadow-[0_0_16px_-4px_rgba(99,102,241,0.35)] group-hover:border-neutral-700">
        {preview}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-[10px] font-mono text-indigo-400/70 uppercase tracking-wider">{phase}</p>
        <h3 className="font-bold text-white text-base leading-tight">{title}</h3>
        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{blurb}</p>
      </div>

      <svg className="w-4 h-4 text-neutral-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
