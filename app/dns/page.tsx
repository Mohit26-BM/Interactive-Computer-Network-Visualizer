"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer from "@/components/topology/TopologyVisualizer";
import PacketInspector from "@/components/shared/PacketInspector";
import StackIndicator from "@/components/shared/StackIndicator";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import { usePlayer } from "@/components/shared/usePlayer";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildDnsTopology } from "@/lib/topology-engine";
import { resolveDns, DnsCache, DnsStep, DNS_CODE, DNS_ANNOTATIONS, DNS_COMPLEXITY } from "@/lib/dns-engine";

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Resolves a domain name to an IP address the way a real recursive resolver does — walking root → TLD → authoritative server on a cache miss, or answering instantly on a cache hit." },
  { heading: "How to use it", body: "Click Resolve for \"google.com\" — watch the full referral chain. Click Resolve again for the same domain and watch it skip straight to a cache hit." },
  { heading: "Why it matters", body: "This is what actually happens before your browser can even open a connection — no IP address, no TCP handshake, no HTTP request." },
];

const DOMAIN_OPTIONS = ["google.com", "example.com", "wikipedia.org"];

export default function DnsPage() {
  const [topology] = useState(() => buildDnsTopology());
  const [domain, setDomain] = useState("google.com");
  const [cache, setCache] = useState<DnsCache>({});
  const [steps, setSteps] = useState<DnsStep[]>([]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const currentStep = steps[step];

  const handleResolve = () => {
    const result = resolveDns(topology, cache, "PC-1", "RESOLVER", domain);
    setSteps(result.steps);
    setCache(result.cache);
  };
  const clearCache = () => { setCache({}); setSteps([]); };

  const annotation = currentStep ? DNS_ANNOTATIONS[currentStep.highlightLine] : undefined;
  const captionClass = phaseCaption[currentStep?.phase ?? "default"] ?? phaseCaption.default;
  const displayTopology = currentStep?.topology ?? topology;
  const displayPacket = currentStep?.packet;
  const displayCache = currentStep?.cache ?? cache;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Visualization</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices</span>
      </div>
      <StackIndicator active="Application" />
      <TopologyVisualizer
        state={displayTopology}
        highlightDevices={displayPacket?.atNode ? [displayPacket.atNode] : []}
        highlightLinks={displayPacket?.currentLink ? [displayPacket.currentLink] : []}
        phase={currentStep?.phase}
      />
      <PacketInspector layers={displayPacket?.layers ?? []} emptyLabel="No lookup yet — click Resolve." />
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 font-mono">Resolver cache</div>
        <div className="p-3 space-y-1">
          {Object.keys(displayCache).length === 0 ? (
            <p className="text-xs text-neutral-600 italic px-1">Empty — nothing resolved yet.</p>
          ) : (
            Object.entries(displayCache).map(([d, rec]) => (
              <div key={d} className="flex justify-between text-[11px] font-mono text-neutral-400">
                <span className="text-indigo-300">{d}</span>
                <span>{rec.ip} (TTL {rec.ttl}s)</span>
              </div>
            ))
          )}
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
          id: "resolve",
          label: "Resolve",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="dns-domain" className="text-xs text-neutral-400 uppercase tracking-wider">Domain</label>
                <input id="dns-domain" value={domain} onChange={(e) => setDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-1.5">
                {DOMAIN_OPTIONS.map((d) => (
                  <button key={d} type="button" onClick={() => setDomain(d)}
                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-[11px] font-mono text-neutral-400 hover:text-white transition-colors">
                    {d}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleResolve} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                Resolve
              </button>
              <button type="button" onClick={clearCache} className="w-full px-4 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors">
                Clear cache
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
                  <div className="text-sm font-bold text-indigo-400">{DNS_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{DNS_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{DNS_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={DNS_CODE} highlightLine={currentStep?.highlightLine ?? 0} annotation={annotation} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: currentStep ? (
            <AIExplainer algorithm="DNS" stepExplanation={currentStep.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Resolve a domain to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="DNS"
      phaseLabel="Phase 5 · Application"
      helpTitle="DNS"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Resolve a domain from the Resolve tab to start playback.</p>
        )
      }
    />
  );
}
