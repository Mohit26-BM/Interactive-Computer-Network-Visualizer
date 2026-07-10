"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildLanTopology } from "@/lib/topology-engine";
import { arpResolve, ArpCache, ArpStep, ARP_CODE, ARP_ANNOTATIONS, ARP_COMPLEXITY } from "@/lib/arp-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Resolves an IP address to a MAC address on the local LAN — broadcasting a request if it isn't already cached." },
  { heading: "How to use it", body: "Pick a From and To device and click Resolve. Do it again for the same pair and watch the broadcast disappear — the cache from the first run is still warm." },
  { heading: "Why it matters", body: "Every packet needs a MAC address to actually travel as a frame — ARP is the missing link between IP addressing and Ethernet delivery." },
];

export default function ArpPage() {
  const [topology] = useState(() => buildLanTopology());
  const [cache, setCache] = useState<ArpCache>({});
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("PC-2");
  const [steps, setSteps] = useState<ArpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleResolve = () => {
    const result = arpResolve(topology, cache, fromLabel.trim().toUpperCase(), toLabel.trim().toUpperCase());
    setSteps(result.steps);
    setCache(result.cache);
  };
  const clearCache = () => { setCache({}); setSteps([]); };

  const annotation = currentStep ? ARP_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayCache = currentStep?.cache ?? cache;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Local segment</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices</span>
      </div>
      <TopologyVisualizer
        state={topology}
        highlightDevices={currentStep?.highlightDevices}
        highlightLinks={currentStep?.highlightLinks}
        phase={currentStep?.phase}
      />
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">ARP cache</div>
        <div className="p-3 space-y-2">
          {Object.keys(displayCache).length === 0 ? (
            <p className="text-xs text-neutral-600 italic px-1">Empty — nothing resolved yet.</p>
          ) : (
            Object.entries(displayCache).map(([deviceId, entries]) => {
              const owner = topology.devices.find((d) => d.id === deviceId);
              if (!owner || Object.keys(entries).length === 0) return null;
              return (
                <div key={deviceId}>
                  <div className="text-[11px] text-indigo-300 font-mono mb-0.5">{owner.label}</div>
                  {Object.entries(entries).map(([ip, mac]) => (
                    <div key={ip} className="flex justify-between text-[11px] font-mono text-neutral-400 pl-2">
                      <span>{ip}</span>
                      <span>{mac}</span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
      {currentStep && (
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
          id: "resolve",
          label: "Resolve",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="arp-from" className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                <input id="arp-from" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="arp-to" className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                <input id="arp-to" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleResolve} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Resolve
              </button>
              <button type="button" onClick={clearCache} className="w-full px-4 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors">
                Clear cache
              </button>
              <div className="pt-2 space-y-1">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Devices on this segment</div>
                {topology.devices.filter((d) => d.ip).map((d) => (
                  <div key={d.id} className="flex justify-between text-[11px] font-mono text-neutral-400">
                    <span>{d.label}</span>
                    <span>{d.ip}</span>
                  </div>
                ))}
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
                  <div className="text-sm font-bold text-indigo-400">{ARP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ARP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ARP_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={ARP_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="ARP" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Resolve an address to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="ARP"
      phaseLabel="Phase 2 · Layer 2"
      helpTitle="ARP"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Resolve an address from the Resolve tab to start playback.</p>
        )
      }
    />
  );
}
