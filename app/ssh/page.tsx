"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { simulateSsh, SshAuthMethod, SshStep, SSH_CODE, SSH_ANNOTATIONS, SSH_COMPLEXITY } from "@/lib/ssh-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-amber-500/15 border-amber-500/30 text-amber-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const STAGE_LABEL: Record<string, string> = {
  banner: "Version Banner",
  kex: "Key Exchange",
  hostkey: "Host Key Check",
  auth: "Authentication",
  shell: "Encrypted Shell",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A Diffie-Hellman key exchange encrypts the channel first; only then does authentication (password or public key) happen — inside the tunnel, never in the clear. Compare it to the HTTPS page's TLS handshake — same shape, different trust model." },
  { heading: "How to use it", body: "Pick an authentication method and whether this is the first connection to this host, then run it. Watch the lock icon turn on at Key Exchange, before a single credential is sent." },
  { heading: "Why it matters", body: "\"The authenticity of host '...' can't be established\" — the warning every SSH user has seen at least once — is exactly the Trust On First Use step this page shows." },
];

export default function SshPage() {
  const [authMethod, setAuthMethod] = useState<SshAuthMethod>("publickey");
  const [firstConnection, setFirstConnection] = useState(true);
  const [steps, setSteps] = useState<SshStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(simulateSsh(authMethod, firstConnection));

  const annotation = currentStep ? SSH_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">SSH — Client &harr; Server</span>
        {currentStep && <span className="text-xs text-neutral-500 font-mono">{STAGE_LABEL[currentStep.stage]}</span>}
      </div>

      <div className="flex items-center justify-center gap-6 py-4">
        <div className={`px-4 py-2.5 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${currentStep ? "bg-indigo-500/20 border-indigo-400 text-indigo-200" : "bg-neutral-900 border-neutral-700 text-neutral-400"}`}>
          Client
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className={`w-20 h-px transition-all duration-300 ${currentStep ? "bg-indigo-400" : "bg-neutral-700"}`} />
          <span className={`text-lg transition-all duration-300 ${currentStep?.encrypted ? "opacity-100" : "opacity-25"}`} title={currentStep?.encrypted ? "channel encrypted" : "plaintext"}>
            {currentStep?.encrypted ? "\u{1F512}" : "\u{1F513}"}
          </span>
        </div>
        <div className={`px-4 py-2.5 rounded-lg border text-xs font-mono text-center transition-all duration-300 ${currentStep ? "bg-indigo-500/20 border-indigo-400 text-indigo-200" : "bg-neutral-900 border-neutral-700 text-neutral-400"}`}>
          Server
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
                <label className="text-xs text-neutral-400 uppercase tracking-wider">Authentication</label>
                <div className="flex gap-1.5">
                  {(["publickey", "password"] as SshAuthMethod[]).map((m) => (
                    <button key={m} type="button" onClick={() => setAuthMethod(m)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${authMethod === m ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"}`}>
                      {m === "publickey" ? "Public Key" : "Password"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input type="checkbox" checked={firstConnection} onChange={(e) => setFirstConnection(e.target.checked)} className="accent-indigo-500" />
                First connection to this host (Trust On First Use)
              </label>
              <button type="button" onClick={handleRun} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Connect
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{SSH_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{SSH_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{SSH_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={SSH_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="SSH" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Connect to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="SSH"
      phaseLabel="Enterprise Networking"
      helpTitle="SSH"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Connect from the Send tab to start playback.</p>
        )
      }
    />
  );
}
