"use client";

import Link from "next/link";
import RouteHelp from "@/components/shared/RouteHelp";
import Logo from "@/components/shared/Logo";
import { LEARNING_PATH } from "@/lib/learning-path";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The full curriculum in the order it's meant to be learned, grouped by what each stage assumes you already know — not by build phase." },
  { heading: "How to use it", body: "Start at the top and work down. Each group's rationale explains why it comes where it does, not just what's in it." },
];

const totalBuilt = LEARNING_PATH.reduce((sum, g) => sum + g.topics.filter((t) => t.built).length, 0);
const totalTopics = LEARNING_PATH.reduce((sum, g) => sum + g.topics.length, 0);

export default function LearningPathPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">&#8623;</div>
          <h1 className="text-xl font-bold truncate">Learning Path</h1>
          <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline">
            {totalBuilt}/{totalTopics} built
          </span>
        </div>
        <RouteHelp title="Learning Path" sections={HELP_SECTIONS} />
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <p className="text-sm text-neutral-400 leading-relaxed">
          Every phase on this site was built in project order — this page is the same material in{" "}
          <em>learning</em> order: what to know before moving to the next thing, and why.
        </p>

        <div className="space-y-6">
          {LEARNING_PATH.map((group, gi) => (
            <div key={group.title} className="relative pl-8">
              {gi < LEARNING_PATH.length - 1 && (
                <div className="absolute left-[15px] top-9 bottom-[-24px] w-px bg-neutral-800" />
              )}
              <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center">
                {gi + 1}
              </div>
              <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-bold text-white">{group.title}</h2>
                <p className="text-sm text-neutral-400 leading-relaxed">{group.rationale}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {group.topics.map((t) =>
                    t.built && t.href ? (
                      <Link
                        key={t.label}
                        href={t.href}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-200 hover:bg-indigo-600/20 hover:text-indigo-200 border border-neutral-700 hover:border-indigo-500/40 transition-colors"
                      >
                        <span className="text-emerald-400">&#10003;</span>
                        {t.label}
                      </Link>
                    ) : (
                      <span
                        key={t.label}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-950 text-neutral-600 border border-neutral-800 italic"
                      >
                        {t.label}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
