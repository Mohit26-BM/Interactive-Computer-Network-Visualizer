"use client";

import { useMemo, useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import { usePlayer } from "@/components/shared/usePlayer";
import {
  buildScenario, lookupSteps, forwardPacket, routeText, TOGGLEABLE_ROUTES, ADMIN_DISTANCE,
  LookupStep, ForwardStep, LookupView, RowStatus,
  ROUTING_TABLE_CODE, ROUTING_TABLE_ANNOTATIONS, ROUTING_TABLE_COMPLEXITY,
} from "@/lib/routing-table-engine";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Shows how a router really chooses where to send a packet: it compares the destination with every route and takes the LONGEST matching prefix. A second tab follows a packet from a host, through its default gateway, router by router, with the Ethernet header rewritten at each hop." },
  { heading: "How to use it", body: "Lookup tab: pick a router and a destination IP and step through the comparison. Forward tab: send PC-1 or SRV-1 traffic across the network, then switch routes off to watch it fall back to a less specific route." },
  { heading: "Why it matters", body: "Every router on the internet does exactly this for every packet. Longest prefix match is why a /24 can override a /16 and why a default route catches everything else." },
];

const PHASE_CAPTION: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const NODES: Record<string, { x: number; y: number }> = {
  "PC-1": { x: 50, y: 100 }, R1: { x: 190, y: 100 }, R2: { x: 320, y: 36 }, R3: { x: 450, y: 100 }, "SRV-1": { x: 580, y: 100 },
};
const LINKS: [string, string][] = [["PC-1", "R1"], ["R1", "R2"], ["R2", "R3"], ["R1", "R3"], ["R3", "SRV-1"]];

function Diagram({ at }: { at: string | null }) {
  return (
    <svg viewBox="0 0 640 150" className="w-full h-auto bg-neutral-900/60 border border-neutral-800 rounded-lg" role="img" aria-label="Network diagram: PC-1, R1, R2, R3, SRV-1">
      {LINKS.map(([a, b]) => (
        <line key={a + b} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#404040" strokeWidth={2} />
      ))}
      {Object.entries(NODES).map(([name, p]) => {
        const active = at === name;
        const router = name.startsWith("R");
        return (
          <g key={name}>
            <rect x={p.x - 28} y={p.y - 16} width={56} height={32} rx={router ? 16 : 6}
              fill={active ? "#4f46e5" : "#171717"} stroke={active ? "#a5b4fc" : "#525252"} strokeWidth={active ? 2.5 : 1.5} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fill="#fafafa" fontFamily="monospace">{name}</text>
          </g>
        );
      })}
      <text x={120} y={92} fontSize={9} fill="#737373" textAnchor="middle" fontFamily="monospace">192.168.1.0/24</text>
      <text x={515} y={92} fontSize={9} fill="#737373" textAnchor="middle" fontFamily="monospace">172.16.0.0/24</text>
      <text x={255} y={62} fontSize={9} fill="#737373" textAnchor="middle" fontFamily="monospace">10.0.12.0/30</text>
      <text x={385} y={62} fontSize={9} fill="#737373" textAnchor="middle" fontFamily="monospace">10.0.23.0/30</text>
      <text x={320} y={118} fontSize={9} fill="#737373" textAnchor="middle" fontFamily="monospace">10.0.13.0/30</text>
    </svg>
  );
}

const ROW_STYLE: Record<RowStatus, string> = {
  pending: "text-neutral-400 border-transparent",
  match: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  "no-match": "text-neutral-600 border-transparent line-through decoration-neutral-700",
  winner: "text-emerald-200 bg-emerald-500/15 border-emerald-500/40",
  beaten: "text-amber-300/70 bg-amber-500/5 border-amber-500/20",
};

function RoutingTable({ view }: { view: LookupView }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-300">{view.router} routing table</span>
        <span className="text-[11px] font-mono text-neutral-500">dest {view.dest}</span>
      </div>
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="px-2 py-1 font-normal">Prefix</th><th className="px-1 font-normal">Src</th>
            <th className="px-1 font-normal">Next hop</th><th className="px-1 font-normal">If</th><th className="px-1 font-normal">AD/Met</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ route, status }) => (
            <tr key={route.id} className={`border ${ROW_STYLE[status]}`}>
              <td className="px-2 py-1">{routeText(route)}</td>
              <td className="px-1">{route.source}</td>
              <td className="px-1">{route.nextHop ?? "connected"}</td>
              <td className="px-1">{route.iface}</td>
              <td className="px-1">{ADMIN_DISTANCE[route.source]}/{route.metric}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-neutral-800 text-[11px] text-neutral-400">
        <span className="text-neutral-500">Result: </span>{view.result}
      </div>
    </div>
  );
}

type Mode = "lookup" | "forward";

export default function RoutingTablePage() {
  const [mode, setMode] = useState<Mode>("forward");
  const [disabled, setDisabled] = useState<string[]>([]);
  const scenario = useMemo(() => buildScenario(disabled), [disabled]);

  const [routerName, setRouterName] = useState("R1");
  const [lookupDest, setLookupDest] = useState("172.16.0.50");
  const [fromHost, setFromHost] = useState("PC-1");
  const [forwardDest, setForwardDest] = useState("172.16.0.50");
  const [ttl, setTtl] = useState("64");

  const [lSteps, setLSteps] = useState<LookupStep[]>([]);
  const [fSteps, setFSteps] = useState<ForwardStep[]>([]);
  const steps: (LookupStep | ForwardStep)[] = mode === "lookup" ? lSteps : fSteps;

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const current = steps[step];

  const runLookup = () => setLSteps(lookupSteps(scenario.routers[routerName], lookupDest.trim()));
  const runForward = () => {
    const t = Math.max(1, Math.min(255, parseInt(ttl, 10) || 64));
    setFSteps(forwardPacket(scenario, fromHost, forwardDest.trim(), t));
  };
  const toggleRoute = (id: string) => {
    setDisabled((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
    setFSteps([]);
    setLSteps([]);
  };

  const fStep = mode === "forward" ? (current as ForwardStep | undefined) : undefined;
  const view: LookupView | null = mode === "lookup"
    ? (current as LookupStep | undefined)?.view ?? null
    : fStep?.lookup ?? null;
  const idleView: LookupView = {
    router: mode === "lookup" ? routerName : "R1", dest: "-",
    rows: scenario.routers[mode === "lookup" ? routerName : "R1"].routes.map((route) => ({ route, status: "pending" as RowStatus })),
    result: "run a simulation",
  };
  const caption = PHASE_CAPTION[current?.phase ?? "default"] ?? PHASE_CAPTION.default;
  const annotation = current ? ROUTING_TABLE_ANNOTATIONS[current.highlightLine] : undefined;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Routing &amp; forwarding</span>
        <span className="text-xs text-neutral-500 uppercase tracking-wider">{mode}</span>
      </div>
      <Diagram at={fStep?.where ?? null} />
      {current ? (
        <div className={`border rounded-lg px-4 py-2.5 text-sm leading-relaxed ${caption}`}>{current.explanation}</div>
      ) : (
        <div className="border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-neutral-500">Run a simulation from the panel on the right.</div>
      )}
      {fStep && (
        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
            <div className="text-neutral-500 mb-1 font-sans">Ethernet header (changes every hop)</div>
            {fStep.l2 ? <div className="text-indigo-300">{fStep.l2.src} &rarr; {fStep.l2.dst}</div> : <div className="text-neutral-600">- (no frame on the wire at this moment)</div>}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
            <div className="text-neutral-500 mb-1 font-sans">IP header (only TTL changes)</div>
            <div className="text-emerald-300">{fStep.l3.src} &rarr; {fStep.l3.dst}</div>
            <div className="text-amber-300">TTL {fStep.l3.ttl}</div>
          </div>
        </div>
      )}
      <RoutingTable view={view ?? idleView} />
    </div>
  );

  const inputCls = "w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500";
  const labelCls = "text-xs text-neutral-400 uppercase tracking-wider";

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "run",
          label: "Run",
          content: (
            <div className="space-y-3">
              <div className="flex gap-1">
                {(["forward", "lookup"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${mode === m ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200" : "border-neutral-700 text-neutral-400 hover:text-white"}`}>
                    {m === "forward" ? "Forward a packet" : "Route lookup"}
                  </button>
                ))}
              </div>

              {mode === "lookup" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rt-router" className={labelCls}>Router</label>
                    <select id="rt-router" value={routerName} onChange={(e) => { setRouterName(e.target.value); setLSteps([]); }} className={inputCls}>
                      {Object.keys(scenario.routers).map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rt-dest" className={labelCls}>Destination IP</label>
                    <input id="rt-dest" value={lookupDest} onChange={(e) => setLookupDest(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runLookup()} className={inputCls} />
                  </div>
                  <button type="button" onClick={runLookup} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Look up</button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rt-from" className={labelCls}>Send from</label>
                    <select id="rt-from" value={fromHost} onChange={(e) => { setFromHost(e.target.value); setFSteps([]); }} className={inputCls}>
                      {Object.keys(scenario.hosts).map((h) => <option key={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rt-fdest" className={labelCls}>Destination IP</label>
                    <input id="rt-fdest" value={forwardDest} onChange={(e) => setForwardDest(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runForward()} className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="rt-ttl" className={labelCls}>Starting TTL</label>
                    <input id="rt-ttl" value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric" className={inputCls} />
                  </div>
                  <button type="button" onClick={runForward} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Send packet</button>
                </>
              )}

              <div className="pt-1 space-y-1.5">
                <div className={labelCls}>Try a destination</div>
                {[["172.16.0.50", "the server (specific /24)"], ["172.16.5.5", "inside the /16 but nobody has it"], ["8.8.8.8", "the internet (default route)"], ["192.168.1.77", "same subnet, no such host"]].map(([ip, d]) => (
                  <button key={ip} type="button" onClick={() => { setLookupDest(ip); setForwardDest(ip); }}
                    className="w-full text-left text-xs text-neutral-400 hover:text-indigo-300 transition-colors">
                    <span className="font-mono">{ip}</span> <span className="text-neutral-600">- {d}</span>
                  </button>
                ))}
              </div>

              <div className="pt-1 space-y-1.5">
                <div className={labelCls}>R1 routes (switch off to see fallback)</div>
                {TOGGLEABLE_ROUTES.map((id) => {
                  const r = buildScenario([]).routers.R1.routes.find((x) => x.id === id)!;
                  const off = disabled.includes(id);
                  return (
                    <label key={id} className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                      <input type="checkbox" checked={!off} onChange={() => toggleRoute(id)} className="accent-indigo-500" />
                      <span className={`font-mono ${off ? "line-through text-neutral-600" : ""}`}>{routeText(r)} via {r.nextHop}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ),
        },
        {
          id: "details",
          label: "Details",
          content: (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Time</div>
                  <div className="text-sm font-bold text-indigo-400">{ROUTING_TABLE_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-sm font-bold text-violet-400">{ROUTING_TABLE_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{ROUTING_TABLE_COMPLEXITY.note}</p>
            </div>
          ),
        },
        { id: "code", label: "Code", content: <CodePanel lines={ROUTING_TABLE_CODE} highlightLine={current?.highlightLine ?? 0} annotation={annotation} /> },
        {
          id: "explain",
          label: "Explain",
          content: current ? (
            <AIExplainer algorithm="IP routing table and longest prefix match" stepExplanation={current.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a simulation to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Routing Tables"
      phaseLabel="Phase 3 · Layer 3"
      helpTitle="Routing tables"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Run a simulation from the Run tab to start playback.</p>
        )
      }
    />
  );
}
