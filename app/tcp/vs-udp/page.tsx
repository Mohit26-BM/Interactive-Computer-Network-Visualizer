"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  TCP_VS_UDP_COMPARISON, SCENARIOS, Scenario,
  TCP_VS_UDP_CODE, TCP_VS_UDP_ANNOTATIONS,
} from "@/lib/tcp-vs-udp-engine";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Puts TCP and UDP side by side — a dimension-by-dimension comparison table, plus the same real-world scenario played out under each protocol." },
  { heading: "How to use it", body: "Pick a scenario (video call, web page, DNS lookup) and read what happens to it under TCP vs UDP when something goes wrong in transit." },
  { heading: "Why it matters", body: "Every behavior described here was already simulated in detail on the UDP, TCP Data Transfer, and TCP Congestion Control pages — this is where the tradeoff actually gets decided." },
];

const SCENARIO_ORDER: Scenario[] = ["video", "webpage", "dns"];

export default function TcpVsUdpPage() {
  const [scenario, setScenario] = useState<Scenario>("video");
  const [runCount, setRunCount] = useState(0);
  const current = SCENARIOS[scenario];

  const pick = (s: Scenario) => { setScenario(s); setRunCount((c) => c + 1); };

  const summary = `${current.label}: ${current.description} Under TCP — ${current.tcp[0]} Under UDP — ${current.udp[0]}`;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">{current.label}</span>
      </div>
      <p className="text-xs text-neutral-500 italic">{current.description}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-neutral-900 border border-indigo-500/30 rounded-xl p-3.5 space-y-2">
          <div className="text-xs font-mono font-bold text-indigo-300 uppercase tracking-wider">TCP</div>
          <ul className="space-y-1.5">
            {current.tcp.map((line, i) => (
              <li key={i} className="text-xs text-neutral-400 leading-relaxed">&bull; {line}</li>
            ))}
          </ul>
        </div>
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-3.5 space-y-2">
          <div className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider">UDP</div>
          <ul className="space-y-1.5">
            {current.udp.map((line, i) => (
              <li key={i} className="text-xs text-neutral-400 leading-relaxed">&bull; {line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "compare",
          label: "Compare",
          content: (
            <div className="space-y-3">
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Scenario</div>
              <div className="space-y-1.5">
                {SCENARIO_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pick(s)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      scenario === s ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}
                  >
                    {SCENARIOS[s].label}
                  </button>
                ))}
              </div>
            </div>
          ),
        },
        {
          id: "reference",
          label: "Reference",
          content: (
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-900 text-neutral-500">
                    <th className="text-left px-2.5 py-1.5 font-medium">Dimension</th>
                    <th className="text-left px-2.5 py-1.5 font-medium">TCP</th>
                    <th className="text-left px-2.5 py-1.5 font-medium">UDP</th>
                  </tr>
                </thead>
                <tbody>
                  {TCP_VS_UDP_COMPARISON.map((row) => (
                    <tr key={row.dimension} className="border-t border-neutral-800 align-top">
                      <td className="px-2.5 py-2 font-medium text-white whitespace-nowrap">{row.dimension}</td>
                      <td className="px-2.5 py-2 text-neutral-400">{row.tcp}</td>
                      <td className="px-2.5 py-2 text-neutral-400">{row.udp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={TCP_VS_UDP_CODE} highlightLine={2} annotation={TCP_VS_UDP_ANNOTATIONS[2]} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: <AIExplainer algorithm="TCP vs UDP" stepExplanation={summary} stepIndex={runCount} totalSteps={1} />,
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="TCP vs UDP"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="TCP vs UDP"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
    />
  );
}
