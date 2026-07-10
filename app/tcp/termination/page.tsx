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
  tcpTerminate, TcpTerminationStep, TerminationState,
  TCP_TERMINATION_CODE, TCP_TERMINATION_ANNOTATIONS, TCP_TERMINATION_COMPLEXITY,
} from "@/lib/tcp-termination-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STATE_COLOR: Record<TerminationState, string> = {
  ESTABLISHED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FIN_WAIT_1: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FIN_WAIT_2: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  TIME_WAIT: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  CLOSE_WAIT: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LAST_ACK: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CLOSED: "bg-neutral-800 text-neutral-400 border-neutral-700",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The four-way close: FIN, ACK, FIN, ACK — each side shutting down its own half of a full-duplex connection independently, ending in TIME_WAIT." },
  { heading: "How to use it", body: "Click Send FIN and step through both state machines. Notice the initiator can still receive data in FIN_WAIT_2, and the responder only sends its own FIN once its application is actually done." },
  { heading: "Why it matters", body: "Four packets, not two — and TIME_WAIT afterward — both exist for concrete reasons: independent half-closes, and protection against a lost final ACK or a stray late segment." },
];

export default function TcpTerminationPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [initiatorLabel, setInitiatorLabel] = useState("PC-1");
  const [responderLabel, setResponderLabel] = useState("SRV-1");
  const [initiatorPort] = useState(() => randomEphemeralPort());
  const [responderPort] = useState(80);
  const [steps, setSteps] = useState<TcpTerminationStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(tcpTerminate(topology, initiatorLabel.trim().toUpperCase(), responderLabel.trim().toUpperCase(), initiatorPort, responderPort));

  const annotation = currentStep ? TCP_TERMINATION_ANNOTATIONS[currentStep.highlightLine] : undefined;
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
        <div className={`flex-1 border rounded-lg px-3 py-2 text-center transition-colors duration-300 ${STATE_COLOR[currentStep?.initiatorState ?? "ESTABLISHED"]}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Initiator</div>
          <div className="text-sm font-mono font-bold">{currentStep?.initiatorState ?? "ESTABLISHED"}</div>
        </div>
        <div className={`flex-1 border rounded-lg px-3 py-2 text-center transition-colors duration-300 ${STATE_COLOR[currentStep?.responderState ?? "ESTABLISHED"]}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Responder</div>
          <div className="text-sm font-mono font-bold">{currentStep?.responderState ?? "ESTABLISHED"}</div>
        </div>
      </div>
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No teardown started yet — click Send FIN." />
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
                <label htmlFor="term-initiator" className="text-xs text-neutral-400 uppercase tracking-wider">Initiator</label>
                <input id="term-initiator" value={initiatorLabel} onChange={(e) => setInitiatorLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="term-responder" className="text-xs text-neutral-400 uppercase tracking-wider">Responder</label>
                <input id="term-responder" value={responderLabel} onChange={(e) => setResponderLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send FIN
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
                  <div className="text-sm font-bold text-indigo-400">{TCP_TERMINATION_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{TCP_TERMINATION_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TCP_TERMINATION_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_TERMINATION_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TCP Connection Termination" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a FIN to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP Connection Termination"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP Connection Termination"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Send a FIN from the Send tab to start playback.</p>
        )
      }
    />
  );
}
