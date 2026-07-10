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
import { randomEphemeralPort } from "@/lib/ports-engine";
import { sendUdpDatagram, UdpStep, UDP_CODE, UDP_ANNOTATIONS, UDP_COMPLEXITY } from "@/lib/udp-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sends a single UDP datagram end-to-end — no handshake, no acknowledgment, no retransmission. Toggle simulated loss to see what happens when one goes missing." },
  { heading: "How to use it", body: "Click Send Datagram. Then check \"Simulate packet loss\" and send again — the datagram just vanishes partway. Nothing times out, nothing resends, because UDP never expected a reply in the first place." },
  { heading: "Why it matters", body: "UDP is the simplest transport protocol precisely because it skips everything TCP does to guarantee delivery — understanding what's missing here is what makes TCP's mechanisms make sense next." },
];

export default function UdpPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("SRV-1");
  const [srcPort, setSrcPort] = useState(() => randomEphemeralPort());
  const [dstPort, setDstPort] = useState(53);
  const [simulateLoss, setSimulateLoss] = useState(false);
  const [steps, setSteps] = useState<UdpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendUdpDatagram(topology, fromLabel.trim().toUpperCase(), toLabel.trim().toUpperCase(), srcPort, dstPort, "DNS query", simulateLoss));

  const annotation = currentStep ? UDP_ANNOTATIONS[currentStep.highlightLine] : undefined;
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
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No datagram sent yet — click Send Datagram." />
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
                <label htmlFor="udp-from" className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                <input id="udp-from" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="udp-to" className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                <input id="udp-to" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="udp-src" className="text-xs text-neutral-400 uppercase tracking-wider">Src port</label>
                  <input id="udp-src" type="number" value={srcPort} onChange={(e) => setSrcPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="udp-dst" className="text-xs text-neutral-400 uppercase tracking-wider">Dst port</label>
                  <input id="udp-dst" type="number" value={dstPort} onChange={(e) => setDstPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={simulateLoss} onChange={(e) => setSimulateLoss(e.target.checked)} className="accent-indigo-500" />
                Simulate packet loss
              </label>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Datagram
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
                  <div className="text-lg font-bold text-indigo-400">{UDP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{UDP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{UDP_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={UDP_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="UDP" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a datagram to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="UDP"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="UDP"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a datagram from the Send tab to start playback.</p>
        )
      }
    />
  );
}
