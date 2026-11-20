"use client";

import { useMemo, useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import Controls from "@/components/shared/Controls";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import LineChart from "@/components/experiments/LineChart";
import { usePlayer } from "@/components/shared/usePlayer";
import {
  simulateQueue, simulateTcpOnLink, validateQueue, validateTcp, DEFAULT_QUEUE, DEFAULT_TCP,
  QueueParams, TcpParams, Algorithm, PacketRecord, RoundRecord,
  LINK_QUEUE_CODE, LINK_TCP_CODE, LINK_ANNOTATIONS, LINK_NOTE,
} from "@/lib/link-model";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Gives every link real physical properties: a speed (serialization delay), a distance (propagation delay) and a finite queue that drops packets when it overflows. Then it runs traffic through it." },
  { heading: "How to use it", body: "Queue tab: send packets faster than the link can carry and watch the queue fill, delay grow and packets drop. TCP tab: watch Reno and CUBIC fill a bottleneck, overflow its buffer and back off." },
  { heading: "Why it matters", body: "Loss, latency and congestion are all consequences of one thing: a finite link with a finite queue. This is the missing physical layer under the TCP pages." },
];

type Mode = "queue" | "tcp";
const COLOR = { reno: "#60a5fa", cubic: "#34d399" };

function NumField({ id, label, value, onChange, unit }: { id: string; label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-400 uppercase tracking-wider">{label}{unit ? <span className="normal-case text-neutral-600"> ({unit})</span> : null}</label>
      <input id={id} value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-bold text-indigo-300">{value}</div>
    </div>
  );
}

function QueueDiagram({ rec, size }: { rec: PacketRecord | undefined; size: number }) {
  const cells = Math.min(size, 24);
  const filled = rec ? Math.min(rec.waiting, cells) : 0;
  const dropped = rec?.outcome === "dropped";
  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span>Sender</span><span>&rarr;</span>
        <div className="flex gap-0.5 p-1 border border-neutral-700 rounded">
          {Array.from({ length: cells }).map((_, i) => (
            <div key={i} className={`w-3 h-5 rounded-sm ${i < filled ? (dropped ? "bg-red-500" : "bg-amber-400") : "bg-neutral-800"}`} />
          ))}
          {size > cells && <span className="text-[10px] text-neutral-600 pl-1">+{size - cells}</span>}
        </div>
        <span>&rarr; link &rarr;</span><span>Receiver</span>
      </div>
      <div className="text-[11px] text-neutral-500">Queue: {rec ? rec.waiting : 0} of {size} places in use{dropped ? " - FULL, packet dropped" : ""}</div>
    </div>
  );
}

export default function LinkModelPage() {
  const [mode, setMode] = useState<Mode>("queue");
  const [q, setQ] = useState({ bw: String(DEFAULT_QUEUE.bandwidthMbps), delay: String(DEFAULT_QUEUE.delayMs), queue: String(DEFAULT_QUEUE.queuePackets), bytes: String(DEFAULT_QUEUE.packetBytes), rate: String(DEFAULT_QUEUE.offeredMbps), n: String(DEFAULT_QUEUE.packets) });
  const [t, setT] = useState({ bw: String(DEFAULT_TCP.bandwidthMbps), rtt: String(DEFAULT_TCP.rttMs), queue: String(DEFAULT_TCP.queuePackets), mss: String(DEFAULT_TCP.mss), rounds: String(DEFAULT_TCP.rounds) });
  const [algo, setAlgo] = useState<Algorithm>("reno");
  const [qResult, setQResult] = useState<ReturnType<typeof simulateQueue> | null>(null);
  const [tResult, setTResult] = useState<{ reno: ReturnType<typeof simulateTcpOnLink>; cubic: ReturnType<typeof simulateTcpOnLink>; algo: Algorithm } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qParams = (): QueueParams => ({ bandwidthMbps: Number(q.bw), delayMs: Number(q.delay), queuePackets: Number(q.queue), packetBytes: Number(q.bytes), offeredMbps: Number(q.rate), packets: Number(q.n) });
  const tParams = (a: Algorithm): TcpParams => ({ algorithm: a, bandwidthMbps: Number(t.bw), rttMs: Number(t.rtt), queuePackets: Number(t.queue), mss: Number(t.mss), rounds: Number(t.rounds) });

  const run = () => {
    if (mode === "queue") {
      const p = qParams();
      const bad = validateQueue(p);
      setError(bad);
      setQResult(bad ? null : simulateQueue(p));
    } else {
      const bad = validateTcp(tParams("reno"));
      setError(bad);
      setTResult(bad ? null : { reno: simulateTcpOnLink(tParams("reno")), cubic: simulateTcpOnLink(tParams("cubic")), algo });
    }
  };

  const steps = useMemo(() => {
    if (mode === "queue") {
      return (qResult?.records ?? []).map((r) => ({
        explanation: `Packet ${r.n} arrives at t=${r.sentMs.toFixed(1)} ms. ${r.note}${r.outcome === "delivered" ? ` It reaches the receiver at t=${r.arrivedMs!.toFixed(1)} ms (${(r.arrivedMs! - r.sentMs).toFixed(1)} ms in total: ${r.queueDelayMs.toFixed(1)} queueing + ${r.serializeMs.toFixed(1)} sending + propagation).` : ""}`,
        highlightLine: r.outcome === "dropped" ? 3 : r.queueDelayMs > 0 ? 5 : 0,
        phase: r.outcome === "dropped" ? "error" : r.queueDelayMs > 0 ? "default" : "found",
      }));
    }
    const rounds = tResult ? tResult[tResult.algo].rounds : [];
    return rounds.map((r) => ({
      explanation: r.explanation,
      highlightLine: r.event === "loss" ? 2 : r.event === "slow-start" ? 5 : tResult!.algo === "cubic" ? 7 : 6,
      phase: r.event === "loss" ? "error" : r.event === "slow-start" ? "insert" : "found",
    }));
  }, [mode, qResult, tResult]);

  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed } = usePlayer(steps.length);
  const current = steps[step];
  const qRec = qResult?.records[step];
  const tRound: RoundRecord | undefined = tResult ? tResult[tResult.algo].rounds[step] : undefined;
  const caption: Record<string, string> = {
    insert: "bg-green-500/15 border-green-500/30 text-green-200", found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
    error: "bg-red-500/15 border-red-500/30 text-red-200", default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
  };

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Link model</span>
        <span className="text-xs text-neutral-500 uppercase tracking-wider">{mode === "queue" ? "queue and loss" : "TCP over a bottleneck"}</span>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

      {current ? (
        <div className={`border rounded-lg px-4 py-2.5 text-sm leading-relaxed ${caption[current.phase] ?? caption.default}`}>{current.explanation}</div>
      ) : (
        <div className="border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-neutral-500">Set the link parameters and press Run.</div>
      )}

      {mode === "queue" && qResult && (
        <>
          <QueueDiagram rec={qRec} size={Number(q.queue)} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Delivered" value={`${qResult.summary.delivered}`} />
            <Stat label="Dropped" value={`${qResult.summary.dropped} (${qResult.summary.lossPercent.toFixed(1)}%)`} />
            <Stat label="Avg delay" value={`${qResult.summary.avgDelayMs.toFixed(1)} ms`} />
            <Stat label="Goodput" value={`${qResult.summary.goodputMbps.toFixed(1)} Mbit/s`} />
          </div>
          <LineChart xLabel="packet number" yLabel="queueing delay (ms)" height={200}
            series={[{ name: "queueing delay of delivered packets", color: "#fbbf24", points: qResult.records.filter((r) => r.outcome === "delivered").map((r) => ({ x: r.n, y: r.queueDelayMs })) }]}
            cursor={qRec && qRec.outcome === "delivered" ? { x: qRec.n, y: qRec.queueDelayMs, color: "#fbbf24" } : undefined} />
          <p className="text-[11px] text-neutral-500">Dropped packets: {qResult.records.filter((r) => r.outcome === "dropped").map((r) => r.n).join(", ") || "none"}</p>
        </>
      )}

      {mode === "tcp" && tResult && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Pipe fills at" value={`${tResult.reno.summary.bdpPackets.toFixed(0)} seg`} />
            <Stat label="Overflow at" value={`${tResult.reno.summary.capacityPackets.toFixed(0)} seg`} />
            <Stat label="Reno use / losses" value={`${tResult.reno.summary.utilizationPercent.toFixed(0)}% / ${tResult.reno.summary.lossEvents}`} />
            <Stat label="CUBIC use / losses" value={`${tResult.cubic.summary.utilizationPercent.toFixed(0)}% / ${tResult.cubic.summary.lossEvents}`} />
          </div>
          <LineChart xLabel="round trip" yLabel="window (segments)"
            hLine={{ y: tResult.reno.summary.capacityPackets, label: "queue overflows above this" }}
            series={[
              { name: "Reno", color: COLOR.reno, dashed: tResult.algo !== "reno", points: tResult.reno.rounds.map((r) => ({ x: r.round, y: r.cwnd })) },
              { name: "CUBIC", color: COLOR.cubic, dashed: tResult.algo !== "cubic", points: tResult.cubic.rounds.map((r) => ({ x: r.round, y: r.cwnd })) },
            ]}
            cursor={tRound ? { x: tRound.round, y: tRound.cwnd, color: COLOR[tResult.algo] } : undefined} />
          <LineChart xLabel="round trip" yLabel="goodput (Mbit/s)" height={180}
            series={[
              { name: "Reno", color: COLOR.reno, dashed: tResult.algo !== "reno", points: tResult.reno.rounds.map((r) => ({ x: r.round, y: r.goodputMbps })) },
              { name: "CUBIC", color: COLOR.cubic, dashed: tResult.algo !== "cubic", points: tResult.cubic.rounds.map((r) => ({ x: r.round, y: r.goodputMbps })) },
            ]} />
          {tRound && <p className="text-[11px] text-neutral-500 font-mono">round {tRound.round} · queue {tRound.queue.toFixed(0)} seg · RTT {tRound.rttMs.toFixed(0)} ms · goodput {tRound.goodputMbps.toFixed(1)} Mbit/s</p>}
        </>
      )}
      <p className="text-[11px] text-neutral-500 leading-relaxed">{LINK_NOTE}</p>
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "run",
          label: "Run",
          content: (
            <div className="space-y-3">
              <div className="flex gap-1">
                {(["queue", "tcp"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === m ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200" : "border-neutral-700 text-neutral-400 hover:text-white"}`}>
                    {m === "queue" ? "Queue and loss" : "TCP over the link"}
                  </button>
                ))}
              </div>
              {mode === "queue" ? (
                <>
                  <NumField id="q-bw" label="Bandwidth" unit="Mbit/s" value={q.bw} onChange={(v) => setQ({ ...q, bw: v })} />
                  <NumField id="q-delay" label="Propagation delay" unit="ms" value={q.delay} onChange={(v) => setQ({ ...q, delay: v })} />
                  <NumField id="q-queue" label="Queue size" unit="packets" value={q.queue} onChange={(v) => setQ({ ...q, queue: v })} />
                  <NumField id="q-bytes" label="Packet size" unit="bytes" value={q.bytes} onChange={(v) => setQ({ ...q, bytes: v })} />
                  <NumField id="q-rate" label="Sender rate" unit="Mbit/s" value={q.rate} onChange={(v) => setQ({ ...q, rate: v })} />
                  <NumField id="q-n" label="Packets to send" value={q.n} onChange={(v) => setQ({ ...q, n: v })} />
                  <div className="flex gap-2 text-[11px]">
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setQ({ ...q, rate: "5" })}>under-load</button>
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setQ({ ...q, rate: "14" })}>overload</button>
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setQ({ ...q, queue: "100", rate: "14", n: "200" })}>huge buffer</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-400 uppercase tracking-wider">Step through</span>
                    <div className="flex gap-1">
                      {(["reno", "cubic"] as Algorithm[]).map((a) => (
                        <button key={a} type="button" onClick={() => setAlgo(a)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors ${algo === a ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200" : "border-neutral-700 text-neutral-400 hover:text-white"}`}>
                          {a === "cubic" ? "CUBIC" : "Reno"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumField id="t-bw" label="Bottleneck bandwidth" unit="Mbit/s" value={t.bw} onChange={(v) => setT({ ...t, bw: v })} />
                  <NumField id="t-rtt" label="Base round trip" unit="ms" value={t.rtt} onChange={(v) => setT({ ...t, rtt: v })} />
                  <NumField id="t-queue" label="Queue size" unit="segments" value={t.queue} onChange={(v) => setT({ ...t, queue: v })} />
                  <NumField id="t-mss" label="Segment size (MSS)" unit="bytes" value={t.mss} onChange={(v) => setT({ ...t, mss: v })} />
                  <NumField id="t-rounds" label="Round trips" value={t.rounds} onChange={(v) => setT({ ...t, rounds: v })} />
                  <div className="flex gap-2 text-[11px]">
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setT({ ...t, bw: "50", rtt: "40", queue: "40", rounds: "60" })}>home link</button>
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setT({ ...t, bw: "500", rtt: "100", queue: "100", rounds: "400" })}>long fat pipe</button>
                    <button type="button" className="text-neutral-400 hover:text-indigo-300" onClick={() => setT({ ...t, queue: "2000" })}>bufferbloat</button>
                  </div>
                </>
              )}
              <button type="button" onClick={run} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Run</button>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={mode === "queue" ? LINK_QUEUE_CODE : LINK_TCP_CODE} highlightLine={current?.highlightLine ?? 0} annotation={LINK_ANNOTATIONS[current?.highlightLine ?? -1]} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: current ? (
            <AIExplainer algorithm={mode === "queue" ? "Link queue and packet loss" : `TCP ${algo === "cubic" ? "CUBIC" : "Reno"} over a bottleneck link`} stepExplanation={current.explanation} stepIndex={step} totalSteps={steps.length} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Run a simulation to get an AI explanation of each step.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Link, Queue and Loss Lab"
      phaseLabel="Experiment"
      helpTitle="Link model"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        steps.length > 0 ? (
          <Controls docked step={step} total={steps.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Press Run to start playback.</p>
        )
      }
    />
  );
}
