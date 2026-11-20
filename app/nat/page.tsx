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
import { buildNatTopology } from "@/lib/topology-engine";
import { DEFAULT_EPHEMERAL_PORT, randomEphemeralPort } from "@/lib/ports-engine";
import { sendThroughNat, NatTable, NatStep, NAT_CODE, NAT_ANNOTATIONS, NAT_COMPLEXITY } from "@/lib/nat-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A private PC's request goes out through a router doing NAT (specifically PAT — Port Address Translation): the router swaps the private IP:port for its own public IP and a fresh port, and translates the reply back on the way in." },
  { heading: "How to use it", body: "Click Send Request and step through. Then send again with a different client port — watch the NAT table grow with a second entry, both sharing the same public IP but different ports." },
  { heading: "Why it matters", body: "This is what every home and office router does, constantly — it's why a whole household can share one public IP address at once." },
];

export default function NatPage() {
  const [topology] = useState(() => buildNatTopology());
  const [clientPort, setClientPort] = useState(DEFAULT_EPHEMERAL_PORT);
  const [table, setTable] = useState<NatTable>([]);
  const [steps, setSteps] = useState<NatStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => {
    const result = sendThroughNat(topology, "PC-1", "R-1", "SRV-PUBLIC", table, clientPort);
    setSteps(result.steps);
    setTable(result.table);
  };
  const newConnection = () => setClientPort(randomEphemeralPort());
  const clearTable = () => { setTable([]); setSteps([]); };

  const annotation = currentStep ? NAT_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;
  const displayTable = currentStep?.natTable ?? table;

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
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No request sent yet — click Send Request." />
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">NAT table (R-1)</div>
        <div className="p-3 space-y-1.5">
          {displayTable.length === 0 ? (
            <p className="text-xs text-neutral-600 italic px-1">Empty — nothing translated yet.</p>
          ) : (
            displayTable.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span className="text-indigo-300">{m.insideLocalIp}:{m.insideLocalPort}</span>
                <span className="text-neutral-600">↔</span>
                <span>{m.insideGlobalIp}:{m.insideGlobalPort}</span>
              </div>
            ))
          )}
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
              <p className="text-xs text-neutral-500 leading-relaxed">PC-1 (192.168.1.10) sends an HTTP request to SRV-PUBLIC (93.184.216.34) through R-1.</p>
              <div className="flex flex-col gap-1">
                <label htmlFor="nat-port" className="text-xs text-neutral-400 uppercase tracking-wider">Client port</label>
                <input id="nat-port" type="number" value={clientPort} onChange={(e) => setClientPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={newConnection} className="w-full px-4 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors">
                New Connection (random port)
              </button>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Request
              </button>
              <button type="button" onClick={clearTable} className="w-full px-4 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors">
                Clear NAT table
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{NAT_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{NAT_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{NAT_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={NAT_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="NAT / PAT" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a request to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="NAT"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="NAT"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a request from the Send tab to start playback.</p>
        )
      }
    />
  );
}
