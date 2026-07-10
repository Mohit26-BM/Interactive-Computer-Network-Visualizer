"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  simulateSmtp, simulatePop3, simulateImap, EmailMode, EmailStep,
  EMAIL_CODE, EMAIL_ANNOTATIONS, EMAIL_COMPLEXITY,
} from "@/lib/email-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-amber-500/15 border-amber-500/30 text-amber-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const MODES: { value: EmailMode; label: string }[] = [
  { value: "smtp", label: "SMTP (Send)" },
  { value: "pop3", label: "POP3 (Retrieve)" },
  { value: "imap", label: "IMAP (Retrieve)" },
];

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Sending mail is always SMTP, whichever client you use. Retrieving it is a choice: POP3 downloads a message and (by default) deletes the server's copy; IMAP leaves everything on the server and keeps every device's view in sync." },
  { heading: "How to use it", body: "Pick a protocol and run it — the command/response transcript is the real wire protocol, sent as plain text unless wrapped in TLS. Compare what the mailbox looks like after POP3 vs after IMAP." },
  { heading: "Why it matters", body: "\"Why does deleting an email on my phone also delete it on my laptop\" (IMAP) vs \"why did it disappear from my laptop after I checked it on my phone\" (POP3) is this exact distinction." },
];

export default function EmailPage() {
  const [mode, setMode] = useState<EmailMode>("smtp");
  const [steps, setSteps] = useState<EmailStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => {
    reset();
    if (mode === "smtp") setSteps(simulateSmtp());
    else if (mode === "pop3") setSteps(simulatePop3());
    else setSteps(simulateImap());
  };

  const annotation = currentStep ? EMAIL_ANNOTATIONS[mode][currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const transcriptSoFar = steps.slice(0, step + 1);

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{MODES.find((m) => m.value === mode)?.label}</span>
        {currentStep?.mailboxState && <span className="text-xs text-amber-400 font-mono">{currentStep.mailboxState}</span>}
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">wire transcript</div>
        <div className="p-3 space-y-2 font-mono text-xs max-h-72 overflow-y-auto">
          {transcriptSoFar.length === 0 && <p className="text-neutral-600 italic">Run a protocol from the Send tab to see the transcript.</p>}
          {transcriptSoFar.map((s, i) => (
            <div key={i} className="space-y-0.5">
              {s.command && <div className="text-indigo-300">C: {s.command}</div>}
              {s.response && <div className="text-neutral-400">S: {s.response}</div>}
            </div>
          ))}
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
              <div className="flex flex-col gap-1.5">
                {MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => { setMode(m.value); setSteps([]); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      mode === m.value ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{EMAIL_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{EMAIL_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{EMAIL_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={EMAIL_CODE[mode]} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm={`Email — ${MODES.find((m) => m.value === mode)?.label}`} stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a protocol to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Email Protocols"
      phaseLabel="Enterprise Networking"
      helpTitle="Email Protocols"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a protocol from the Send tab to start playback.</p>
        )
      }
    />
  );
}
