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
import { dijkstra, shortestPathTo, RoutingStep, ROUTING_CODE, ROUTING_ANNOTATIONS, ROUTING_COMPLEXITY } from "@/lib/routing-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-orange-500/15 border-orange-500/30 text-orange-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Runs Dijkstra's shortest-path algorithm over a small weighted mesh of routers — the same algorithm the DSA visualizer's graph page uses, ported onto this project's device/link model." },
  { heading: "How to use it", body: "Pick a start router and click Run. The distance table on the right is a real routing table. Pick a target below the diagram to highlight the actual shortest path to it." },
  { heading: "Why it matters", body: "This is what a router's routing table actually is: the output of exactly this computation, run against its neighbors' advertised costs." },
];

export default function RoutingPage() {
  const [topology] = useState(() => buildRoutingTopology());
  const [startLabel, setStartLabel] = useState("R-A");
  const [targetLabel, setTargetLabel] = useState("R-E");
  const [steps, setSteps] = useState<RoutingStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(dijkstra(topology, startLabel.trim().toUpperCase()));

  const annotation = currentStep ? ROUTING_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const isLastStep = steps.length > 0 && step === steps.length - 1;
  const path = isLastStep ? shortestPathTo(currentStep, topology, targetLabel.trim().toUpperCase()) : null;

  const highlightDevices = path ? path.devices : currentStep?.highlightDevices ?? [];
  const highlightLinks = path ? path.links : currentStep?.highlightLinks ?? [];
  const phase = path ? "found" : currentStep?.phase;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Router mesh</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} routers &middot; {topology.links.length} links</span>
      </div>
      <TopologyVisualizer state={topology} highlightDevices={highlightDevices} highlightLinks={highlightLinks} phase={phase} width={600} height={340} />

      {currentStep && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">routing table (distance from {startLabel.toUpperCase()})</div>
          <div className="p-3 flex flex-wrap gap-2">
            {topology.devices.map((d) => {
              const dist = currentStep.distances[d.id];
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

      {path && (
        <div className="border rounded-lg px-4 py-2.5 bg-orange-500/15 border-orange-500/30 text-orange-200 text-sm">
          Shortest path to {targetLabel.toUpperCase()}: {path.devices.map((id) => topology.devices.find((d) => d.id === id)?.label).join(" → ")}
        </div>
      )}

      {currentStep && !path && (
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
                <label htmlFor="routing-start" className="text-xs text-neutral-400 uppercase tracking-wider">Start router</label>
                <input id="routing-start" value={startLabel} onChange={(e) => setStartLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run Dijkstra
              </button>

              <div className="border-t border-neutral-800 pt-3 space-y-1">
                <label htmlFor="routing-target" className="text-xs text-neutral-400 uppercase tracking-wider">Highlight path to</label>
                <input id="routing-target" value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                <p className="text-[11px] text-neutral-500">Only shows once playback reaches the final step.</p>
              </div>

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
                  <div className="text-lg font-bold text-indigo-400">{ROUTING_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{ROUTING_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ROUTING_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ROUTING_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Dijkstra Routing" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run Dijkstra to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Routing"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="Routing"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run Dijkstra from the Run tab to start playback.</p>
        )
      }
    />
  );
}
