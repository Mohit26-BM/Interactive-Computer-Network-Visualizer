"use client";

import { useState, useMemo } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildRoutingTopology } from "@/lib/topology-engine";
import { RoutingStep } from "@/lib/routing-engine";
import {
  simulateRoutingWhatIf, RoutingChange,
  ROUTING_WHATIF_CODE, ROUTING_WHATIF_ANNOTATIONS, ROUTING_WHATIF_COMPLEXITY,
} from "@/lib/experiments/routing-whatif-lab";

type ChangeType = "reweight" | "failLink" | "failRouter";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-orange-500/15 border-orange-500/30 text-orange-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The same Dijkstra shortest-path algorithm the Routing page uses, run twice: once on the mesh as-is, once after you reweight a link, fail a link, or fail a router entirely. The summary compares the R-A to R-E cost and path before and after." },
  { heading: "How to use it", body: "Pick what to change, then Run. Scrub through the (post-change) Dijkstra run, then read the final comparison step." },
  { heading: "Why it matters", body: "This is literally what happens on a real network after a link flaps or a router reboots — every router recomputes shortest paths from scratch against the new topology." },
];

export default function RoutingWhatIfPage() {
  const [topology] = useState(() => buildRoutingTopology());
  const [changeType, setChangeType] = useState<ChangeType>("failLink");
  const [linkId, setLinkId] = useState("");
  const [routerId, setRouterId] = useState("");
  const [newWeight, setNewWeight] = useState(10);
  const [steps, setSteps] = useState<RoutingStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const linkOptions = useMemo(() => topology.links.map((l) => {
    const a = topology.devices.find((d) => d.id === l.from)?.label;
    const b = topology.devices.find((d) => d.id === l.to)?.label;
    return { id: l.id, label: `${a}-${b} (cost ${l.weight ?? 1})` };
  }), [topology]);

  const routerOptions = useMemo(() => topology.devices.filter((d) => d.label !== "R-A" && d.label !== "R-E").map((d) => ({ id: d.id, label: d.label })), [topology]);

  const effectiveLinkId = linkId || linkOptions[0]?.id || "";
  const effectiveRouterId = routerId || routerOptions[0]?.id || "";

  const handleRun = () => {
    const change: RoutingChange = changeType === "reweight"
      ? { type: "reweight", linkId: effectiveLinkId, newWeight }
      : changeType === "failLink"
      ? { type: "failLink", linkId: effectiveLinkId }
      : { type: "failRouter", deviceId: effectiveRouterId };
    setSteps(simulateRoutingWhatIf(topology, change));
  };

  const annotation = currentStep ? ROUTING_WHATIF_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Routing What-If — Parameter Lab</span>
        <span className="text-xs text-neutral-500">{displayTopology.devices.length} routers &middot; {displayTopology.links.length} links</span>
      </div>
      <TopologyVisualizer state={displayTopology} highlightDevices={currentStep?.highlightDevices} highlightLinks={currentStep?.highlightLinks} phase={currentStep?.phase} width={600} height={340} />
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Change</label>
                <div className="flex flex-col gap-1">
                  {([
                    { value: "reweight", label: "Reweight a link" },
                    { value: "failLink", label: "Fail a link" },
                    { value: "failRouter", label: "Fail a router" },
                  ] as { value: ChangeType; label: string }[]).map((o) => (
                    <button key={o.value} type="button" onClick={() => setChangeType(o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${changeType === o.value ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {(changeType === "reweight" || changeType === "failLink") && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">Link</label>
                  <select value={effectiveLinkId} onChange={(e) => setLinkId(e.target.value)} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500">
                    {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {changeType === "reweight" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">New weight</label>
                  <input type="number" min={1} max={99} value={newWeight} onChange={(e) => setNewWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              )}

              {changeType === "failRouter" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">Router</label>
                  <select value={effectiveRouterId} onChange={(e) => setRouterId(e.target.value)} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500">
                    {routerOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run
              </button>
              <p className="text-[11px] text-neutral-600">Always compares R-A &rarr; R-E, before vs after.</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{ROUTING_WHATIF_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ROUTING_WHATIF_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ROUTING_WHATIF_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ROUTING_WHATIF_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Routing What-If" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the experiment to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Routing What-If"
      phaseLabel="Experiments · Parameter Lab"
      helpTitle="Routing What-If"
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
