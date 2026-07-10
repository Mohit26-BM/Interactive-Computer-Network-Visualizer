"use client";

import { useState, useMemo } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import Controls from "@/components/shared/Controls";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateMac, MacMode, MacStep, BarOutcome, TransmissionBar,
  MAC_CODE, MAC_ANNOTATIONS, MAC_COMPLEXITY,
} from "@/lib/mac-protocols-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const OUTCOME_CLASS: Record<BarOutcome, string> = {
  success: "bg-emerald-500/25 border-emerald-500/50",
  collision: "bg-red-500/25 border-red-500/50",
  aborted: "bg-amber-500/25 border-amber-500/50",
};

const MODES: { value: MacMode; label: string }[] = [
  { value: "aloha", label: "Pure ALOHA" },
  { value: "slotted-aloha", label: "Slotted ALOHA" },
  { value: "csma", label: "CSMA" },
  { value: "csma-cd", label: "CSMA/CD" },
  { value: "csma-ca", label: "CSMA/CA" },
];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Simulates several stations sharing one medium with no switch arbitrating — the progressively smarter strategies (no coordination, slots, carrier sense, collision detection, collision avoidance) invented to make that workable." },
  { heading: "How to use it", body: "Pick a mode and run it. The same kind of near-simultaneous transmission attempt is used across most modes, so you can watch exactly how each strategy handles (or fails to handle) it differently." },
  { heading: "Why it matters", body: "Everything else in this project assumes switches, which solve this problem entirely by giving every device its own collision domain. This is the contention problem switches exist to solve." },
];

function Timeline({ bars, allBars }: { bars: TransmissionBar[]; allBars: TransmissionBar[] }) {
  const stations = useMemo(() => Array.from(new Set(allBars.map((b) => b.station))).sort((a, b) => a - b), [allBars]);
  const maxTick = useMemo(() => Math.max(4, ...allBars.map((b) => b.end)) + 1, [allBars]);

  return (
    <div className="space-y-2">
      {stations.map((s) => {
        const stationBars = bars.filter((b) => b.station === s);
        return (
          <div key={s} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-mono text-neutral-500">Station {s}</span>
            <div className="relative flex-1 h-7 bg-neutral-900 border border-neutral-800 rounded-md overflow-hidden">
              {stationBars.map((bar, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 border-2 rounded transition-all duration-300 ${OUTCOME_CLASS[bar.outcome]}`}
                  style={{ left: `${(bar.start / maxTick) * 100}%`, width: `${((bar.end - bar.start) / maxTick) * 100}%` }}
                  title={`t=${bar.start}-${bar.end}: ${bar.outcome}`}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0" />
        <div className="flex-1 flex justify-between text-[10px] text-neutral-600 font-mono">
          <span>t=0</span>
          <span>t={maxTick}</span>
        </div>
      </div>
    </div>
  );
}

export default function MacProtocolsPage() {
  const [mode, setMode] = useState<MacMode>("aloha");
  const [steps, setSteps] = useState<MacStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateMac(mode));

  const annotation = currentStep ? MAC_ANNOTATIONS[mode][currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const complexity = MAC_COMPLEXITY[mode];

  const allBars = useMemo(() => (steps.length ? steps[steps.length - 1].bars : []), [steps]);
  const bars = currentStep?.bars ?? [];

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{MODES.find((m) => m.value === mode)?.label}</span>
        {currentStep && (
          <span className="text-xs text-neutral-500 font-mono">
            attempts {currentStep.attempts} &middot; success {currentStep.successes} &middot; collision/abort {currentStep.collisions}
          </span>
        )}
      </div>

      {allBars.length > 0 ? (
        <Timeline bars={bars} allBars={allBars} />
      ) : (
        <p className="text-xs text-neutral-600 italic">Run a mode from the Send tab to see the timeline.</p>
      )}

      <div className="flex gap-4 text-xs text-neutral-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/25 border border-emerald-500/50 inline-block" /> success</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/25 border border-red-500/50 inline-block" /> collision</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/25 border border-amber-500/50 inline-block" /> aborted early (CD)</span>
      </div>

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
          id: "send",
          label: "Send",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                {MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => { setMode(m.value); setSteps([]); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      mode === m.value ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{complexity.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{complexity.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{complexity.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={MAC_CODE[mode]} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={`Medium Access Control — ${MODES.find((m) => m.value === mode)?.label}`} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a mode to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Medium Access Control"
      phaseLabel="Network Algorithms"
      helpTitle="Medium Access Control"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a mode from the Send tab to start playback.</p>
        )
      }
    />
  );
}
