"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import PacketVisualizer from "@/components/packet/PacketVisualizer";
import PacketInspector from "@/components/shared/PacketInspector";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildNatTopology } from "@/lib/topology-engine";
import {
  simulateNatScale, NatScaleStep,
  NAT_SCALE_CODE, NAT_SCALE_ANNOTATIONS, NAT_SCALE_COMPLEXITY,
} from "@/lib/experiments/nat-scale-lab";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const MAX_DEVICES = 50;

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The exact same PAT logic as the NAT page, run for a whole household of devices instead of one. Device 1 gets the full hop-by-hop trace; the rest are fast-forwarded straight to their table entry, so you can see the table grow to any size without scrubbing through dozens of identical replays." },
  { heading: "How to use it", body: "Set a device count and run it. Watch the NAT table panel end up with exactly that many entries — one public IP, one port per device." },
  { heading: "Why it matters", body: "This is why a single home router can serve every device in the house on one public IP: the thing that actually runs out first is table entries or the port range, never IP addresses." },
];

export default function NatScaleLabPage() {
  const [topology] = useState(() => buildNatTopology());
  const [deviceCount, setDeviceCount] = useState(5);
  const [steps, setSteps] = useState<NatScaleStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateNatScale(topology, Math.min(MAX_DEVICES, Math.max(1, deviceCount))));

  const annotation = currentStep ? NAT_SCALE_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTable = currentStep?.natTable ?? [];

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">NAT Table Growth — Parameter Lab</span>
        <span className="text-xs text-neutral-500">{displayTable.length} entries</span>
      </div>
      {currentStep?.packet ? (
        <PacketVisualizer topology={topology} packet={currentStep.packet} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <PacketInspector layers={currentStep?.packet?.layers ?? []} emptyLabel="No traffic yet — run the experiment." />
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">NAT table (R-1)</div>
        <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
          {displayTable.length === 0 ? (
            <p className="text-xs text-neutral-600 italic px-1">Empty — nothing translated yet.</p>
          ) : (
            displayTable.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span className="text-indigo-300">{m.insideLocalIp}:{m.insideLocalPort}</span>
                <span className="text-neutral-600">&harr;</span>
                <span>{m.insideGlobalIp}:{m.insideGlobalPort}</span>
              </div>
            ))
          )}
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
          id: "run",
          label: "Run",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Device count</label>
                <input type="number" min={1} max={MAX_DEVICES} value={deviceCount} onChange={(e) => setDeviceCount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run
              </button>
              <p className="text-[11px] text-neutral-600">Capped at {MAX_DEVICES} for a readable table.</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{NAT_SCALE_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{NAT_SCALE_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{NAT_SCALE_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={NAT_SCALE_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="NAT Table Growth" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the experiment to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="NAT Table Growth"
      phaseLabel="Experiments · Parameter Lab"
      helpTitle="NAT Table Growth"
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
