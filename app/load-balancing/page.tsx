"use client";

import { useState, useMemo } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateRoundRobin, simulateWeightedRoundRobin, simulateLeastConnections, simulateIpHash, simulateFailureScenario,
  SERVERS, LbStep,
  LOAD_BALANCING_CODE, LOAD_BALANCING_ANNOTATIONS, LOAD_BALANCING_COMPLEXITY,
} from "@/lib/load-balancing-engine";

type Mode = "round-robin" | "weighted-round-robin" | "least-connections" | "ip-hash" | "failure";

const phaseCaption: Record<string, string> = {
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const MODES: { value: Mode; label: string }[] = [
  { value: "round-robin", label: "Round Robin" },
  { value: "weighted-round-robin", label: "Weighted Round Robin" },
  { value: "least-connections", label: "Least Connections" },
  { value: "ip-hash", label: "IP Hash" },
  { value: "failure", label: "Server Failure" },
];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A fixed sequence of requests hits a load balancer in front of a 3-server pool — five tabs, five different rules for deciding which server gets each request." },
  { heading: "How to use it", body: "Pick an algorithm and run it. Scrub through and watch each request land, then check the distribution at the bottom — Round Robin split evenly, Weighted favors Server A, Least Connections adapts to load, IP Hash always sends the same client to the same server, and Server Failure shows the pool reroute around an unhealthy server mid-run." },
  { heading: "Why it matters", body: "This is the last piece connecting \"how does one computer talk to another\" to \"how does a real web app serve millions of users\" — DNS gets you to a load balancer, not directly to a server." },
];

function runMode(mode: Mode): LbStep[] {
  if (mode === "round-robin") return simulateRoundRobin();
  if (mode === "weighted-round-robin") return simulateWeightedRoundRobin();
  if (mode === "least-connections") return simulateLeastConnections();
  if (mode === "ip-hash") return simulateIpHash();
  return simulateFailureScenario();
}

export default function LoadBalancingPage() {
  const [mode, setMode] = useState<Mode>("round-robin");
  const [steps, setSteps] = useState<LbStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => { reset(); setSteps(runMode(mode)); };

  const codeKey = mode;
  const annotation = currentStep ? LOAD_BALANCING_ANNOTATIONS[codeKey][currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const complexity = LOAD_BALANCING_COMPLEXITY[codeKey];

  const lastEvent = currentStep?.events[currentStep.events.length - 1];
  const maxDist = useMemo(() => Math.max(1, ...(currentStep ? Object.values(currentStep.distribution) : [1])), [currentStep]);

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{MODES.find((m) => m.value === mode)?.label}</span>
        {currentStep && <span className="text-xs text-neutral-500 font-mono">{currentStep.events.length} request{currentStep.events.length === 1 ? "" : "s"} routed</span>}
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        <div className={`px-3 py-2 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${lastEvent ? "bg-indigo-500/20 border-indigo-400 text-indigo-200" : "bg-neutral-900 border-neutral-700 text-neutral-400"}`}>
          Client
        </div>
        <div className={`w-14 h-px transition-all duration-300 ${lastEvent ? "bg-indigo-400" : "bg-neutral-700"}`} />
        <div className="px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-mono text-center text-neutral-300">
          Load Balancer
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {SERVERS.map((s) => {
          const isTarget = lastEvent?.server === s;
          const isHealthy = currentStep?.healthy[s] ?? true;
          const count = currentStep?.distribution[s] ?? 0;
          return (
            <div key={s} className={`rounded-xl border p-3 space-y-2 transition-all duration-300 ${
              !isHealthy ? "bg-red-500/10 border-red-500/40 opacity-60" :
              isTarget ? "bg-indigo-500/20 border-indigo-400" : "bg-neutral-900 border-neutral-700"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-neutral-200">{s}</span>
                {!isHealthy && <span className="text-[10px] text-red-400 font-mono uppercase">down</span>}
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(count / maxDist) * 100}%` }} />
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">{count} request{count === 1 ? "" : "s"}</div>
            </div>
          );
        })}
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
          id: "run",
          label: "Run",
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
          content: <CodePanel lines={LOAD_BALANCING_CODE[codeKey]} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={`Load Balancing — ${MODES.find((m) => m.value === mode)?.label}`} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run an algorithm to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Load Balancing"
      phaseLabel="Application Layer"
      helpTitle="Load Balancing"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run an algorithm from the Run tab to start playback.</p>
        )
      }
    />
  );
}
