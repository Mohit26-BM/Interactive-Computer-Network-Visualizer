"use client";

import { useEffect, useRef, useState } from "react";

interface HelpSection {
  heading: string;
  body: string;
}

interface Props {
  title: string;
  sections: HelpSection[];
}

export default function RouteHelp({ title, sections }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="How this page works"
        className={`w-8 h-8 rounded-xl border flex items-center justify-center text-sm font-semibold transition-colors ${
          open
            ? "bg-indigo-600 border-indigo-500 text-white"
            : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-600"
        }`}
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-neutral-900 border border-neutral-700 rounded-xl shadow-lg shadow-black/20 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-neutral-500 hover:text-white transition-colors text-xs leading-none"
            >
              &#10005;
            </button>
          </div>
          <div className="px-4 py-3 space-y-3 max-h-96 overflow-y-auto">
            {sections.map((s) => (
              <div key={s.heading}>
                <div className="text-xs font-semibold text-indigo-300 mb-1">{s.heading}</div>
                <p className="text-xs text-neutral-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
