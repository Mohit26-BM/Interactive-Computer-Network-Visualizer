"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  checkPacket, ACL_RULES, PRESET_PACKETS, PacketDescriptor, FirewallStep,
  FIREWALL_CODE, FIREWALL_ANNOTATIONS, FIREWALL_COMPLEXITY,
} from "@/lib/firewall-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A firewall/ACL guarding SRV-1, checked top to bottom against one packet at a time. First matching rule wins immediately — everything after it is irrelevant. Nothing matched at all falls through to an implicit deny." },
  { heading: "How to use it", body: "Pick a packet type and Run. Watch the rules light up one at a time until either a rule matches (permit/deny) or the list runs out (implicit deny)." },
  { heading: "Why it matters", body: "This is the exact mechanism behind every ACL and packet-filtering firewall — permit/deny by rule order, not path-finding. The Network Devices page pointed here for exactly this." },
];

export default function FirewallAclPage() {
  const [packet, setPacket] = useState<PacketDescriptor>(PRESET_PACKETS[0]);
  const [steps, setSteps] = useState<FirewallStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleRun = () => setSteps(checkPacket(ACL_RULES, packet));

  const annotation = currentStep ? FIREWALL_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">ACL — guarding SRV-1</span>
        {currentStep?.outcome && (
          <span className={`text-xs font-mono font-bold uppercase tracking-wider ${currentStep.outcome === "permit" ? "text-emerald-400" : "text-red-400"}`}>
            {currentStep.outcome}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {ACL_RULES.map((rule, i) => {
          const isCurrent = currentStep?.ruleIndex === i;
          const isMatched = isCurrent && currentStep?.matched;
          const wasSkipped = currentStep && currentStep.ruleIndex !== null && currentStep.ruleIndex > i;
          return (
            <div key={rule.id} className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all duration-300 ${
              isMatched
                ? (rule.action === "permit" ? "bg-emerald-500/20 border-emerald-400 text-emerald-200" : "bg-red-500/20 border-red-400 text-red-200")
                : isCurrent
                ? "bg-indigo-500/15 border-indigo-400 text-indigo-200"
                : wasSkipped
                ? "bg-neutral-900 border-neutral-800 text-neutral-600 opacity-50"
                : "bg-neutral-900 border-neutral-700 text-neutral-400"
            }`}>
              <span className="text-neutral-500 mr-2">{rule.id}.</span>{rule.description}
            </div>
          );
        })}
        <div className={`px-3 py-2 rounded-lg border text-xs font-mono transition-all duration-300 ${
          currentStep && currentStep.ruleIndex === null && currentStep.outcome === "deny"
            ? "bg-red-500/20 border-red-400 text-red-200"
            : "bg-neutral-900 border-neutral-800 text-neutral-600 italic"
        }`}>
          (implicit) deny any any
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
                {PRESET_PACKETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setPacket(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-colors ${
                      packet.label === p.label ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}>
                    {p.label}
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
                  <div className="text-xs font-bold text-indigo-400 leading-snug">{FIREWALL_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{FIREWALL_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{FIREWALL_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={FIREWALL_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="Firewall / ACL" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a packet to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Firewall & ACL"
      phaseLabel="Enterprise Networking"
      helpTitle="Firewall & ACL"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a packet from the Send tab to start playback.</p>
        )
      }
    />
  );
}
