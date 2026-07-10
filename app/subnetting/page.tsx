"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import { calculateSubnet, SubnetResult, SUBNETTING_CODE, SUBNETTING_ANNOTATIONS, SUBNETTING_COMPLEXITY } from "@/lib/subnetting-engine";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A live CIDR calculator — type a block, instantly see the network ID, broadcast address, mask, and usable host range." },
  { heading: "How to use it", body: "There's no playback here on purpose: subnetting is arithmetic, not a process with steps worth scrubbing through." },
  { heading: "Why it matters", body: "Every device on this whole site got its IP from a block exactly like this one — this is the math behind those addresses." },
];

const DEFAULT_CIDR = "192.168.1.0/24";

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-neutral-800 rounded-lg p-3">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-sm font-bold text-indigo-300 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function AddressBar({ result }: { result: SubnetResult }) {
  const showEnds = result.prefix <= 30;
  return (
    <div className="space-y-2">
      <div className="flex h-10 rounded-lg overflow-hidden border border-neutral-800">
        {showEnds && <div className="w-10 shrink-0 bg-red-500/20 border-r border-neutral-800 flex items-center justify-center text-[9px] text-red-300 font-mono">NET</div>}
        <div className="flex-1 bg-indigo-500/15 flex items-center justify-center text-[10px] text-indigo-300 font-mono">
          {result.usableHosts.toLocaleString()} usable
        </div>
        {showEnds && <div className="w-10 shrink-0 bg-amber-500/20 border-l border-neutral-800 flex items-center justify-center text-[9px] text-amber-300 font-mono">BCAST</div>}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-neutral-500">
        <span>{result.network}</span>
        <span>{result.broadcast}</span>
      </div>
    </div>
  );
}

export default function SubnettingPage() {
  const [input, setInput] = useState(DEFAULT_CIDR);
  const [result, setResult] = useState<SubnetResult | { ok: false; error: string }>(() => calculateSubnet(DEFAULT_CIDR));
  const [runCount, setRunCount] = useState(0);

  const handleCalculate = () => {
    setResult(calculateSubnet(input));
    setRunCount((c) => c + 1);
  };

  const summary = result.ok
    ? `${result.cidr}: network ${result.network}, broadcast ${result.broadcast}, mask ${result.mask}, usable range ${result.firstHost} - ${result.lastHost} (${result.usableHosts.toLocaleString()} usable hosts).`
    : `Invalid input: ${result.error}`;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Address block</span>
        {result.ok && <span className="text-xs text-neutral-500 font-mono">{result.cidr}</span>}
      </div>

      {!result.ok ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">{result.error}</div>
      ) : (
        <>
          <AddressBar result={result} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Network ID" value={result.network} />
            <Field label="Broadcast" value={result.broadcast} />
            <Field label="Subnet Mask" value={result.mask} />
            <Field label="Wildcard Mask" value={result.wildcard} />
            <Field label="First Host" value={result.firstHost ?? "—"} />
            <Field label="Last Host" value={result.lastHost ?? "—"} />
          </div>
        </>
      )}
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "calculate",
          label: "Calculate",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="subnet-input" className="text-xs text-neutral-400 uppercase tracking-wider">CIDR block</label>
                <input
                  id="subnet-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
                  placeholder={DEFAULT_CIDR}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button type="button" onClick={handleCalculate} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Calculate
              </button>
              <div className="pt-2 space-y-1.5">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Try</div>
                {["10.0.0.0/8", "192.168.1.0/24", "172.16.4.0/22", "192.168.1.128/30"].map((c) => (
                  <button key={c} type="button" onClick={() => { setInput(c); setResult(calculateSubnet(c)); setRunCount((n) => n + 1); }}
                    className="w-full text-left text-xs font-mono text-neutral-400 hover:text-indigo-300 transition-colors">
                    {c}
                  </button>
                ))}
              </div>
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
                  <div className="text-lg font-bold text-indigo-400">{SUBNETTING_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{SUBNETTING_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{SUBNETTING_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={SUBNETTING_CODE} highlightLine={result.ok ? 5 : 0} annotation={SUBNETTING_ANNOTATIONS[5]} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: (
            <AIExplainer algorithm="Subnetting" stepExplanation={summary} stepIndex={runCount} totalSteps={1} />
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Subnetting"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="Subnetting"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
    />
  );
}
