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
import { buildDefaultTopology } from "@/lib/topology-engine";
import { sendIPv4Packet, IPv4Step, IPV4_CODE, IPV4_ANNOTATIONS, IPV4_COMPLEXITY } from "@/lib/ipv4-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sends an IPv4 packet across one or more routers, showing the two things that actually happen at each hop: TTL drops by one, and the Ethernet frame around it gets rebuilt from scratch." },
  { heading: "How to use it", body: "Send PC-1 → SRV-1 to cross R-1. Watch the IPv4 header stay put in the inspector while the Ethernet layer above it disappears and reappears at the router." },
  { heading: "Why it matters", body: "This is the core difference between Data Link and Network: Ethernet frames are segment-local and disposable, IP headers travel the whole way." },
];

export default function IPv4Page() {
  const [topology] = useState(() => buildDefaultTopology());
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("SRV-1");
  const [steps, setSteps] = useState<IPv4Step[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendIPv4Packet(topology, fromLabel.trim().toUpperCase(), toLabel.trim().toUpperCase()));

  const annotation = currentStep ? IPV4_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Visualization</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices</span>
      </div>
      {displayPacket ? (
        <PacketVisualizer topology={displayTopology} packet={displayPacket} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No packet yet — click Send." />
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
                <label htmlFor="ip-from" className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                <input id="ip-from" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ip-to" className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                <input id="ip-to" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Packet
              </button>
              <div className="pt-2 space-y-1">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Devices</div>
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
                  <div className="text-lg font-bold text-indigo-400">{IPV4_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{IPV4_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{IPV4_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={IPV4_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="IPv4 Routing" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a packet to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="IPv4"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="IPv4"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a packet from the Send tab to start playback.</p>
        )
      }
    />
  );
}
