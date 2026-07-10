"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { simulateWebSocket, WebSocketStep, WEBSOCKET_CODE, WEBSOCKET_ANNOTATIONS, WEBSOCKET_COMPLEXITY } from "@/lib/websocket-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STAGE_LABEL: Record<string, string> = {
  "handshake-request": "HTTP Upgrade Request",
  "handshake-response": "HTTP 101 Response",
  open: "Connection Upgraded",
  message: "WebSocket Frame",
  close: "Close Handshake",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "One HTTP request asks to switch protocols; the server's 101 response confirms it; then the exact same TCP connection carries frames both directions indefinitely — including messages the server sends without being asked." },
  { heading: "How to use it", body: "Run and step through: watch the handshake happen exactly once, then messages flow freely — including one the server pushes on its own — before a Close handshake ends the session." },
  { heading: "Why it matters", body: "Compare this to HTTP (see the HTTP page): every HTTP exchange needs a fresh request to get a fresh response. This is the only page in the project where the server gets to speak first." },
];

export default function WebSocketPage() {
  const [steps, setSteps] = useState<WebSocketStep[]>([]);
  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateWebSocket());

  const annotation = currentStep ? WEBSOCKET_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const messagesSoFar = steps.slice(0, step + 1);

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">WebSocket — Client &harr; Server</span>
        {currentStep && <span className="text-xs text-neutral-500 font-mono">{STAGE_LABEL[currentStep.stage]}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        <div className={`px-3 py-2 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${currentStep?.messageFrom === "client" ? "bg-indigo-500/20 border-indigo-400 text-indigo-200" : "bg-neutral-900 border-neutral-700 text-neutral-400"}`}>Client</div>
        <div className={`px-3 py-2 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${currentStep?.messageFrom === "server" ? "bg-indigo-500/20 border-indigo-400 text-indigo-200" : "bg-neutral-900 border-neutral-700 text-neutral-400"}`}>Server</div>
      </div>

      <div className="space-y-1.5 max-w-lg mx-auto">
        {messagesSoFar.filter((s) => s.messageText).map((s, i) => (
          <div key={i} className={`flex ${s.messageFrom === "client" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] px-3 py-1.5 rounded-lg text-[11px] font-mono whitespace-pre-wrap ${
              s.stage === "close" ? "bg-red-500/10 border border-red-500/30 text-red-200" :
              s.stage.startsWith("handshake") ? "bg-neutral-800 border border-neutral-700 text-neutral-400" :
              s.messageFrom === "client" ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-200" : "bg-violet-500/15 border border-violet-500/30 text-violet-200"
            }`}>
              <span className="text-[9px] opacity-60 block mb-0.5">{s.messageFrom}</span>
              {s.messageText}
            </div>
          </div>
        ))}
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
              <p className="text-xs text-neutral-500 leading-relaxed">A client asks to upgrade an HTTP connection, chats with the server both ways, then closes cleanly.</p>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{WEBSOCKET_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{WEBSOCKET_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{WEBSOCKET_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={WEBSOCKET_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="WebSocket" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run the scenario to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="WebSocket"
      phaseLabel="Enterprise Networking"
      helpTitle="WebSocket"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run the scenario from the Send tab to start playback.</p>
        )
      }
    />
  );
}
