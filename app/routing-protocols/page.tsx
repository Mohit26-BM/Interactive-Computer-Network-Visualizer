"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildRoutingTopology } from "@/lib/topology-engine";
import { ROUTING_CODE, ROUTING_ANNOTATIONS } from "@/lib/routing-engine";
import {
  simulateRip, simulateOspf, DvStep,
  RIP_CODE, RIP_ANNOTATIONS, RIP_COMPLEXITY, OSPF_ANNOTATIONS, OSPF_COMPLEXITY,
} from "@/lib/routing-protocols-engine";
import { RoutingStep } from "@/lib/routing-engine";

type Mode = "rip" | "ospf";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-orange-500/15 border-orange-500/30 text-orange-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The same router mesh, run two different ways: RIP (Distance Vector) exchanges hop counts with neighbors over several rounds; OSPF (Link State) floods the whole topology once, then each router runs Dijkstra locally. Same destination, opposite strategy." },
  { heading: "How to use it", body: "Pick a start router and a protocol, then Run. Watch RIP converge round by round versus OSPF converge in one local computation once it has the flooded topology." },
  { heading: "Why it matters", body: "This is the actual textbook Distance Vector vs Link State distinction, not just two acronyms — the difference in convergence speed and per-router memory is the direct consequence of how much topology each router is told." },
];

export default function RoutingProtocolsPage() {
  const [topology] = useState(() => buildRoutingTopology());
  const [mode, setMode] = useState<Mode>("rip");
  const [startLabel, setStartLabel] = useState("R-A");
  const [dvSteps, setDvSteps] = useState<DvStep[]>([]);
  const [lsSteps, setLsSteps] = useState<RoutingStep[]>([]);

  const steps = mode === "rip" ? dvSteps : lsSteps;
  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const dvStep = mode === "rip" ? dvSteps[step] : undefined;
  const lsStep = mode === "ospf" ? lsSteps[step] : undefined;

  const handleRun = () => {
    reset();
    if (mode === "rip") setDvSteps(simulateRip(topology, startLabel.trim().toUpperCase()));
    else setLsSteps(simulateOspf(topology, startLabel.trim().toUpperCase()));
  };

  const annotation = mode === "rip"
    ? (dvStep ? RIP_ANNOTATIONS[dvStep.highlightLine] : undefined)
    : (lsStep ? (OSPF_ANNOTATIONS[lsStep.highlightLine] ?? ROUTING_ANNOTATIONS[lsStep.highlightLine]) : undefined);
  const complexity = mode === "rip" ? RIP_COMPLEXITY : OSPF_COMPLEXITY;
  const code = mode === "rip" ? RIP_CODE : ROUTING_CODE;
  const currentExplanation = mode === "rip" ? dvStep?.explanation : lsStep?.explanation;
  const currentPhase = mode === "rip" ? dvStep?.phase : lsStep?.phase;
  const captionClass = phaseCaption[currentPhase ?? "default"] ?? phaseCaption.default;

  const highlightDevices = mode === "rip" ? (dvStep?.changedIds ?? []) : (lsStep?.highlightDevices ?? []);
  const highlightLinks = mode === "ospf" ? (lsStep?.highlightLinks ?? []) : [];
  const distances = mode === "rip" ? dvStep?.distances : lsStep?.distances;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Router mesh — {mode === "rip" ? "Distance Vector (RIP)" : "Link State (OSPF)"}</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} routers &middot; {topology.links.length} links</span>
      </div>
      <TopologyVisualizer state={topology} highlightDevices={highlightDevices} highlightLinks={highlightLinks} phase={currentPhase} width={600} height={340} />

      {distances && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">
            {mode === "rip" ? `hop count from ${startLabel.toUpperCase()} (round ${dvStep?.round ?? 0})` : `cost from ${startLabel.toUpperCase()}`}
          </div>
          <div className="p-3 flex flex-wrap gap-2">
            {topology.devices.map((d) => {
              const dist = distances[d.id];
              return (
                <span key={d.id} className="text-xs font-mono bg-neutral-800 border border-neutral-700 px-2 py-1 rounded">
                  <span className="text-neutral-400">{d.label}: </span>
                  <span className="text-amber-400">{dist === undefined || dist === Infinity ? "∞" : dist}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {currentExplanation && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{currentExplanation}</span>
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
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Protocol</label>
                <div className="flex gap-1.5">
                  {(["rip", "ospf"] as Mode[]).map((m) => (
                    <button key={m} type="button" onClick={() => { setMode(m); reset(); }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"}`}>
                      {m === "rip" ? "RIP (Distance Vector)" : "OSPF (Link State)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="rp-start" className="text-xs text-neutral-400 uppercase tracking-wider">Start router</label>
                <input id="rp-start" value={startLabel} onChange={(e) => setStartLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run {mode === "rip" ? "RIP" : "OSPF"}
              </button>
              <div className="pt-2 text-xs text-neutral-500">
                Links: A-B(4), A-C(2), B-D(5), C-D(1), D-E(3), B-E(6)
              </div>
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
          content: <CodePanel lines={code} highlightLine={(mode === "rip" ? dvStep?.highlightLine : lsStep?.highlightLine) ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentExplanation ? (
            <AIExplainer algorithm={mode === "rip" ? "RIP (Distance Vector)" : "OSPF (Link State)"} stepExplanation={currentExplanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a protocol to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Routing Protocols"
      phaseLabel="Enterprise Networking"
      helpTitle="Routing Protocols"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a protocol from the Run tab to start playback.</p>
        )
      }
    />
  );
}
