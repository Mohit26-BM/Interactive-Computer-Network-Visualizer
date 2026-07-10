"use client";

import { useState } from "react";
import Link from "next/link";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import Controls from "@/components/shared/Controls";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  compareReliableTransmission, ReliableTransmissionStep, SegmentStatus, TrackSegment,
  RELIABLE_TRANSMISSION_CODE, RELIABLE_TRANSMISSION_ANNOTATIONS, RELIABLE_TRANSMISSION_COMPLEXITY,
} from "@/lib/reliable-transmission-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STATUS_CLASS: Record<SegmentStatus, string> = {
  pending: "bg-neutral-900 border-neutral-700 text-neutral-600",
  "in-flight": "bg-indigo-500/15 border-indigo-500/40 text-indigo-300",
  lost: "bg-red-500/10 border-red-500/30 text-red-300",
  buffered: "bg-amber-500/15 border-amber-500/40 text-amber-300",
  acked: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
};

const TOTAL_SEGMENTS = 6;
const WINDOW_SIZE = 4;

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Runs the exact same loss — one segment lost inside the first window — through both Go-Back-N and Selective Repeat at once, so their recovery strategies can be compared step by step instead of read about separately." },
  { heading: "How to use it", body: "Pick which segment gets lost (it has to fall within the first window) and click Run. Watch what happens to the segments that arrive *after* the loss — Go-Back-N throws them away, Selective Repeat keeps them." },
  { heading: "Why it matters", body: "TCP Data Transfer showed stop-and-wait and TCP Sliding Window showed pipelining succeeding — this is what pipelining does when something actually gets lost, and why the two textbook answers to that differ so much in efficiency." },
];

function Track({ label, segments }: { label: string; segments: TrackSegment[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-mono text-neutral-400 uppercase tracking-wider">{label}</div>
      <div className="flex gap-1.5 flex-wrap">
        {segments.map((s) => (
          <div key={s.index} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-sm font-mono font-bold transition-all duration-300 ${STATUS_CLASS[s.status]}`}>
            {s.index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReliableTransmissionPage() {
  const [lossIndex, setLossIndex] = useState(1);
  const [steps, setSteps] = useState<ReliableTransmissionStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(compareReliableTransmission(TOTAL_SEGMENTS, WINDOW_SIZE, lossIndex));

  const annotation = currentStep ? RELIABLE_TRANSMISSION_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const gbn = currentStep?.gbn ?? Array.from({ length: TOTAL_SEGMENTS }, (_, i) => ({ index: i, status: "pending" as SegmentStatus }));
  const sr = currentStep?.sr ?? Array.from({ length: TOTAL_SEGMENTS }, (_, i) => ({ index: i, status: "pending" as SegmentStatus }));

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Same loss, two recovery strategies</span>
        {currentStep && (
          <span className="text-xs text-neutral-500 font-mono">
            sent: GBN {currentStep.gbnSent} &middot; SR {currentStep.srSent}
          </span>
        )}
      </div>

      <div className="space-y-4">
        <Track label="Go-Back-N" segments={gbn} />
        <Track label="Selective Repeat" segments={sr} />
      </div>

      <div className="flex gap-4 text-xs text-neutral-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-800 border border-neutral-700 inline-block" /> pending</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/20 border border-indigo-500/40 inline-block" /> in flight</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/10 border border-red-500/30 inline-block" /> lost</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/40 inline-block" /> buffered (SR only)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 inline-block" /> acked</span>
      </div>

      {steps.length > 0 && currentStep && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{currentStep.explanation}</span>
          <span className="ml-auto text-xs opacity-50 shrink-0">step {step + 1}/{steps.length}</span>
        </div>
      )}

      <p className="text-xs text-neutral-600">
        See stop-and-wait in <Link href="/tcp/data-transfer" className="text-indigo-400 hover:text-indigo-300">TCP Data Transfer</Link>, and
        successful pipelining in <Link href="/tcp/window" className="text-indigo-400 hover:text-indigo-300">TCP Sliding Window</Link>.
      </p>
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
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Lose which segment?</span>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: WINDOW_SIZE }, (_, i) => i).map((i) => (
                    <button key={i} type="button" onClick={() => setLossIndex(i)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        lossIndex === i ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                      }`}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-neutral-500">{TOTAL_SEGMENTS} segments total, window size {WINDOW_SIZE} — fixed so the recovery difference is always visible.</p>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run Comparison
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{RELIABLE_TRANSMISSION_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-xs font-bold text-violet-400 leading-snug">{RELIABLE_TRANSMISSION_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{RELIABLE_TRANSMISSION_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={RELIABLE_TRANSMISSION_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Reliable Transmission (Go-Back-N vs Selective Repeat)" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the comparison to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Reliable Transmission"
      phaseLabel="Network Algorithms"
      helpTitle="Reliable Transmission"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run the comparison from the Send tab to start playback.</p>
        )
      }
    />
  );
}
