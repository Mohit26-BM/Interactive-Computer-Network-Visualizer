"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateFlowControl, FlowControlStep,
  TCP_FLOW_CONTROL_CODE, TCP_FLOW_CONTROL_ANNOTATIONS, TCP_FLOW_CONTROL_COMPLEXITY,
} from "@/lib/tcp-flow-control-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const BUFFER_CAPACITY = 3;
const TOTAL_SEGMENTS = 8;
const APP_READ_RATE = 1;
const READ_EVERY = 3;

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A receiver's buffer fills up because its application reads slowly — the advertised window (rwnd) shrinks as the buffer fills, and can hit zero, forcing the sender to pause entirely." },
  { heading: "How to use it", body: "Click Start Transfer and step through. Watch rwnd shrink with every segment sent, and watch what happens once it hits zero." },
  { heading: "Why it matters", body: "This is a completely different problem from congestion control: nothing here implies the network is struggling — only that this one receiver is slow to read what it's been sent." },
];

export default function TcpFlowControlPage() {
  const [steps, setSteps] = useState<FlowControlStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleStart = () => setSteps(simulateFlowControl(BUFFER_CAPACITY, TOTAL_SEGMENTS, APP_READ_RATE, READ_EVERY));

  const annotation = currentStep ? TCP_FLOW_CONTROL_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const filled = currentStep?.bufferFilled ?? 0;
  const capacity = currentStep?.bufferCapacity ?? BUFFER_CAPACITY;
  const rwnd = currentStep?.advertisedWindow ?? capacity;
  const sent = currentStep?.segmentsSent ?? 0;
  const isZero = rwnd === 0;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Receiver buffer</span>
        <span className="text-xs text-neutral-500 font-mono">{sent}/{TOTAL_SEGMENTS} segments sent</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Buffer</span>
            <span className="font-mono">{filled}/{capacity}</span>
          </div>
          <div className="h-6 rounded-lg overflow-hidden border border-neutral-800 flex">
            {Array.from({ length: capacity }, (_, i) => (
              <div key={i} className={`flex-1 border-r last:border-r-0 border-neutral-800 transition-colors duration-300 ${i < filled ? "bg-amber-500/40" : "bg-neutral-950"}`} />
            ))}
          </div>
        </div>
        <div className={`w-24 shrink-0 border rounded-xl p-3 text-center transition-colors duration-300 ${isZero ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">rwnd</div>
          <div className="text-xl font-mono font-bold">{rwnd}</div>
        </div>
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
              <p className="text-xs text-neutral-500 leading-relaxed">
                Buffer capacity {BUFFER_CAPACITY}, {TOTAL_SEGMENTS} segments to send, application reads {APP_READ_RATE} unit
                every {READ_EVERY} segments sent — fixed so a zero window is guaranteed to happen at least once.
              </p>
              <button type="button" onClick={handleStart} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Start Transfer
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
                  <div className="text-lg font-bold text-indigo-400">{TCP_FLOW_CONTROL_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{TCP_FLOW_CONTROL_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_FLOW_CONTROL_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_FLOW_CONTROL_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Flow Control" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Start a transfer to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Flow Control"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Flow Control"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Start a transfer from the Send tab to start playback.</p>
        )
      }
    />
  );
}
