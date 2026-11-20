"use client";

import { useMemo, useRef, useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import PacketInspector from "@/components/shared/PacketInspector";
import Controls from "@/components/shared/Controls";
import { usePlayer } from "@/components/shared/usePlayer";
import { parsePcap } from "@/lib/capture/pcap";
import { parseTsharkJson } from "@/lib/capture/tshark";
import { analyze, explain, Insights } from "@/lib/capture/analyze";
import { buildSampleCapture } from "@/lib/capture/sample";
import { CapturedPacket, LIMITS, ParsedCapture, ParseResult } from "@/lib/capture/types";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Opens a real packet capture and walks through it one packet at a time, explaining what each packet means: handshakes, retransmissions, DNS lookups, what TLS reveals." },
  { heading: "How to use it", body: "Load the sample, or open a .pcap or .pcapng saved from Wireshark or tcpdump, or a JSON file from File > Export Packet Dissections > As JSON. Then press play or click a packet in the Packets tab." },
  { heading: "Privacy", body: "The file is read and decoded entirely in your browser. It is never uploaded, and the AI tutor is deliberately not connected to this page." },
];

const PHASE_CAPTION: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const WINDOW = 12;     // packets shown in the ladder diagram
const ROW = 28;
const WIDTH = 640;

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function Ladder({ packets, current }: { packets: CapturedPacket[]; current: number }) {
  const hosts = useMemo(() => {
    const seen: string[] = [];
    for (const p of packets) for (const h of [p.src, p.dst]) if (!seen.includes(h) && !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(h)) seen.push(h);
    return seen.slice(0, 4);
  }, [packets]);
  const start = Math.max(0, Math.min(current - Math.floor(WINDOW / 2), Math.max(0, packets.length - WINDOW)));
  const rows = packets.slice(start, start + WINDOW);
  const colX = (h: string) => 70 + (hosts.indexOf(h) * (WIDTH - 140)) / Math.max(1, hosts.length - 1);
  const height = 44 + rows.length * ROW;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto bg-neutral-900/60 border border-neutral-800 rounded-lg" role="img" aria-label="Packet ladder diagram">
      {hosts.map((h) => (
        <g key={h}>
          <line x1={colX(h)} x2={colX(h)} y1={30} y2={height - 4} stroke="#2a3547" strokeDasharray="3 3" />
          <text x={colX(h)} y={16} fontSize={10} textAnchor="middle" fill="#b4c0d1" fontFamily="monospace">{trim(h, 22)}</text>
        </g>
      ))}
      {rows.map((p, i) => {
        const y = 44 + i * ROW;
        const active = start + i === current;
        const a = hosts.includes(p.src) ? colX(p.src) : null, b = hosts.includes(p.dst) ? colX(p.dst) : null;
        const color = p.phase === "error" ? "#ff7d8e" : active ? "#ffd698" : "#7d8aa0";
        return (
          <g key={p.no} opacity={active ? 1 : 0.75}>
            {active && <rect x={0} y={y - 16} width={WIDTH} height={ROW - 2} fill="#a85a08" opacity={0.18} />}
            <text x={6} y={y - 3} fontSize={9} fill="#7d8aa0" fontFamily="monospace">#{p.no}</text>
            {a !== null && b !== null && a !== b ? (
              <>
                <line x1={a} x2={b} y1={y} y2={y} stroke={color} strokeWidth={active ? 2.5 : 1.5} />
                <polygon points={b > a ? `${b},${y} ${b - 7},${y - 4} ${b - 7},${y + 4}` : `${b},${y} ${b + 7},${y - 4} ${b + 7},${y + 4}`} fill={color} />
              </>
            ) : (
              <line x1={(a ?? b ?? 70) - 10} x2={(a ?? b ?? 70) + 10} y1={y} y2={y} stroke={color} strokeWidth={1.5} />
            )}
            <text x={((a ?? 70) + (b ?? 70)) / 2} y={y - 5} fontSize={9} textAnchor="middle" fill={active ? "#f1f5fa" : "#98a6bb"} fontFamily="monospace">
              {trim(`${p.proto}: ${p.info}`, 56)}
            </text>
            <text x={WIDTH - 6} y={y - 3} fontSize={9} textAnchor="end" fill="#7d8aa0" fontFamily="monospace">{p.time.toFixed(3)}s</text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono font-bold ${tone === "bad" ? "text-red-300" : tone === "good" ? "text-emerald-300" : "text-indigo-300"}`}>{value}</div>
    </div>
  );
}

async function readFile(file: File): Promise<ParseResult> {
  if (file.size > LIMITS.maxBytes) return { ok: false, error: `This file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${LIMITS.maxBytes / 1048576} MB. Filter or trim the capture in Wireshark first.` };
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 64));
  let i = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;       // UTF-8 byte order mark
  while (i < head.length && (head[i] === 32 || head[i] === 10 || head[i] === 13 || head[i] === 9)) i++;
  if (head[i] === 0x5b || head[i] === 0x7b) return parseTsharkJson(new TextDecoder().decode(buf));   // "[" or "{"
  return parsePcap(buf);
}

export default function CapturePage() {
  const [capture, setCapture] = useState<ParsedCapture | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const packets = capture?.packets ?? [];
  const { step, playing, speed, play, pause, stepForward, stepBackward, reset, setSpeed, seek } = usePlayer(packets.length);
  const current = packets[step];

  const load = (result: ParseResult, label: string) => {
    if (!result.ok) { setError(result.error); setCapture(null); setInsights(null); setName(""); return; }
    setError(null);
    setInsights(analyze(result.capture.packets));
    setCapture(result.capture);
    setName(label);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { load(await readFile(file), file.name); }
    catch { load({ ok: false, error: "Could not read that file." }, ""); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const loadSample = () => load(parsePcap(buildSampleCapture()), "sample: opening https://example.com");

  const caption = PHASE_CAPTION[current?.phase ?? "default"];

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-neutral-300">Packet capture</span>
        <span className="text-xs text-neutral-500 font-mono truncate">{name ? `${name} · ${capture!.format} · ${packets.length} packets` : "no file loaded"}</span>
      </div>

      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}
      {capture?.warnings.map((w) => <div key={w} className="bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs rounded-lg px-3 py-2">{w}</div>)}

      {!capture && !error && (
        <div className="border border-dashed border-neutral-700 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-neutral-300">Open a capture saved from Wireshark or tcpdump.</p>
          <p className="text-xs text-neutral-500">Supports .pcap, .pcapng and Wireshark JSON. Parsed locally; nothing is uploaded.</p>
          <button type="button" onClick={loadSample} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Load the sample capture</button>
        </div>
      )}

      {capture && current && (
        <>
          <Ladder packets={packets} current={step} />
          <div className={`border rounded-lg px-4 py-2.5 text-sm leading-relaxed ${caption}`}>
            <span className="font-mono text-xs opacity-70 mr-2">#{current.no} · {current.time.toFixed(3)} s</span>{explain(current)}
          </div>
          <PacketInspector layers={current.layers} emptyLabel="No decodable layers in this packet." />
        </>
      )}
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "load",
          label: "Load",
          content: (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="cap-file" className="text-xs text-neutral-400 uppercase tracking-wider">Capture file</label>
                <input id="cap-file" ref={fileRef} type="file" accept=".pcap,.pcapng,.cap,.json,application/json" disabled={busy}
                  onChange={(e) => onFile(e.target.files?.[0])}
                  className="w-full text-xs text-neutral-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700" />
              </div>
              <button type="button" onClick={loadSample} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">Load the sample capture</button>
              <ul className="text-[11px] text-neutral-500 space-y-1 list-disc pl-4">
                <li>Up to {LIMITS.maxBytes / 1048576} MB and {LIMITS.maxPackets} packets; larger files are cut off.</li>
                <li>Ethernet, Linux cooked and raw-IP captures. ARP, IPv4/IPv6, TCP, UDP, ICMP, DNS, TLS and plain HTTP are decoded.</li>
                <li>Everything stays in your browser. Captures can contain private data, so keep real ones local.</li>
                <li>Encrypted traffic stays encrypted: you see sizes, timing and the TLS handshake, not the content.</li>
              </ul>
              <p className="text-[11px] text-neutral-500">In Wireshark: File &gt; Save As for .pcap/.pcapng, or File &gt; Export Packet Dissections &gt; As JSON.</p>
            </div>
          ),
        },
        {
          id: "packets",
          label: "Packets",
          content: packets.length === 0 ? <p className="text-xs text-neutral-600 italic">Load a capture first.</p> : (
            <div className="max-h-[60vh] overflow-y-auto -mx-1">
              <table className="w-full text-[10px] font-mono">
                <tbody>
                  {packets.slice(0, 500).map((p, i) => (
                    <tr key={p.no} onClick={() => seek(i)} className={`cursor-pointer border-b border-neutral-900 ${i === step ? "bg-indigo-600/20" : "hover:bg-neutral-900"} ${p.phase === "error" ? "text-red-300" : "text-neutral-300"}`}>
                      <td className="px-1 py-1 text-neutral-500">{p.no}</td>
                      <td className="px-1 text-neutral-500">{p.time.toFixed(2)}</td>
                      <td className="px-1">{p.proto}</td>
                      <td className="px-1 truncate max-w-[130px]">{p.info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {packets.length > 500 && <p className="text-[10px] text-neutral-600 px-1 py-1">Showing the first 500 of {packets.length}; use the player to go further.</p>}
            </div>
          ),
        },
        {
          id: "summary",
          label: "Summary",
          content: !insights ? <p className="text-xs text-neutral-600 italic">Load a capture first.</p> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Packets" value={String(insights.packets)} />
                <Stat label="Duration" value={`${insights.durationS.toFixed(2)} s`} />
                <Stat label="Retransmissions" value={String(insights.retransmissions)} tone={insights.retransmissions ? "bad" : "good"} />
                <Stat label="Resets" value={String(insights.resets)} tone={insights.resets ? "bad" : "good"} />
              </div>
              <div className="text-[11px] text-neutral-400">
                <div className="text-neutral-500 uppercase tracking-wider text-[10px] mb-1">Protocols</div>
                {Object.entries(insights.protocols).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="inline-block mr-2 font-mono">{k} {v}</span>)}
              </div>
              {insights.tcpFlows.map((f) => (
                <div key={f.flow} className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-[11px] space-y-0.5">
                  <div className="font-mono text-indigo-300">{trim(f.client, 20)}:{f.clientPort} → {trim(f.server, 20)}:{f.serverPort}</div>
                  <div className="text-neutral-400">Handshake {f.handshake}{f.synAttempts > 1 ? ` after ${f.synAttempts} SYNs` : ""}{f.handshakeMs !== undefined ? `, RTT about ${f.handshakeMs.toFixed(0)} ms` : ""}</div>
                  <div className="text-neutral-400">{f.packets} packets, {f.payloadBytes} payload bytes, {f.retransmissions} retransmissions, {f.dupAcks} duplicate ACKs{f.resets ? `, ${f.resets} reset` : ""}{f.closed ? ", closed" : ""}</div>
                  {(f.options.clientMss !== undefined || f.options.serverMss !== undefined) && (
                    <div className="text-neutral-500">MSS {f.options.clientMss ?? "?"}/{f.options.serverMss ?? "?"}{f.options.sack ? ", SACK" : ""}{f.options.timestamps ? ", timestamps" : ""}{f.options.clientWscale !== undefined ? `, window scale ${f.options.clientWscale}/${f.options.serverWscale ?? "-"}` : ""}</div>
                  )}
                </div>
              ))}
              {insights.dns.length > 0 && (
                <div className="text-[11px] text-neutral-400 space-y-0.5">
                  <div className="text-neutral-500 uppercase tracking-wider text-[10px]">DNS</div>
                  {insights.dns.slice(0, 8).map((d, i) => <div key={i} className="font-mono">{trim(d.name, 30)} {d.type} → {d.rcode === 3 ? "NXDOMAIN" : d.answers.join(", ") || "-"}{d.ms !== undefined ? ` (${d.ms.toFixed(0)} ms)` : ""}</div>)}
                </div>
              )}
              {insights.tls.length > 0 && (
                <div className="text-[11px] text-neutral-400 space-y-0.5">
                  <div className="text-neutral-500 uppercase tracking-wider text-[10px]">TLS</div>
                  {insights.tls.map((t, i) => <div key={i} className="font-mono">{t.sni ?? t.server ?? "?"} · {t.version ?? "?"}{t.cipher ? ` · ${t.cipher}` : ""}</div>)}
                </div>
              )}
              {insights.checksumWarnings > 0 && <p className="text-[11px] text-amber-300">{insights.checksumWarnings} packets show an invalid IPv4 checksum; normal when captured on the sending computer (checksum offload).</p>}
            </div>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Capture Import"
      phaseLabel="Real traffic"
      helpTitle="Capture import"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
      timeline={
        packets.length > 0 ? (
          <Controls docked step={step} total={packets.length} playing={playing} speed={speed}
            onPlay={play} onPause={pause} onStepForward={stepForward} onStepBackward={stepBackward}
            onReset={reset} onSpeedChange={setSpeed} />
        ) : (
          <p className="text-xs text-neutral-600 text-center py-1.5">Load a capture to start playback.</p>
        )
      }
    />
  );
}
