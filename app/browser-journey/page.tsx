"use client";

import { useState } from "react";
import Link from "next/link";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import StackIndicator from "@/components/shared/StackIndicator";
import AIExplainer from "@/components/shared/AIExplainer";
import { JOURNEY_STAGES } from "@/lib/browser-journey";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Ties every protocol you've explored into one story: what actually happens when you type \"google.com\" and press enter, from no IP address at all to a rendered page." },
  { heading: "How to use it", body: "Click any stage to see what it does and why it comes where it does. Click \"Open the ... simulator\" to jump into that stage's real, fully-built page — nothing here is a re-simulation, it's the same visualizer you've already used." },
  { heading: "Why it matters", body: "Every phase so far taught one piece in isolation. This is where those pieces turn out to be one continuous story." },
];

export default function BrowserJourneyPage() {
  const [index, setIndex] = useState(0);
  const stage = JOURNEY_STAGES[index];
  const isFirst = index === 0;
  const isLast = index === JOURNEY_STAGES.length - 1;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-neutral-500 text-xs font-mono">You typed:</p>
        <p className="text-2xl font-bold tracking-tight text-indigo-300 font-mono">google.com</p>
      </div>

      <StackIndicator active={stage.layer} />

      <div className="flex gap-2 flex-wrap">
        {JOURNEY_STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all duration-200 ${
              i === index
                ? "bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-400/40"
                : i < index
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
            }`}
          >
            <span className="font-mono opacity-60">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-neutral-500">Stage {index + 1}/{JOURNEY_STAGES.length}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">{stage.layer}</span>
        </div>
        <h2 className="text-lg font-bold text-white">{stage.label}</h2>
        <p className="text-sm text-indigo-200 italic">{stage.description}</p>
        <p className="text-sm text-neutral-400 leading-relaxed">{stage.detail}</p>
        {stage.href && (
          <Link
            href={stage.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
          >
            {stage.linkLabel} &rarr;
          </Link>
        )}
      </div>
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "explain",
          label: "Explain",
          content: (
            <AIExplainer
              algorithm="Browser Journey"
              stepExplanation={`${stage.label}: ${stage.description} ${stage.detail}`}
              stepIndex={index}
              totalSteps={JOURNEY_STAGES.length}
            />
          ),
        },
        {
          id: "all-stages",
          label: "Overview",
          content: (
            <div className="space-y-2">
              {JOURNEY_STAGES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    i === index ? "bg-indigo-600/20 text-indigo-200 border border-indigo-500/40" : "bg-neutral-800 text-neutral-400 hover:text-white border border-transparent"
                  }`}
                >
                  <span className="font-mono opacity-60 mr-1.5">{i + 1}.</span>{s.label}
                </button>
              ))}
            </div>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Browser Journey"
      phaseLabel="Phase 5 · Capstone"
      helpTitle="Browser Journey"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isFirst ? "text-neutral-700 cursor-not-allowed" : "text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700"}`}
          >
            &larr; Previous
          </button>
          <span className="text-xs text-neutral-500 font-mono">{stage.label} ({index + 1}/{JOURNEY_STAGES.length})</span>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(JOURNEY_STAGES.length - 1, i + 1))}
            disabled={isLast}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLast ? "text-neutral-700 cursor-not-allowed" : "text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700"}`}
          >
            Next &rarr;
          </button>
        </div>
      }
    />
  );
}
