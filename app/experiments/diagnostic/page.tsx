"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { JOURNEY_STAGES } from "@/lib/browser-journey";
import {
  simulateDiagnostic, FailureType, DiagnosticStep,
  DIAGNOSTIC_CODE, DIAGNOSTIC_ANNOTATIONS, DIAGNOSTIC_COMPLEXITY, FAILURE_LABELS,
} from "@/lib/experiments/diagnostic-lab";

const phaseCaption: Record<string, string> = {
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const FAILURE_TYPES: FailureType[] = ["dns-down", "arp-no-reply", "gateway-down", "port-closed"];
const STAGES = JOURNEY_STAGES.filter((s) => s.id !== "render");

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The same browser-journey stages (DHCP, DNS, ARP, Ethernet, IP, TCP, ...) as the Browser Journey capstone, but with a real failure injected at one specific point — everything before it succeeds, everything after it never happens." },
  { heading: "How to use it", body: "Pick a failure scenario and run it. Watch the checklist go green stage by stage until it hits red, then read why it failed and what to check." },
  { heading: "Why it matters", body: "This is closer to real troubleshooting than any other page: you only ever see \"it doesn't work,\" not which layer is responsible — the point here is learning to narrow that down." },
];

function StatusIcon({ outcome }: { outcome: "ok" | "failed" | "pending" }) {
  if (outcome === "ok") return <span className="text-emerald-400">&#10003;</span>;
  if (outcome === "failed") return <span className="text-red-400">&#10007;</span>;
  return <span className="text-neutral-700">&middot;</span>;
}

export default function DiagnosticLabPage() {
  const [failureType, setFailureType] = useState<FailureType>("dns-down");
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateDiagnostic(failureType));

  const annotation = currentStep ? DIAGNOSTIC_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const stepsSoFar = steps.slice(0, step + 1);
  const stageStatus = (stageId: string): "ok" | "failed" | "pending" => {
    const found = stepsSoFar.find((s) => s.stageId === stageId);
    return found?.outcome ?? "pending";
  };

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Diagnostic Lab — {FAILURE_LABELS[failureType]}</span>
      </div>

      <div className="space-y-1.5 max-w-md mx-auto">
        {STAGES.map((stage) => {
          const status = stageStatus(stage.id);
          return (
            <div key={stage.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs font-mono transition-all duration-300 ${
              status === "failed" ? "bg-red-500/15 border-red-500/40 text-red-200" :
              status === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" :
              "bg-neutral-900 border-neutral-800 text-neutral-600"
            }`}>
              <StatusIcon outcome={status} />
              <span>{stage.label}</span>
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
                {FAILURE_TYPES.map((f) => (
                  <button key={f} type="button" onClick={() => setFailureType(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      failureType === f ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}>
                    {FAILURE_LABELS[f]}
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{DIAGNOSTIC_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{DIAGNOSTIC_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{DIAGNOSTIC_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={DIAGNOSTIC_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={`Diagnostic Lab — ${FAILURE_LABELS[failureType]}`} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a scenario to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Diagnostic Lab"
      phaseLabel="Experiments · Diagnostic Lab"
      helpTitle="Diagnostic Lab"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a scenario from the Run tab to start playback.</p>
        )
      }
    />
  );
}
