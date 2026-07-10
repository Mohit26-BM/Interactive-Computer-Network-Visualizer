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
import {
  sendFragmentedPacket, FragmentationStep,
  FRAGMENTATION_CODE, FRAGMENTATION_ANNOTATIONS, FRAGMENTATION_COMPLEXITY,
} from "@/lib/ipv4-fragmentation-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sends a packet larger than the path's MTU — it gets split into fragments (each aligned to an 8-byte offset), sent independently, and reassembled at the destination using the identification field and fragment offsets." },
  { heading: "How to use it", body: "Send the default 4000-byte packet over a 1500-byte MTU to see it split into 3 fragments. Then check \"Don't Fragment\" and send again — instead of splitting, it gets dropped." },
  { heading: "Why it matters", body: "This is what happens whenever a packet is too big for a link along its path — it's hard to picture in your head, which is exactly why it's worth watching." },
];

export default function FragmentationPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("SRV-1");
  const [totalBytes, setTotalBytes] = useState(4000);
  const [mtu, setMtu] = useState(1500);
  const [dontFragment, setDontFragment] = useState(false);
  const [steps, setSteps] = useState<FragmentationStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendFragmentedPacket(topology, fromLabel.trim().toUpperCase(), toLabel.trim().toUpperCase(), totalBytes, mtu, dontFragment));

  const annotation = currentStep ? FRAGMENTATION_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;
  const plan = currentStep?.plan ?? [];
  const receivedOffsets = new Set(currentStep?.receivedOffsets ?? []);

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
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No packet sent yet — click Send Packet." />
      {plan.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">Reassembly buffer</div>
          <div className="p-3 space-y-1.5">
            {plan.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                <span className={receivedOffsets.has(f.offset) ? "text-emerald-300" : "text-neutral-600"}>
                  {receivedOffsets.has(f.offset) ? "✓" : "•"} offset {f.offset} &middot; {f.length}B {f.moreFragments ? "(MF)" : "(last)"}
                </span>
              </div>
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
          id: "send",
          label: "Send",
          content: (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="frag-from" className="text-xs text-neutral-400 uppercase tracking-wider">From</label>
                  <input id="frag-from" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="frag-to" className="text-xs text-neutral-400 uppercase tracking-wider">To</label>
                  <input id="frag-to" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="frag-size" className="text-xs text-neutral-400 uppercase tracking-wider">Packet size (bytes)</label>
                  <input id="frag-size" type="number" value={totalBytes} onChange={(e) => setTotalBytes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="frag-mtu" className="text-xs text-neutral-400 uppercase tracking-wider">MTU (bytes)</label>
                  <input id="frag-mtu" type="number" value={mtu} onChange={(e) => setMtu(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={dontFragment} onChange={(e) => setDontFragment(e.target.checked)} className="accent-indigo-500" />
                Don&apos;t Fragment (DF)
              </label>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Packet
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
                  <div className="text-sm font-bold text-indigo-400">{FRAGMENTATION_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-xs font-bold text-violet-400 leading-snug">{FRAGMENTATION_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{FRAGMENTATION_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={FRAGMENTATION_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="IPv4 Fragmentation" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a packet to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="IPv4 Fragmentation"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="IPv4 Fragmentation"
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
