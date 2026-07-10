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
import { buildDefaultTopology } from "@/lib/topology-engine";
import {
  tlsHandshake, sendEncryptedHttp, visibilityComparison, TlsStep, TlsState,
  TLS_CODE, TLS_ANNOTATIONS, TLS_COMPLEXITY,
} from "@/lib/tls-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STATE_COLOR: Record<TlsState, string> = {
  NONE: "bg-neutral-800 text-neutral-400 border-neutral-700",
  HELLO_EXCHANGED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CERT_VERIFIED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  KEYS_EXCHANGED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ESTABLISHED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "The TLS handshake — ClientHello, ServerHello, Certificate, Key Exchange, Finished — followed by an HTTP request riding inside the now-encrypted session." },
  { heading: "How to use it", body: "Click Start Handshake and step through. Once the session is ESTABLISHED, click Send Encrypted HTTP to see the same request from the HTTP page, now opaque on the wire — compare it in the Compare tab." },
  { heading: "Why it matters", body: "HTTPS isn't a different protocol from HTTP — it's HTTP running after TLS has already set up an encrypted channel, not instead of it." },
];

export default function HttpsPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [clientLabel, setClientLabel] = useState("PC-1");
  const [serverLabel, setServerLabel] = useState("SRV-1");
  const [steps, setSteps] = useState<TlsStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleHandshake = () => setSteps(tlsHandshake(topology, clientLabel.trim().toUpperCase(), serverLabel.trim().toUpperCase()));
  const handleSendHttp = () => setSteps((prev) => [...prev, ...sendEncryptedHttp(topology, clientLabel.trim().toUpperCase(), serverLabel.trim().toUpperCase())]);

  const annotation = currentStep ? TLS_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;
  const sessionState = currentStep?.sessionState ?? "NONE";
  const canSendHttp = sessionState === "ESTABLISHED" && !steps.some((s) => s.packet.id === "tls-http");

  const comparison = visibilityComparison();

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Visualization</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices</span>
      </div>
      <StackIndicator active="Application" />
      {displayPacket ? (
        <PacketVisualizer topology={displayTopology} packet={displayPacket} />
      ) : (
        <PacketVisualizer topology={topology} packet={{ id: "idle", layers: [], currentLink: null, progress: 0, atNode: null, fate: "queued" }} />
      )}
      <div className={`border rounded-lg px-3 py-2 text-center transition-colors duration-300 ${STATE_COLOR[sessionState]}`}>
        <div className="text-[10px] uppercase tracking-wider opacity-70">TLS session</div>
        <div className="text-sm font-mono font-bold">{sessionState}</div>
      </div>
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No handshake started yet — click Start Handshake." />
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
                  <label htmlFor="tls-client" className="text-xs text-neutral-400 uppercase tracking-wider">Client</label>
                  <input id="tls-client" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="tls-server" className="text-xs text-neutral-400 uppercase tracking-wider">Server</label>
                  <input id="tls-server" value={serverLabel} onChange={(e) => setServerLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button type="button" onClick={handleHandshake} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Start Handshake
              </button>
              <button
                type="button"
                onClick={handleSendHttp}
                disabled={!canSendHttp}
                className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canSendHttp ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                }`}
              >
                Send Encrypted HTTP
              </button>
              {!canSendHttp && sessionState !== "ESTABLISHED" && (
                <p className="text-xs text-neutral-600 italic">Finish the handshake first — HTTP can&apos;t ride inside a session that isn&apos;t established yet.</p>
              )}
            </div>
          ),
        },
        {
          id: "compare",
          label: "Compare",
          content: (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">The same GET request to a page with a session cookie — with and without TLS.</p>
              <div>
                <div className="text-xs font-mono text-red-300 uppercase tracking-wider mb-1.5">Without TLS (plain HTTP)</div>
                <PacketInspector layers={comparison.plaintext} />
              </div>
              <div>
                <div className="text-xs font-mono text-emerald-300 uppercase tracking-wider mb-1.5">With TLS (HTTPS)</div>
                <PacketInspector layers={comparison.encrypted} />
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">Anyone watching the wire without TLS sees the path and the session cookie in plain text — anyone watching with TLS sees only encrypted bytes.</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{TLS_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{TLS_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{TLS_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TLS_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="TLS Handshake" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Start a handshake to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="HTTPS / TLS"
      phaseLabel="Phase 5 · Application"
      helpTitle="HTTPS / TLS"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Start a handshake from the Send tab to start playback.</p>
        )
      }
    />
  );
}
