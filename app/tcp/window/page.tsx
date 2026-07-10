"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateSlidingWindow, TcpWindowStep, SegmentStatus,
  TCP_WINDOW_CODE, TCP_WINDOW_ANNOTATIONS, TCP_WINDOW_COMPLEXITY,
} from "@/lib/tcp-window-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STATUS_CLASS: Record<SegmentStatus, string> = {
  pending: "bg-neutral-900 border-neutral-700 text-neutral-600",
  "in-flight": "bg-indigo-500/15 border-indigo-500/40 text-indigo-300",
  acked: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
};

const TOTAL_SEGMENTS = 8;
const WINDOW_SIZES = [1, 2, 3, 4];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Shows several TCP segments in flight at once instead of one at a time — the window size caps how many can be unacknowledged simultaneously." },
  { heading: "How to use it", body: "Pick a window size and click Start Transfer. Watch the window fill up front, then slide forward one segment at a time as each ACK arrives." },
  { heading: "Why it matters", body: "Stop-and-wait (TCP Data Transfer) needs one round trip per segment. A sliding window needs roughly one round trip per windowSize segments — this is where TCP's real throughput comes from." },
];

export default function TcpWindowPage() {
  const [windowSize, setWindowSize] = useState(3);
  const [steps, setSteps] = useState<TcpWindowStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleStart = () => setSteps(simulateSlidingWindow(TOTAL_SEGMENTS, windowSize));

  const annotation = currentStep ? TCP_WINDOW_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const segments = currentStep?.segments ?? Array.from({ length: TOTAL_SEGMENTS }, (_, i) => ({ index: i, status: "pending" as SegmentStatus }));
  const windowStart = currentStep?.windowStart ?? 0;
  const winSize = currentStep?.windowSize ?? windowSize;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Segments</span>
        <span className="text-xs text-neutral-500 font-mono">window size {winSize}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {segments.map((s) => {
          const inWindow = s.index >= windowStart && s.index < windowStart + winSize;
          return (
            <div key={s.index} className="flex flex-col items-center gap-1">
              <div className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center text-sm font-mono font-bold transition-all duration-300 ${STATUS_CLASS[s.status]} ${inWindow ? "ring-2 ring-indigo-400/50" : ""}`}>
                {s.index + 1}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-800 border border-neutral-700 inline-block" /> pending</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/20 border border-indigo-500/40 inline-block" /> in flight</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/15 border border-emerald-500/30 inline-block" /> acked</span>
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
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Window size</span>
                <div className="flex gap-1.5">
                  {WINDOW_SIZES.map((w) => (
                    <button key={w} type="button" onClick={() => setWindowSize(w)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        windowSize === w ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                      }`}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-neutral-500">{TOTAL_SEGMENTS} segments total, fixed for comparison across window sizes.</p>
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
                  <div className="text-sm font-bold text-indigo-400">{TCP_WINDOW_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{TCP_WINDOW_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_WINDOW_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_WINDOW_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Sliding Window" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Start a transfer to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Sliding Window"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Sliding Window"
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
