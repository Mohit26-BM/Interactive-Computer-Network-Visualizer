"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateCongestionControl, CongestionRoundStep, CongestionEvent,
  TCP_CONGESTION_CODE, TCP_CONGESTION_ANNOTATIONS, TCP_CONGESTION_COMPLEXITY,
} from "@/lib/tcp-congestion-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const EVENT_COLOR: Record<CongestionEvent, string> = {
  "slow-start": "#818cf8",
  "congestion-avoidance": "#a78bfa",
  timeout: "#f87171",
  "fast-retransmit": "#fbbf24",
};

const ROUNDS = 20;
const INITIAL_SSTHRESH = 16;
const TIMEOUT_ROUNDS = [9];
const FAST_RETRANSMIT_ROUNDS = [16];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Tracks the congestion window (cwnd) round by round: exponential growth during slow start, linear growth during congestion avoidance, a harsh reset on a full timeout, and a milder reset on fast retransmit." },
  { heading: "How to use it", body: "Click Start Simulation and step through. Watch cwnd double while it's below the dashed ssthresh line, then grow by 1 above it — then watch the timeout at round 9 and the fast retransmit at round 16 behave differently." },
  { heading: "Why it matters", body: "This is how TCP shares a network it can't see the size of — probing for capacity, backing off hard when it clearly overshot, and backing off gently when the signal is milder." },
];

const WIDTH = 640;
const HEIGHT = 220;
const PAD = 30;

export default function TcpCongestionPage() {
  const [steps, setSteps] = useState<CongestionRoundStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleStart = () => setSteps(simulateCongestionControl(ROUNDS, INITIAL_SSTHRESH, TIMEOUT_ROUNDS, FAST_RETRANSMIT_ROUNDS));

  const annotation = currentStep ? TCP_CONGESTION_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const visible = steps.slice(0, step + 1);
  const maxCwnd = Math.max(20, ...steps.map((s) => s.cwnd));
  const xFor = (round: number) => PAD + (round / ROUNDS) * (WIDTH - PAD * 2);
  const yFor = (cwnd: number) => HEIGHT - PAD - (cwnd / maxCwnd) * (HEIGHT - PAD * 2);

  const points = visible.map((s) => `${xFor(s.round)},${yFor(s.cwnd)}`).join(" ");
  const ssthreshY = currentStep ? yFor(currentStep.ssthresh) : yFor(INITIAL_SSTHRESH);

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Congestion window over time</span>
        <span className="text-xs text-neutral-500 font-mono">round {currentStep?.round ?? 0}/{ROUNDS}</span>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-3">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
            <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#404040" strokeWidth={1} />
            <line x1={PAD} y1={PAD / 2} x2={PAD} y2={HEIGHT - PAD} stroke="#404040" strokeWidth={1} />
            <line x1={PAD} y1={ssthreshY} x2={WIDTH - PAD} y2={ssthreshY} stroke="#525252" strokeWidth={1.2} strokeDasharray="4 3" />
            <text x={WIDTH - PAD} y={ssthreshY - 4} textAnchor="end" fontSize={9} fill="#737373" fontFamily="monospace">ssthresh {currentStep?.ssthresh ?? INITIAL_SSTHRESH}</text>
            {points && <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={1.5} />}
            {visible.map((s) => (
              <circle key={s.round} cx={xFor(s.round)} cy={yFor(s.cwnd)} r={s.round === currentStep?.round ? 4 : 2.5} fill={EVENT_COLOR[s.event]} />
            ))}
          </svg>
        </div>
        <div className="w-24 shrink-0 flex flex-col gap-2">
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2 text-center">
            <div className="text-[10px] text-indigo-300 uppercase tracking-wider">cwnd</div>
            <div className="text-lg font-mono font-bold text-indigo-200">{currentStep?.cwnd ?? 1}</div>
          </div>
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-center">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">ssthresh</div>
            <div className="text-lg font-mono font-bold text-neutral-300">{currentStep?.ssthresh ?? INITIAL_SSTHRESH}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-neutral-500 flex-wrap">
        {(Object.keys(EVENT_COLOR) as CongestionEvent[]).map((e) => (
          <span key={e} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: EVENT_COLOR[e] }} />
            {e.replace("-", " ")}
          </span>
        ))}
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
                Fixed scenario: {ROUNDS} rounds, starting ssthresh {INITIAL_SSTHRESH}, a full timeout at round 9, and a fast retransmit (3 duplicate ACKs) at round 16 — chosen to show both recovery paths in one run.
              </p>
              <button type="button" onClick={handleStart} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Start Simulation
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
                  <div className="text-sm font-bold text-indigo-400">{TCP_CONGESTION_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{TCP_CONGESTION_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_CONGESTION_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_CONGESTION_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Congestion Control" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Start a simulation to get an AI explanation of each round.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Congestion Control"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Congestion Control"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Start a simulation from the Send tab to start playback.</p>
        )
      }
    />
  );
}
