"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateStp, StpStep, StpPortState, STP_LINKS, BRIDGE_ID,
  STP_CODE, STP_ANNOTATIONS, STP_COMPLEXITY,
} from "@/lib/stp-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Three switches cabled in a triangle — a physical loop. Spanning Tree Protocol elects a root bridge, gives every other switch a root port back to it, and blocks exactly one redundant port so the loop can never carry a broadcast storm." },
  { heading: "How to use it", body: "Run the base scenario to see the tree converge. Then re-run with \"simulate a link failure\" checked to see the previously-blocked port come alive and take over — that's what the redundant cable was for." },
  { heading: "Why it matters", body: "Every office network with more than one switch has this exact problem the moment someone adds a second cable \"for redundancy.\" STP is what makes that safe instead of catastrophic." },
];

const POS: Record<string, { x: number; y: number }> = {
  "SW-1": { x: 150, y: 30 },
  "SW-2": { x: 40, y: 160 },
  "SW-3": { x: 260, y: 160 },
};

const ROLE_COLOR: Record<string, string> = {
  root: "#ffc266",
  designated: "#4fe0cc",
  blocked: "#ff7d8e",
  none: "#44546a",
};

const ROLE_LABEL: Record<string, string> = {
  root: "ROOT",
  designated: "DESIGNATED",
  blocked: "BLOCKED",
  none: "",
};

function portFor(ports: StpPortState[], linkId: string, switchLabel: string): StpPortState | undefined {
  return ports.find((p) => p.linkId === linkId && p.switchLabel === switchLabel);
}

function Triangle({ step }: { step: StpStep | undefined }) {
  const ports = step?.ports ?? [];
  const rootBridge = step?.rootBridge ?? null;
  const failedLinkId = step?.failedLinkId ?? null;

  return (
    <svg viewBox="0 0 300 210" className="w-full max-w-md mx-auto">
      {STP_LINKS.map((l) => {
        const pa = POS[l.a], pb = POS[l.b];
        const portA = portFor(ports, l.id, l.a);
        const portB = portFor(ports, l.id, l.b);
        const isFailed = failedLinkId === l.id;
        const isBlocked = portA?.role === "blocked" || portB?.role === "blocked";
        const color = isFailed ? "#ff5d73" : isBlocked ? "#ff7d8e" : (portA?.role === "root" || portA?.role === "designated") ? "#4fe0cc" : "#44546a";
        const midX = (pa.x + pb.x) / 2, midY = (pa.y + pb.y) / 2;
        return (
          <g key={l.id}>
            <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={color} strokeWidth={isFailed ? 2 : 2.5}
              strokeDasharray={isFailed || isBlocked ? "5 4" : undefined} className="transition-all duration-300" />
            {isFailed && (
              <g transform={`translate(${midX}, ${midY})`} stroke="#ff5d73" strokeWidth={2.5} strokeLinecap="round">
                <line x1={-7} y1={-7} x2={7} y2={7} />
                <line x1={-7} y1={7} x2={7} y2={-7} />
              </g>
            )}
            {portA && portA.role !== "none" && (
              <text x={pa.x + (midX - pa.x) * 0.35} y={pa.y + (midY - pa.y) * 0.35 - 4} fontSize={7} fill={ROLE_COLOR[portA.role]} fontFamily="monospace" textAnchor="middle">{ROLE_LABEL[portA.role]}</text>
            )}
            {portB && portB.role !== "none" && (
              <text x={pb.x + (midX - pb.x) * 0.35} y={pb.y + (midY - pb.y) * 0.35 - 4} fontSize={7} fill={ROLE_COLOR[portB.role]} fontFamily="monospace" textAnchor="middle">{ROLE_LABEL[portB.role]}</text>
            )}
          </g>
        );
      })}
      {Object.entries(POS).map(([label, pos]) => {
        const isRoot = rootBridge === label;
        return (
          <g key={label} transform={`translate(${pos.x}, ${pos.y})`}>
            <rect x={-26} y={-16} width={52} height={32} rx={4}
              fill={isRoot ? "rgba(129,140,248,0.15)" : "#0f151e"}
              stroke={isRoot ? "#ffc266" : "#44546a"} strokeWidth={1.6} className="transition-all duration-300" />
            <text x={0} y={-2} textAnchor="middle" fontSize={10} fontWeight="bold" fontFamily="monospace" fill={isRoot ? "#ffe3b8" : "#b4c0d1"}>{label}</text>
            <text x={0} y={10} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#7d8aa0">priority {BRIDGE_ID[label]}{isRoot ? " · ROOT" : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function StpPage() {
  const [failLink, setFailLink] = useState(false);
  const [steps, setSteps] = useState<StpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateStp(failLink));

  const annotation = currentStep ? STP_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Spanning Tree — 3 switches, 1 loop</span>
      </div>

      {steps.length > 0 ? (
        <Triangle step={currentStep} />
      ) : (
        <p className="text-xs text-neutral-600 italic text-center py-8">Run the scenario from the Send tab to see the tree converge.</p>
      )}

      <div className="flex gap-4 text-xs text-neutral-500 flex-wrap justify-center">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" /> root port</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> designated (forwarding)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> blocked</span>
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
              <p className="text-xs text-neutral-500 leading-relaxed">SW-1, SW-2, and SW-3 are cabled in a triangle — a physical loop.</p>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={failLink} onChange={(e) => setFailLink(e.target.checked)} className="accent-indigo-500" />
                Simulate a link failure (SW-1 &ndash; SW-2) after convergence
              </label>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{STP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{STP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{STP_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={STP_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Spanning Tree Protocol" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the scenario to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Spanning Tree Protocol"
      phaseLabel="Enterprise Networking"
      helpTitle="Spanning Tree Protocol"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run the scenario from the Send tab to start playback.</p>
        )
      }
    />
  );
}
