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
import {
  tcpHandshake, TcpHandshakeStep, TcpConnState,
  TCP_HANDSHAKE_CODE, TCP_HANDSHAKE_ANNOTATIONS, TCP_HANDSHAKE_COMPLEXITY,
} from "@/lib/tcp-handshake-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STATE_COLOR: Record<TcpConnState, string> = {
  CLOSED: "bg-neutral-800 text-neutral-400 border-neutral-700",
  LISTEN: "bg-neutral-800 text-neutral-400 border-neutral-700",
  SYN_SENT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  SYN_RCVD: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ESTABLISHED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The three-way handshake that opens every TCP connection: SYN, then SYN-ACK, then ACK — and the connection-state machine each side moves through." },
  { heading: "How to use it", body: "Click Send SYN and step through. Watch both the packet travel the topology and the Client/Server state pills change — SYN_SENT and SYN_RCVD are real, separate states, not just \"in progress.\"" },
  { heading: "Why it matters", body: "Every TCP conversation — HTTP, HTTPS, SSH — starts with exactly this exchange before a single byte of real data moves." },
];

export default function TcpHandshakePage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [clientLabel, setClientLabel] = useState("PC-1");
  const [serverLabel, setServerLabel] = useState("SRV-1");
  const [clientPort, setClientPort] = useState(() => randomEphemeralPort());
  const [serverPort, setServerPort] = useState(80);
  const [steps, setSteps] = useState<TcpHandshakeStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(tcpHandshake(topology, clientLabel.trim().toUpperCase(), serverLabel.trim().toUpperCase(), clientPort, serverPort));

  const annotation = currentStep ? TCP_HANDSHAKE_ANNOTATIONS[currentStep.highlightLine] : undefined;
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
      <div className="flex gap-3">
        <div className={`flex-1 border rounded-lg px-3 py-2 text-center transition-colors duration-300 ${STATE_COLOR[currentStep?.clientState ?? "CLOSED"]}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Client</div>
          <div className="text-sm font-mono font-bold">{currentStep?.clientState ?? "CLOSED"}</div>
        </div>
        <div className={`flex-1 border rounded-lg px-3 py-2 text-center transition-colors duration-300 ${STATE_COLOR[currentStep?.serverState ?? "LISTEN"]}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Server</div>
          <div className="text-sm font-mono font-bold">{currentStep?.serverState ?? "LISTEN"}</div>
        </div>
      </div>
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No handshake started yet — click Send SYN." />
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
                <label htmlFor="tcp-client" className="text-xs text-neutral-400 uppercase tracking-wider">Client</label>
                <input id="tcp-client" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="tcp-server" className="text-xs text-neutral-400 uppercase tracking-wider">Server</label>
                <input id="tcp-server" value={serverLabel} onChange={(e) => setServerLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="tcp-cport" className="text-xs text-neutral-400 uppercase tracking-wider">Client port</label>
                  <input id="tcp-cport" type="number" value={clientPort} onChange={(e) => setClientPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="tcp-sport" className="text-xs text-neutral-400 uppercase tracking-wider">Server port</label>
                  <input id="tcp-sport" type="number" value={serverPort} onChange={(e) => setServerPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send SYN
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
                  <div className="text-sm font-bold text-indigo-400">{TCP_HANDSHAKE_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{TCP_HANDSHAKE_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_HANDSHAKE_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_HANDSHAKE_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Handshake" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a SYN to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Handshake"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Handshake"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a SYN from the Send tab to start playback.</p>
        )
      }
    />
  );
}
