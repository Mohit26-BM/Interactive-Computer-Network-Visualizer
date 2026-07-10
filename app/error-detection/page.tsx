"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import Controls from "@/components/shared/Controls";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  computeCrc, verifyCrc, computeChecksum, verifyChecksum, computeParity, checkParity,
  ErrorDetectionStep, ErrorDetectionMode,
  CRC_CODE, CHECKSUM_CODE, PARITY_CODE, ERROR_DETECTION_ANNOTATIONS, ERROR_DETECTION_COMPLEXITY,
} from "@/lib/error-detection-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Computes the exact checksum/CRC/parity fields every earlier page has been showing as an opaque hex value — and shows what happens when a bit gets corrupted in transit." },
  { heading: "How to use it", body: "Pick a mode (CRC, Checksum, or Parity), run it, then check \"simulate a bit flip on receive\" and run again to watch the receiver actually catch the corruption." },
  { heading: "Why it matters", body: "Three different tradeoffs between cost and strength: parity is cheapest and weakest, checksum is what IP/UDP/TCP actually use, CRC is what Ethernet uses and catches far more." },
];

function flipFirstOneBit(bits: string): string {
  const arr = bits.split("");
  arr[0] = arr[0] === "1" ? "0" : "1";
  return arr.join("");
}

export default function ErrorDetectionPage() {
  const [mode, setMode] = useState<ErrorDetectionMode>("crc");

  const [message, setMessage] = useState("1101011011");
  const [polynomial, setPolynomial] = useState("10011");
  const [crcCorrupt, setCrcCorrupt] = useState(false);

  const [wordsInput, setWordsInput] = useState("0x4500,0x003c,0x1c46,0x4000");
  const [checksumCorrupt, setChecksumCorrupt] = useState(false);

  const [dataBits, setDataBits] = useState("1010001");
  const [parityMode, setParityMode] = useState<"even" | "odd">("even");
  const [parityCorrupt, setParityCorrupt] = useState(false);

  const [steps, setSteps] = useState<ErrorDetectionStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const runCrc = () => {
    const primary = computeCrc(message, polynomial);
    if (!crcCorrupt) { setSteps(primary); return; }
    const remainder = primary[primary.length - 1]?.bits?.slice(message.length) ?? "";
    const corrupted = flipFirstOneBit(message + remainder);
    const { steps: verifySteps } = verifyCrc(corrupted, polynomial);
    setSteps([...primary, ...verifySteps]);
  };

  const runChecksum = () => {
    const words = wordsInput.split(",").map((w) => parseInt(w.trim(), 16)).filter((w) => !Number.isNaN(w));
    const primary = computeChecksum(words);
    if (!checksumCorrupt) { setSteps(primary); return; }
    const checksum = primary[primary.length - 1]?.sum ?? 0;
    const corruptedWords = [...words];
    corruptedWords[0] = corruptedWords[0] ^ 0x0001;
    const { steps: verifySteps } = verifyChecksum(corruptedWords, checksum);
    setSteps([...primary, ...verifySteps]);
  };

  const runParity = () => {
    const primary = computeParity(dataBits, parityMode);
    if (!parityCorrupt) { setSteps(primary); return; }
    const parityBit = primary[primary.length - 1]?.parityBit ?? 0;
    const corrupted = flipFirstOneBit(dataBits) + parityBit;
    const { steps: verifySteps } = checkParity(corrupted, parityMode);
    setSteps([...primary, ...verifySteps]);
  };

  const annotation = currentStep ? ERROR_DETECTION_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const code = mode === "crc" ? CRC_CODE : mode === "checksum" ? CHECKSUM_CODE : PARITY_CODE;
  const complexity = ERROR_DETECTION_COMPLEXITY[mode];

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">
          {mode === "crc" ? "CRC (mod-2 division)" : mode === "checksum" ? "Internet Checksum" : "Parity"}
        </span>
      </div>

      {currentStep?.mode === "crc" && currentStep.bits && (
        <div className="flex flex-wrap gap-1">
          {currentStep.bits.split("").map((b, i) => {
            const degree = polynomial.length - 1;
            const inWindow = i >= (currentStep.position ?? 0) && i <= (currentStep.position ?? 0) + degree;
            return (
              <div key={i} className={`w-8 h-8 rounded-md border flex items-center justify-center text-sm font-mono font-bold transition-colors duration-200 ${
                inWindow ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200" : "bg-neutral-900 border-neutral-800 text-neutral-400"
              }`}>
                {b}
              </div>
            );
          })}
        </div>
      )}

      {currentStep?.mode === "checksum" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(currentStep.words ?? []).map((w, i) => (
              <span key={i} className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-300">
                0x{w.toString(16).toUpperCase().padStart(4, "0")}
              </span>
            ))}
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-4 py-3 inline-block">
            <div className="text-[10px] text-indigo-300 uppercase tracking-wider">Running sum</div>
            <div className="text-xl font-mono font-bold text-indigo-200">0x{(currentStep.sum ?? 0).toString(16).toUpperCase().padStart(4, "0")}</div>
          </div>
        </div>
      )}

      {currentStep?.mode === "parity" && currentStep.dataBits && (
        <div className="flex gap-1">
          {currentStep.dataBits.split("").map((b, i) => (
            <div key={i} className="w-8 h-8 rounded-md border border-neutral-800 bg-neutral-900 flex items-center justify-center text-sm font-mono font-bold text-neutral-300">
              {b}
            </div>
          ))}
          {currentStep.parityBit !== undefined && (
            <div className="w-8 h-8 rounded-md border border-indigo-500/50 bg-indigo-500/20 flex items-center justify-center text-sm font-mono font-bold text-indigo-200">
              {currentStep.parityBit}
            </div>
          )}
        </div>
      )}

      {steps.length > 0 && currentStep && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{currentStep.explanation}</span>
          <span className="ml-auto text-xs opacity-50 shrink-0">step {step + 1}/{steps.length}</span>
        </div>
      )}
      {steps.length === 0 && <p className="text-xs text-neutral-600 italic">Run a calculation from the Send tab.</p>}
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
                {(["crc", "checksum", "parity"] as ErrorDetectionMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setSteps([]); }}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      mode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>

              {mode === "crc" && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="crc-message" className="text-xs text-neutral-400 uppercase tracking-wider">Message (binary)</label>
                    <input id="crc-message" value={message} onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="crc-poly" className="text-xs text-neutral-400 uppercase tracking-wider">Polynomial (binary)</label>
                    <input id="crc-poly" value={polynomial} onChange={(e) => setPolynomial(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" checked={crcCorrupt} onChange={(e) => setCrcCorrupt(e.target.checked)} className="accent-indigo-500" />
                    Simulate a bit flip on receive
                  </label>
                  <button type="button" onClick={runCrc} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Compute CRC
                  </button>
                </div>
              )}

              {mode === "checksum" && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="cs-words" className="text-xs text-neutral-400 uppercase tracking-wider">16-bit words (hex, comma-separated)</label>
                    <input id="cs-words" value={wordsInput} onChange={(e) => setWordsInput(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" checked={checksumCorrupt} onChange={(e) => setChecksumCorrupt(e.target.checked)} className="accent-indigo-500" />
                    Simulate a bit flip on receive
                  </label>
                  <button type="button" onClick={runChecksum} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Compute Checksum
                  </button>
                </div>
              )}

              {mode === "parity" && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="par-bits" className="text-xs text-neutral-400 uppercase tracking-wider">Data bits (binary)</label>
                    <input id="par-bits" value={dataBits} onChange={(e) => setDataBits(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex gap-1.5">
                    {(["even", "odd"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setParityMode(m)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                          parityMode === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" checked={parityCorrupt} onChange={(e) => setParityCorrupt(e.target.checked)} className="accent-indigo-500" />
                    Simulate a bit flip on receive
                  </label>
                  <button type="button" onClick={runParity} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                    Compute Parity
                  </button>
                </div>
              )}
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
                  <div className="text-sm font-bold text-indigo-400">{complexity.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{complexity.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{complexity.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={code} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Error Detection" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a calculation to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Error Detection"
      phaseLabel="Network Algorithms"
      helpTitle="Error Detection"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a calculation from the Send tab to start playback.</p>
        )
      }
    />
  );
}
