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
import { PacketStep } from "@/lib/packet-engine";
import { simulatePacketLife, PACKET_LIFE_CODE, PACKET_LIFE_ANNOTATIONS, PACKET_LIFE_COMPLEXITY } from "@/lib/packet-life-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "One HTTP request/response, fully encapsulated (Ethernet + IPv4 + TCP + HTTP, all four layers present at once), crossing PC-1 -> SW-1 -> R-1 -> R-2 -> SRV-1 and back. Every other page in this project isolates one protocol or one link — this one shows every layer mutating together on a single packet's real journey." },
  { heading: "How to use it", body: "Run it and scrub through. Watch the Inside the Packet panel: TTL falls at each router, the Ethernet frame gets rebuilt (new source/destination MAC) at each router, and on the way back, TCP's sequence, ack, and window fields all change too." },
  { heading: "Why it matters", body: "This ties together what Encapsulation, IPv4, Ethernet, and TCP each teach in isolation — the same fields, changing together, on one continuous trip." },
];

export default function PacketLifePage() {
  const [topology] = useState(() => buildIcmpTopology());
  const [steps, setSteps] = useState<PacketStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulatePacketLife(topology));

  const annotation = currentStep ? PACKET_LIFE_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Packet Life Explorer</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices</span>
      </div>
      {currentStep?.packet ? (
        <PacketVisualizer topology={currentStep.topology} packet={currentStep.packet} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <PacketInspector layers={currentStep?.packet.layers ?? []} emptyLabel="No packet yet — run the explorer." />
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
              <p className="text-xs text-neutral-500 leading-relaxed">PC-1 sends an HTTP request to SRV-1, mid-connection, and gets a response back.</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{PACKET_LIFE_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{PACKET_LIFE_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{PACKET_LIFE_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={PACKET_LIFE_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Packet Life Explorer" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the explorer to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Packet Life Explorer"
      phaseLabel="Foundation"
      helpTitle="Packet Life Explorer"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run the explorer from the Run tab to start playback.</p>
        )
      }
    />
  );
}
