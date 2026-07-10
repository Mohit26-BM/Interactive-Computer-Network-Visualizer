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
import { sendHttpRequest, HttpMethod, HttpStep, HTTP_CODE, HTTP_ANNOTATIONS, HTTP_COMPLEXITY } from "@/lib/http-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const PATH_OPTIONS = ["/", "/about", "/missing"];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "One HTTP request, one HTTP response — riding on top of the TCP connection already open between browser and server." },
  { heading: "How to use it", body: "Pick GET or POST and a path, then click Send. Try \"/missing\" to see a 404 instead of a 200, and switch to POST to see a body attached to the request." },
  { heading: "Why it matters", body: "This is the exchange that finally delivers the page — everything in Phases 1-4 exists to get this one request there and this one response back." },
];

export default function HttpPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const [clientLabel, setClientLabel] = useState("PC-1");
  const [serverLabel, setServerLabel] = useState("SRV-1");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/");
  const [body, setBody] = useState("name=visitor");
  const [steps, setSteps] = useState<HttpStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleSend = () => setSteps(sendHttpRequest(topology, clientLabel.trim().toUpperCase(), serverLabel.trim().toUpperCase(), method, path, method === "POST" ? body : undefined));

  const annotation = currentStep ? HTTP_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;

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
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No request sent yet — click Send Request." />
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
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Method</span>
                <div className="flex gap-1.5">
                  {(["GET", "POST"] as HttpMethod[]).map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        method === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Path</span>
                <div className="flex gap-1.5">
                  {PATH_OPTIONS.map((p) => (
                    <button key={p} type="button" onClick={() => setPath(p)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        path === p ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {method === "POST" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="http-body" className="text-xs text-neutral-400 uppercase tracking-wider">Body</label>
                  <input id="http-body" value={body} onChange={(e) => setBody(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="http-client" className="text-xs text-neutral-400 uppercase tracking-wider">Client</label>
                  <input id="http-client" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="http-server" className="text-xs text-neutral-400 uppercase tracking-wider">Server</label>
                  <input id="http-server" value={serverLabel} onChange={(e) => setServerLabel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button type="button" onClick={handleSend} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Send Request
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
                  <div className="text-sm font-bold text-indigo-400">{HTTP_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{HTTP_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{HTTP_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={HTTP_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="HTTP" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a request to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="HTTP"
      phaseLabel="Phase 5 · Application"
      helpTitle="HTTP"
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
