"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildLanTopology } from "@/lib/topology-engine";
import { demoMacLearning, MAC_LEARNING_CODE, MAC_LEARNING_ANNOTATIONS, MAC_LEARNING_COMPLEXITY } from "@/lib/mac-learning-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sends a sequence of frames through SW-1 and watches its MAC address table build up: unknown destinations get flooded, known ones get forwarded directly." },
  { heading: "How to use it", body: "Click Run Demo Sequence for the classic three-frame story, or send your own frames one at a time and watch the table grow." },
  { heading: "Why it matters", body: "This single behavior — flood until learned, then forward — is almost everything a switch does." },
];

export default function MacLearningPage() {
  const [topology] = useState(() => buildLanTopology());
  const [history, setHistory] = useState<[string, string][]>([]);
  const [fromLabel, setFromLabel] = useState("PC-1");
  const [toLabel, setToLabel] = useState("PC-2");

  const steps = demoMacLearning(topology, "SW-1", history);
  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const runDemoSequence = () => setHistory([["PC-1", "PC-2"], ["PC-2", "PC-1"], ["PC-1", "PC-2"]]);
  const sendOne = () => setHistory((h) => [...h, [fromLabel.trim().toUpperCase(), toLabel.trim().toUpperCase()]]);
  const clear = () => setHistory([]);

  const annotation = currentStep ? MAC_LEARNING_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const table = currentStep?.macTable ?? {};

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">SW-1&apos;s view of the LAN</span>
        <span className="text-xs text-neutral-500">{history.length} frame(s) sent</span>
      </div>
      <TopologyVisualizer
        state={displayTopology}
        highlightDevices={currentStep?.highlightDevices}
        highlightLinks={currentStep?.highlightLinks}
        phase={currentStep?.phase}
      />
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">MAC address table</div>
        <div className="p-3">
          {Object.keys(table).length === 0 ? (
            <p className="text-xs text-neutral-600 italic px-1">Empty — nothing learned yet.</p>
          ) : (
            <div className="space-y-1">
              {Object.entries(table).map(([mac, deviceId]) => (
                <div key={mac} className="flex justify-between text-[11px] font-mono text-neutral-300 px-1">
                  <span>{mac}</span>
                  <span className="text-indigo-300">{displayTopology.devices.find((d) => d.id === deviceId)?.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {currentStep && (
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
          id: "run",
          label: "Run",
          content: (
            <div className="space-y-4">
              <button type="button" onClick={runDemoSequence} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Run Demo Sequence
              </button>
              <p className="text-xs text-neutral-500 leading-relaxed">PC-1 → PC-2, then PC-2 → PC-1, then PC-1 → PC-2 again — only the very first frame floods; the reply already knows where PC-1 is.</p>

              <div className="border-t border-neutral-800 pt-3 space-y-2">
                <div className="text-xs text-neutral-400 uppercase tracking-wider">Send one frame</div>
                <div className="flex gap-2">
                  <input aria-label="From device" placeholder="From" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)}
                    className="w-1/2 px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500" />
                  <input aria-label="To device" placeholder="To" value={toLabel} onChange={(e) => setToLabel(e.target.value)}
                    className="w-1/2 px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <button type="button" onClick={sendOne} className="w-full px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Send Frame
                </button>
              </div>

              <button type="button" onClick={clear} className="w-full px-4 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors">
                Clear history
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
                  <div className="text-lg font-bold text-indigo-400">{MAC_LEARNING_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{MAC_LEARNING_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{MAC_LEARNING_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={MAC_LEARNING_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="MAC Address Learning" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Send a frame to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="MAC Address Learning"
      phaseLabel="Phase 2 · Layer 2"
      helpTitle="MAC Address Learning"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
          onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
          onReset={reset} onSpeedChange={setSpeed} />
      }
    />
  );
}
