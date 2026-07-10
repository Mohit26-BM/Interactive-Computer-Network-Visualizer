"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildLanTopology } from "@/lib/topology-engine";
import {
  simulateArpOverTime, ArpTimeoutStep,
  ARP_TIMEOUT_CODE, ARP_TIMEOUT_ANNOTATIONS, ARP_TIMEOUT_COMPLEXITY,
} from "@/lib/experiments/arp-timeout-lab";

const phaseCaption: Record<string, string> = {
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-amber-500/15 border-amber-500/30 text-amber-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const ATTEMPTS = 4;
const INTERVAL_SECONDS = 10;

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The exact same ARP resolution from the ARP page, run 4 times in a row with a simulated 10-second gap between attempts — but with a configurable cache timeout, so you can see how often the broadcast has to happen again." },
  { heading: "How to use it", body: "Set the timeout below or above 10 seconds and run it. A short timeout forces a fresh broadcast almost every attempt; a long one keeps the cache warm across all of them." },
  { heading: "Why it matters", body: "Real ARP caches expire after tens of minutes specifically to balance this tradeoff — mostly-warm cache, but not stale forever if a device's MAC ever changes." },
];

export default function ArpTimeoutLabPage() {
  const [topology] = useState(() => buildLanTopology());
  const [timeoutSeconds, setTimeoutSeconds] = useState(5);
  const [steps, setSteps] = useState<ArpTimeoutStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateArpOverTime(topology, "PC-1", "PC-2", timeoutSeconds, ATTEMPTS, INTERVAL_SECONDS));

  const annotation = currentStep ? ARP_TIMEOUT_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">ARP Cache Timeout — Parameter Lab</span>
        {currentStep && <span className="text-xs text-neutral-500 font-mono">attempt {Math.min(currentStep.attemptIndex + 1, ATTEMPTS)}/{ATTEMPTS}</span>}
      </div>
      <TopologyVisualizer
        state={topology}
        highlightDevices={currentStep?.highlightDevices}
        highlightLinks={currentStep?.highlightLinks}
        phase={currentStep?.phase}
      />
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
              <p className="text-xs text-neutral-500 leading-relaxed">PC-1 resolves PC-2&apos;s MAC {ATTEMPTS} times, {INTERVAL_SECONDS}s apart.</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Cache timeout (seconds)</label>
                <input type="number" min={1} max={120} value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run
              </button>
              <p className="text-[11px] text-neutral-600">Try 5s (shorter than the 10s gap — expires every time) vs 60s (much longer — never expires).</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{ARP_TIMEOUT_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ARP_TIMEOUT_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ARP_TIMEOUT_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ARP_TIMEOUT_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="ARP Cache Timeout" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the experiment to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="ARP Cache Timeout"
      phaseLabel="Experiments · Parameter Lab"
      helpTitle="ARP Cache Timeout"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run the experiment from the Run tab to start playback.</p>
        )
      }
    />
  );
}
