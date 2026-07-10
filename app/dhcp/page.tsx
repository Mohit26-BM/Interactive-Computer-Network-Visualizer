"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import PacketVisualizer from "@/components/packet/PacketVisualizer";
import PacketInspector from "@/components/shared/PacketInspector";
import StackIndicator from "@/components/shared/StackIndicator";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildDhcpTopology } from "@/lib/topology-engine";
import { runDhcp, DhcpStep, DHCP_CODE, DHCP_ANNOTATIONS, DHCP_COMPLEXITY } from "@/lib/dhcp-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A brand-new PC with no IP address gets one from a DHCP server via DORA: Discover, Offer, Request, Ack — then renews the same lease later without repeating the broadcast dance." },
  { heading: "How to use it", body: "Click Run DHCP and step through. Watch the client's IP go from none to 192.168.1.50, and notice DISCOVER/REQUEST are both broadcasts while the later renewal is a direct unicast." },
  { heading: "Why it matters", body: "Every other page in this project assumes a device already has an IP — this is where that IP actually comes from." },
];

export default function DhcpPage() {
  const [topology] = useState(() => buildDhcpTopology());
  const [steps, setSteps] = useState<DhcpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(runDhcp(topology, "PC-NEW", "DHCP-1"));

  const annotation = currentStep ? DHCP_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;
  const client = displayTopology.devices.find((d) => d.label === "PC-NEW")!;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Visualization</span>
        <span className="text-xs text-neutral-500 font-mono">PC-NEW IP: {client.ip ?? "none yet"}</span>
      </div>
      <StackIndicator active="Application" />
      {displayPacket ? (
        <PacketVisualizer topology={displayTopology} packet={displayPacket} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No DHCP exchange yet — click Run DHCP." />
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
              <p className="text-xs text-neutral-500 leading-relaxed">
                PC-NEW has no IP address. DHCP-1 is the DHCP server on this segment.
              </p>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run DHCP
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
                  <div className="text-sm font-bold text-indigo-400">{DHCP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{DHCP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{DHCP_COMPLEXITY.note}</p>
              <div className="bg-neutral-800 rounded-lg p-3 space-y-1">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Static vs Dynamic</div>
                <p className="text-xs text-neutral-400 leading-relaxed">This page shows dynamic assignment — the server hands out an address from a pool with a lease. A statically configured device just has an IP typed in once, forever, with no DHCP involved at all.</p>
              </div>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={DHCP_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="DHCP" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run DHCP to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="DHCP"
      phaseLabel="Phase 5 · Application"
      helpTitle="DHCP"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run DHCP from the Send tab to start playback.</p>
        )
      }
    />
  );
}
