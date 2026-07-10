"use client";

import { useState } from "react";
import Link from "next/link";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import ThroughputChart from "@/components/experiments/ThroughputChart";
import {
  computeAlohaCurve, AlohaMode, AlohaCurveStep,
  ALOHA_THROUGHPUT_CODE, ALOHA_THROUGHPUT_ANNOTATIONS, ALOHA_THROUGHPUT_COMPLEXITY,
} from "@/lib/experiments/aloha-throughput-lab";

const phaseCaption: Record<string, string> = {
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const MAX_G = 2.5;
const MAX_S = 0.4;

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The exact closed-form throughput equations for Pure and Slotted ALOHA — no simulation, no randomness. Stepping forward draws the curve one point at a time instead of moving a packet." },
  { heading: "How to use it", body: "Pick a mode and run it. Scrub to watch the curve rise then fall as offered load increases past the peak." },
  { heading: "Why it matters", body: "This is the aggregate mathematical behavior behind the discrete collision scenarios on the Medium Access Control page — one specific collision there, versus every possible offered load here." },
];

export default function AlohaThroughputLabPage() {
  const [mode, setMode] = useState<AlohaMode>("pure");
  const [steps, setSteps] = useState<AlohaCurveStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(computeAlohaCurve(mode, MAX_G, 0.05));

  const annotation = currentStep ? ALOHA_THROUGHPUT_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{mode === "pure" ? "Pure ALOHA" : "Slotted ALOHA"} — Analytical Lab</span>
        <Link href="/mac-protocols" className="text-xs text-indigo-400 hover:text-indigo-300">See the discrete version &rarr;</Link>
      </div>

      {steps.length > 0 ? (
        <ThroughputChart points={currentStep?.points ?? []} maxG={MAX_G} maxS={MAX_S} currentG={currentStep?.currentG} currentS={currentStep?.currentS} />
      ) : (
        <p className="text-xs text-neutral-600 italic text-center py-12">Run a mode from the Run tab to draw the curve.</p>
      )}

      {steps.length > 0 && currentStep && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{currentStep.explanation}</span>
          <span className="ml-auto text-xs opacity-50 shrink-0">step {step + 1}/{steps.length}</span>
        </div>
      )}
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "run",
          label: "Run",
          content: (
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {(["pure", "slotted"] as AlohaMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setSteps([]); }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"}`}>
                    {m === "pure" ? "Pure ALOHA" : "Slotted ALOHA"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Draw Curve
              </button>
            </div>
          ),
        },
        {
          id: "details",
          label: "Details",
          content: (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Time</div>
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{ALOHA_THROUGHPUT_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ALOHA_THROUGHPUT_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ALOHA_THROUGHPUT_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ALOHA_THROUGHPUT_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={`ALOHA Throughput (${mode})`} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Draw the curve to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="ALOHA Throughput Curve"
      phaseLabel="Experiments · Analytical Lab"
      helpTitle="ALOHA Throughput Curve"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Draw the curve from the Run tab to start playback.</p>
        )
      }
    />
  );
}
