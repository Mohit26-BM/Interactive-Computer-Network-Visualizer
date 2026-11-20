"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildVlanTopology } from "@/lib/topology-engine";
import { sendFrame, VlanStep, VLANS, VLAN_CODE, VLAN_ANNOTATIONS, VLAN_COMPLEXITY } from "@/lib/vlan-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "One physical switch, split into two VLANs (separate broadcast domains): VLAN 10 (Sales) holds PC-1/PC-2, VLAN 20 (Engineering) holds PC-3/PC-4. Send a frame between any two hosts and watch whether it's delivered." },
  { heading: "How to use it", body: "Pick a source and destination. Same-VLAN traffic always works. Cross-VLAN traffic is blocked by default — enable inter-VLAN routing (router-on-a-stick) to see R-1 bridge the two subnets instead." },
  { heading: "Why it matters", body: "VLANs are how one switch pretends to be many — the isolation is the whole feature. Reaching across VLANs always requires an explicit router, never just \"a bigger switch.\"" },
];

const HOSTS = ["PC-1", "PC-2", "PC-3", "PC-4"];

function Node({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${
      active ? "bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-[0_0_10px_rgba(255,179,71,0.4)]" : "bg-neutral-900 border-neutral-700 text-neutral-400"
    }`}>
      {label}
    </div>
  );
}

export default function VlanPage() {
  const [topology] = useState(() => buildVlanTopology());
  const [from, setFrom] = useState("PC-1");
  const [to, setTo] = useState("PC-3");
  const [routerEnabled, setRouterEnabled] = useState(false);
  const [steps, setSteps] = useState<VlanStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendFrame(topology, from, to, routerEnabled));

  const annotation = currentStep ? VLAN_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">VLAN Topology</span>
        <span className="text-xs text-neutral-500">SW-1 &middot; 2 VLANs</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Node label="R-1 (router-on-a-stick)" active={currentStep?.activeLabel === "R-1"} />
        <div className={`w-px h-6 transition-all duration-300 ${currentStep?.viaTrunk ? "bg-indigo-400 shadow-[0_0_6px_rgba(255,179,71,0.6)]" : "bg-neutral-700"}`} />
        <Node label="SW-1" active={currentStep?.activeLabel === "SW-1"} />
        <div className="grid grid-cols-2 gap-6 w-full max-w-md">
          <div className="border border-dashed border-blue-500/40 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-blue-300 font-mono uppercase tracking-wider text-center">VLAN 10 &middot; Sales &middot; 10.0.10.0/24</div>
            <div className="grid grid-cols-2 gap-2">
              <Node label="PC-1" active={currentStep?.activeLabel === "PC-1"} />
              <Node label="PC-2" active={currentStep?.activeLabel === "PC-2"} />
            </div>
          </div>
          <div className="border border-dashed border-amber-500/40 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-amber-300 font-mono uppercase tracking-wider text-center">VLAN 20 &middot; Engineering &middot; 10.0.20.0/24</div>
            <div className="grid grid-cols-2 gap-2">
              <Node label="PC-3" active={currentStep?.activeLabel === "PC-3"} />
              <Node label="PC-4" active={currentStep?.activeLabel === "PC-4"} />
            </div>
          </div>
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
          id: "send",
          label: "Send",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500">
                  {HOSTS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500">
                  {HOSTS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={routerEnabled} onChange={(e) => setRouterEnabled(e.target.checked)} className="accent-indigo-500" />
                Enable inter-VLAN routing (router-on-a-stick)
              </label>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Frame
              </button>
              <div className="pt-1 space-y-1">
                {VLANS.map((v) => (
                  <p key={v.id} className="text-[11px] text-neutral-500">VLAN {v.id} ({v.name}): {v.subnet}</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{VLAN_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{VLAN_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{VLAN_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={VLAN_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="VLANs" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a frame to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="VLANs"
      phaseLabel="Enterprise Networking"
      helpTitle="VLANs"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a frame from the Send tab to start playback.</p>
        )
      }
    />
  );
}
