"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import PacketInspector from "@/components/shared/PacketInspector";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  encapsulationDemo,
  EncapsulationStep,
  ENCAPSULATION_CODE,
  ENCAPSULATION_ANNOTATIONS,
  ENCAPSULATION_COMPLEXITY,
} from "@/lib/encapsulation-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  delete: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const DEFAULT_PAYLOAD = "GET /index.html HTTP/1.1";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Wraps application data in a TCP, then IP, then Ethernet header on the way out — then unwraps it in exactly reverse order on the receiver." },
  { heading: "How to use it", body: "Type any text as the application data, click Run, then scrub the timeline. Watch the layer stack in the canvas grow outward, then shrink back down." },
  { heading: "Why it matters", body: "Encapsulation is the mechanism every protocol in this project rides on top of — this is the animation the rest of the site builds meaning from." },
];

export default function EncapsulationPage() {
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [steps, setSteps] = useState<EncapsulationStep[]>(() => encapsulationDemo(DEFAULT_PAYLOAD));

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(encapsulationDemo(payload || DEFAULT_PAYLOAD));

  const annotation = currentStep ? ENCAPSULATION_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">
          {currentStep?.direction === "unwrap" ? "Receiver — unwrapping" : "Sender — wrapping"}
        </span>
        <span className="text-xs text-neutral-500">{currentStep?.layers.length ?? 0} layer(s)</span>
      </div>
      <PacketInspector layers={currentStep?.layers ?? []} activeLayerIndex={currentStep?.activeLayerIndex ?? undefined} />
      {currentStep && (
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
          id: "payload",
          label: "Payload",
          content: (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400 leading-relaxed">
                Every layer wraps the one above it in its own header — the payload itself is never modified.
              </p>
              <div className="flex flex-col gap-1">
                <label htmlFor="encap-payload" className="text-xs text-neutral-400 uppercase tracking-wider">Application data</label>
                <input
                  id="encap-payload"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder={DEFAULT_PAYLOAD}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleRun}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Run
              </button>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Time</div>
                  <div className="text-lg font-bold text-indigo-400">{ENCAPSULATION_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{ENCAPSULATION_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ENCAPSULATION_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ENCAPSULATION_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer
              algorithm="Encapsulation"
              stepExplanation={currentStep.explanation}
              stepIndex={step}
              totalSteps={steps.length}
            />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the demo to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Encapsulation"
      phaseLabel="Phase 1 · Foundation"
      helpTitle="Encapsulation"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        <Controls
          docked
          step={step} total={steps.length} playing={playing} speed={speed}
          onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
          onReset={reset} onSpeedChange={setSpeed}
        />
      }
    />
  );
}
