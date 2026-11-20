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
import { DEFAULT_EPHEMERAL_PORT } from "@/lib/ports-engine";
import {
  sendTcpData, TcpDataStep,
  TCP_DATA_CODE, TCP_DATA_ANNOTATIONS, TCP_DATA_COMPLEXITY,
} from "@/lib/tcp-data-transfer-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const DEFAULT_SEGMENTS = ["Hello ", "World", "!"];
const LOSE_OPTIONS = [
  { value: -1, label: "None" },
  { value: 0, label: "Segment 1" },
  { value: 1, label: "Segment 2" },
  { value: 2, label: "Segment 3" },
];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sends three TCP segments one at a time, stop-and-wait: each segment waits for its own ACK before the next one goes. Toggle a lost segment to see the retransmission timeout kick in." },
  { heading: "How to use it", body: "Click Send Segments. Then pick a segment to lose and send again — watch the sequence number stay exactly the same on the retransmit." },
  { heading: "Why it matters", body: "This is TCP reliability at its simplest — before Sliding Window adds the complication of several unacknowledged segments in flight at once." },
];

export default function TcpDataTransferPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [clientLabel, setClientLabel] = useState("PC-1");
  const [serverLabel, setServerLabel] = useState("SRV-1");
  const [clientPort] = useState(DEFAULT_EPHEMERAL_PORT);
  const [serverPort] = useState(80);
  const [loseIndex, setLoseIndex] = useState(-1);
  const [steps, setSteps] = useState<TcpDataStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendTcpData(topology, clientLabel.trim().toUpperCase(), serverLabel.trim().toUpperCase(), clientPort, serverPort, DEFAULT_SEGMENTS, loseIndex));

  const annotation = currentStep ? TCP_DATA_ANNOTATIONS[currentStep.highlightLine] : undefined;
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
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No segments sent yet — click Send Segments." />
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
                <label htmlFor="td-client" className="text-xs text-neutral-400 uppercase tracking-wider">Client</label>
                <input id="td-client" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="td-server" className="text-xs text-neutral-400 uppercase tracking-wider">Server</label>
                <input id="td-server" value={serverLabel} onChange={(e) => setServerLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Segments</span>
                <div className="flex gap-1.5">
                  {DEFAULT_SEGMENTS.map((s, i) => (
                    <span key={i} className="px-2 py-1 bg-neutral-800 rounded text-xs font-mono text-neutral-300">{s.trim() || "(space)"}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="td-lose" className="text-xs text-neutral-400 uppercase tracking-wider">Simulate loss on</label>
                <select id="td-lose" value={loseIndex} onChange={(e) => setLoseIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500">
                  {LOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Segments
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
                  <div className="text-sm font-bold text-indigo-400">{TCP_DATA_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{TCP_DATA_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_DATA_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_DATA_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Data Transfer" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send segments to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Data Transfer"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Data Transfer"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send segments from the Send tab to start playback.</p>
        )
      }
    />
  );
}
