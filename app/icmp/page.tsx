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
import { buildIcmpTopology } from "@/lib/topology-engine";
import { ping, traceroute, IcmpStep, ICMP_PING_CODE, ICMP_TRACEROUTE_CODE, ICMP_ANNOTATIONS, ICMP_COMPLEXITY } from "@/lib/icmp-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Ping sends an Echo Request and times the reply. Traceroute sends the same kind of probe with increasing TTL, so each router along the way is caught discarding one and reveals itself." },
  { heading: "How to use it", body: "Switch between Ping and Traceroute in the Run tab. This topology has two routers between PC-1 and SRV-1, so traceroute reveals both before reaching the server." },
  { heading: "Why it matters", body: "Traceroute isn't a separate protocol feature — it's a clever reuse of the exact TTL-expiry mechanism IPv4 already uses to kill misrouted packets." },
];

type Mode = "ping" | "traceroute";

export default function IcmpPage() {
  const [topology] = useState(() => buildIcmpTopology());
  const [mode, setMode] = useState<Mode>("ping");
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("SRV-1");
  const [steps, setSteps] = useState<IcmpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => {
    const from = fromLabel.trim().toUpperCase();
    const to = toLabel.trim().toUpperCase();
    setSteps(mode === "ping" ? ping(topology, from, to) : traceroute(topology, from, to));
  };

  const codeLines = mode === "ping" ? ICMP_PING_CODE : ICMP_TRACEROUTE_CODE;
  const annotation = currentStep ? ICMP_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Visualization</span>
        <span className="text-xs text-neutral-500 uppercase tracking-wider">{mode}</span>
      </div>
      {displayPacket ? (
        <PacketVisualizer topology={displayTopology} packet={displayPacket} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No probe sent yet." />

      {mode === "traceroute" && currentStep && currentStep.hops.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">hops discovered</div>
          <div className="p-3 space-y-1">
            {currentStep.hops.map((h, i) => (
              <div key={h} className="text-xs font-mono text-neutral-300">{i + 1}. {h}</div>
            ))}
          </div>
        </div>
      )}

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
              <div className="flex gap-2">
                {(["ping", "traceroute"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      mode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="icmp-from" className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                <input id="icmp-from" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="icmp-to" className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                <input id="icmp-to" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors capitalize">
                {mode}
              </button>
              <p className="text-[11px] text-neutral-500">Path: PC-1 &rarr; SW-1 &rarr; R-1 &rarr; R-2 &rarr; SRV-1</p>
            </div>
          ),
        },
        {
          id: "details",
          label: "Details",
          content: (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Time</div>
                  <div className="text-sm font-bold text-indigo-400">{ICMP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ICMP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ICMP_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={codeLines} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={mode === "ping" ? "ICMP Ping" : "ICMP Traceroute"} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run {mode} to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="ICMP"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="ICMP"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run {mode} from the Run tab to start playback.</p>
        )
      }
    />
  );
}
