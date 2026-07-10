"use client";

import { useState } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import { buildDefaultTopology } from "@/lib/topology-engine";
import {
  WELL_KNOWN_PORTS, WellKnownPort, classifyPort, randomEphemeralPort, socketTuple,
  PORTS_CODE, PORTS_ANNOTATIONS, PORTS_COMPLEXITY,
} from "@/lib/ports-engine";

const HELP_SECTIONS = [
  { heading: "What this page does", body: "Everything TCP and UDP do depends on ports — this is the reference and the vocabulary (well-known / registered / ephemeral, and the socket 4-tuple) the rest of Phase 4 assumes." },
  { heading: "How to use it", body: "Pick a well-known service to see what port a server listens on. Click \"New Connection\" to see the client pick a fresh, random ephemeral port — that's what lets one client open many connections to the same server port at once." },
  { heading: "Why it matters", body: "By the time you reach UDP and TCP, you'll already know why port 80 means HTTP everywhere, and why the client's port is different every time." },
];

const RANGE_LABEL: Record<string, string> = {
  "well-known": "Well-known (0–1023)",
  registered: "Registered (1024–49151)",
  ephemeral: "Ephemeral (49152–65535)",
  invalid: "Invalid",
};

function PortBox({ label, ip, port, service }: { label: string; ip: string; port: number; service?: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 flex-1 text-center space-y-1">
      <div className="text-xs text-neutral-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono text-white">{ip}:<span className="text-indigo-300 font-bold">{port}</span></div>
      {service && <div className="text-xs text-neutral-500">{service}</div>}
    </div>
  );
}

export default function PortsPage() {
  const [topology] = useState(() => buildDefaultTopology());
  const client = topology.devices.find((d) => d.label === "PC-1")!;
  const server = topology.devices.find((d) => d.label === "SRV-1")!;

  const [selectedPort, setSelectedPort] = useState<WellKnownPort>(WELL_KNOWN_PORTS.find((p) => p.port === 80)!);
  const [clientPort, setClientPort] = useState(() => randomEphemeralPort());
  const [runCount, setRunCount] = useState(0);

  const newConnection = () => { setClientPort(randomEphemeralPort()); setRunCount((c) => c + 1); };
  const pickService = (p: WellKnownPort) => { setSelectedPort(p); setRunCount((c) => c + 1); };

  const tuple = socketTuple(
    selectedPort.protocol === "UDP" ? "UDP" : "TCP",
    client.ip!, clientPort, server.ip!, selectedPort.port
  );
  const summary = `Client ${client.ip}:${clientPort} (ephemeral) connects to server ${server.ip}:${selectedPort.port} (${selectedPort.service}, ${RANGE_LABEL[classifyPort(selectedPort.port)]}). Socket: ${tuple}.`;

  const canvas = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Socket</span>
        <span className="text-xs text-neutral-500 font-mono">{RANGE_LABEL[classifyPort(clientPort)]}</span>
      </div>
      <div className="flex items-center gap-3">
        <PortBox label="Client" ip={client.ip!} port={clientPort} />
        <div className="flex flex-col items-center gap-1 shrink-0 px-2">
          <span className="text-[10px] text-neutral-600 font-mono">{selectedPort.protocol}</span>
          <span className="text-neutral-600">&harr;</span>
        </div>
        <PortBox label="Server" ip={server.ip!} port={selectedPort.port} service={selectedPort.service} />
      </div>
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-center">
        <div className="text-xs text-neutral-500 mb-1">Socket (the 4-tuple)</div>
        <div className="text-sm font-mono text-indigo-300">{tuple}</div>
      </div>
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "socket",
          label: "Socket",
          content: (
            <div className="space-y-3">
              <button type="button" onClick={newConnection} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                New Connection (new ephemeral port)
              </button>
              <div className="pt-1 space-y-1.5">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Pick a service</div>
                {WELL_KNOWN_PORTS.map((p) => (
                  <button
                    key={p.port}
                    type="button"
                    onClick={() => pickService(p)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedPort.port === p.port ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                    }`}
                  >
                    <span className="font-mono">{p.port}</span>
                    <span>{p.service}</span>
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
            <div className="space-y-1.5">
              {WELL_KNOWN_PORTS.map((p) => (
                <div key={p.port} className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-indigo-300">{p.port} &middot; {p.service}</span>
                    <span className="text-[10px] font-mono text-neutral-500">{p.protocol}</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">{p.description}</p>
                </div>
              ))}
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
                  <div className="text-lg font-bold text-indigo-400">{PORTS_COMPLEXITY.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{PORTS_COMPLEXITY.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{PORTS_COMPLEXITY.note}</p>
            </div>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: <CodePanel lines={PORTS_CODE} highlightLine={1} annotation={PORTS_ANNOTATIONS[1]} />,
        },
        {
          id: "explain",
          label: "Explain",
          content: <AIExplainer algorithm="Ports & Sockets" stepExplanation={summary} stepIndex={runCount} totalSteps={1} />,
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Ports & Sockets"
      phaseLabel="Phase 4 · Layer 4"
      helpTitle="Ports & Sockets"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
    />
  );
}
