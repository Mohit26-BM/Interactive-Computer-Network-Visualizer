"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateAssociation, simulateHiddenNode, WirelessStep, HiddenNodeStep,
  WIRELESS_CODE, WIRELESS_ANNOTATIONS, WIRELESS_COMPLEXITY,
} from "@/lib/wireless-engine";

type View = "association" | "hidden-node";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Two things Wi-Fi has that wired Ethernet doesn't: an explicit join handshake (beacon, authenticate, associate) before any data flows, and the hidden node problem — a collision neither sender can sense, because carrier sense only covers each sender's own radio range." },
  { heading: "How to use it", body: "Association tab: watch a client join an AP. Hidden Node tab: two stations that can't hear each other both send to the same AP — toggle RTS/CTS to see the fix." },
  { heading: "Why it matters", body: "This is why Wi-Fi uses CSMA/CA (see Medium Access Control) instead of Ethernet's CSMA/CD — a wireless station literally cannot listen while it transmits the way a wired one can." },
];

function Node({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${
      active ? "bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.4)]" : "bg-neutral-900 border-neutral-700 text-neutral-400"
    }`}>
      {label}
    </div>
  );
}

export default function WirelessPage() {
  const [view, setView] = useState<View>("association");
  const [ssid, setSsid] = useState("HomeNet-5G");
  const [rtsCts, setRtsCts] = useState(false);
  const [assocSteps, setAssocSteps] = useState<WirelessStep[]>([]);
  const [hnSteps, setHnSteps] = useState<HiddenNodeStep[]>([]);

  const steps = view === "association" ? assocSteps : hnSteps;
  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const assocStep = view === "association" ? assocSteps[step] : undefined;
  const hnStep = view === "hidden-node" ? hnSteps[step] : undefined;

  const handleRun = () => {
    reset();
    if (view === "association") setAssocSteps(simulateAssociation(ssid));
    else setHnSteps(simulateHiddenNode(rtsCts));
  };

  const explanation = view === "association" ? assocStep?.explanation : hnStep?.explanation;
  const phase = view === "association" ? assocStep?.phase : hnStep?.phase;
  const captionClass = phaseCaption[phase ?? "default"] ?? phaseCaption.default;
  const annotation = WIRELESS_ANNOTATIONS[(view === "association" ? assocStep?.highlightLine : hnStep?.highlightLine) ?? -1];

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{view === "association" ? "Wi-Fi Association" : "Hidden Node Problem"}</span>
      </div>

      {view === "association" ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <Node label={`AP (SSID: ${ssid})`} active={assocStep?.stage === "beacon" || assocStep?.stage === "auth" || assocStep?.stage === "assoc"} />
          <div className={`w-px h-8 transition-all duration-300 ${assocStep ? "bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.6)]" : "bg-neutral-700"}`} />
          <Node label="Client" active={Boolean(assocStep)} />
          {assocStep && (
            <p className="text-xs text-neutral-500 font-mono uppercase tracking-wider">stage: {assocStep.stage}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-8 py-6">
          <Node label="Station A" active={Boolean(hnStep?.aSending)} />
          <div className="flex flex-col items-center gap-1">
            <div className={`w-16 h-px transition-all duration-300 ${hnStep?.aSending || hnStep?.ctsIssued ? "bg-indigo-400" : "bg-neutral-700"}`} />
            <Node label="AP" active={Boolean(hnStep?.aSending || hnStep?.cSending || hnStep?.ctsIssued)} />
            <div className={`w-16 h-px transition-all duration-300 ${hnStep?.cSending || hnStep?.ctsIssued ? "bg-indigo-400" : "bg-neutral-700"}`} />
          </div>
          <Node label="Station C" active={Boolean(hnStep?.cSending)} />
        </div>
      )}

      {hnStep?.outcome && (
        <p className={`text-center text-xs font-mono uppercase tracking-wider ${hnStep.outcome === "collision" ? "text-red-400" : "text-green-400"}`}>
          {hnStep.outcome === "collision" ? "collision at AP" : "delivered — no collision"}
        </p>
      )}

      {explanation && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{explanation}</span>
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
              <div className="flex gap-1.5">
                {(["association", "hidden-node"] as View[]).map((v) => (
                  <button key={v} type="button" onClick={() => { setView(v); reset(); }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === v ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"}`}>
                    {v === "association" ? "Association" : "Hidden Node"}
                  </button>
                ))}
              </div>
              {view === "association" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 uppercase tracking-wider">SSID</label>
                  <input value={ssid} onChange={(e) => setSsid(e.target.value)} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              ) : (
                <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                  <input type="checkbox" checked={rtsCts} onChange={(e) => setRtsCts(e.target.checked)} className="accent-indigo-500" />
                  Enable RTS/CTS
                </label>
              )}
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{WIRELESS_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{WIRELESS_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{WIRELESS_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={WIRELESS_CODE} highlightLine={(view === "association" ? assocStep?.highlightLine : hnStep?.highlightLine) ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: explanation ? (
            <AIExplainer algorithm={view === "association" ? "Wi-Fi Association" : "Hidden Node Problem"} stepExplanation={explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a scenario to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Wireless Networking"
      phaseLabel="Enterprise Networking"
      helpTitle="Wireless Networking"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a scenario from the Send tab to start playback.</p>
        )
      }
    />
  );
}
