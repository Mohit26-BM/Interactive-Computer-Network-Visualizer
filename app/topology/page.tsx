"use client";

import { useState, useEffect, useCallback } from "react";
import SimulatorShell from "@/components/shared/SimulatorShell";
import InspectorPanel from "@/components/shared/InspectorPanel";
import TopologyVisualizer, { Tool } from "@/components/topology/TopologyVisualizer";
import TopologyControls from "@/components/topology/TopologyControls";
import CodePanel from "@/components/shared/CodePanel";
import AIExplainer from "@/components/shared/AIExplainer";
import {
  buildDefaultTopology,
  buildPresetTopology,
  topologyPlaceDevice,
  topologyRemoveDevice,
  topologyAddLink,
  topologyRemoveLink,
  topologyRenameDevice,
  checkConnectivity,
  circlePositions,
  computeGridPositions,
  TopologyState,
  TopologyStep,
  PresetKind,
  PRESET_INFO,
  TOPOLOGY_COMPARISON,
  ConnectivityResult,
  TOPOLOGY_CODE,
  TOPOLOGY_ANNOTATIONS,
  TOPOLOGY_COMPLEXITY,
} from "@/lib/topology-engine";

const PRESET_ORDER: PresetKind[] = ["star", "ring", "bus", "mesh", "smallOffice", "homeNetwork"];

interface Lesson {
  title: string;
  body: string;
  preset?: PresetKind;
}

const LESSONS: Lesson[] = [
  {
    title: "Why offices use a Star",
    body: "One switch, every desk cabled straight to it. Losing one cable only takes down one desk — but lose the switch and the whole office goes dark. Load it and try removing a link vs. removing the hub.",
    preset: "star",
  },
  {
    title: "What breaks (and doesn't) in a Ring",
    body: "Each device only talks to its two neighbors. Disconnect one cable — the ring becomes a line, but nobody is actually cut off yet. Disconnect a second and someone finally is.",
    preset: "ring",
  },
  {
    title: "A home network, unpacked",
    body: "One router quietly does the job of a switch and a Wi-Fi access point at once — that's why a home network looks like a star even though nobody bought a separate switch.",
    preset: "homeNetwork",
  },
  {
    title: "Build your first sandbox network",
    body: "Switch to the Lab tab, pick Router or PC from the palette, click the canvas to place a few, then drag a connection handle from one onto another to cable them.",
  },
];

const phaseCaption: Record<string, string> = {
  insert: "bg-green-500/15 border-green-500/30 text-green-200",
  found: "bg-orange-500/15 border-orange-500/30 text-orange-200",
  delete: "bg-red-500/15 border-red-500/30 text-red-200",
  error: "bg-red-500/15 border-red-500/30 text-red-200",
  default: "bg-indigo-500/15 border-indigo-500/30 text-indigo-200",
};

const HELP_SECTIONS = [
  { heading: "What this page does", body: "A Network Lab: Learn walks through guided examples, Templates loads a named shape (Star, Ring, Bus, Mesh, Small Office, Home Network) instantly, and Lab is a blank canvas for building anything by hand." },
  { heading: "How to use it", body: "In the Lab tab, pick a tool and click the canvas to place a device (or drag it from the palette); drag any device to reposition it; drag from its connection handles onto another device to cable them; double-click a name to rename it; select something and press Delete to remove it." },
  { heading: "Why it matters", body: "Every later visualization in this project runs on top of a topology like this one — it's the shared canvas everything else animates across." },
];

interface LastAction {
  op: string;
  explanation: string;
  phase?: string;
  highlightLine: number;
}

export default function TopologyPage() {
  const [topology, setTopology] = useState<TopologyState>(() => buildDefaultTopology());
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityResult | null>(null);

  function apply(op: string, result: TopologyStep[]) {
    const last = result[result.length - 1];
    if (!last) return;
    setTopology(last.state);
    setLastAction({ op, explanation: last.explanation, phase: last.phase, highlightLine: last.highlightLine });
    setConnectivity(null);
  }

  const handlePlace = useCallback((x: number, y: number) => {
    if (tool === "select") return;
    apply("addDevice", topologyPlaceDevice(topology, tool, x, y));
  }, [tool, topology]);

  const handleRemoveDeviceByLabel = useCallback((label: string) => {
    apply("removeDevice", topologyRemoveDevice(topology, label));
    setSelectedDeviceId(null);
  }, [topology]);

  const handleCreateLink = useCallback((fromId: string, toId: string) => {
    const from = topology.devices.find((d) => d.id === fromId);
    const to = topology.devices.find((d) => d.id === toId);
    if (!from || !to) return;
    apply("addLink", topologyAddLink(topology, from.label, to.label));
  }, [topology]);

  const handleDisconnect = useCallback((fromLabel: string, toLabel: string) => {
    apply("removeLink", topologyRemoveLink(topology, fromLabel, toLabel));
    setSelectedLinkId(null);
  }, [topology]);

  const handleRenameDevice = useCallback((id: string, newLabel: string) => {
    apply("renameDevice", topologyRenameDevice(topology, id, newLabel));
  }, [topology]);

  const handleMoveDevice = useCallback((id: string, x: number, y: number) => {
    setTopology((prev) => ({ ...prev, positions: { ...prev.positions, [id]: { x, y } } }));
  }, []);

  const handleLoadPreset = (kind: PresetKind) => {
    setLastAction(null);
    setConnectivity(null);
    setSelectedDeviceId(null);
    setSelectedLinkId(null);
    setTopology(buildPresetTopology(kind));
  };

  const handleArrangeCircle = () => {
    setTopology((prev) => ({ ...prev, positions: circlePositions(prev.devices, 300, 190, 150) }));
  };

  const handleArrangeGrid = () => {
    setTopology((prev) => {
      const grid = computeGridPositions(prev.devices.length);
      const positions: Record<string, { x: number; y: number }> = {};
      prev.devices.forEach((d, i) => { positions[d.id] = grid[i]; });
      return { ...prev, positions };
    });
  };

  const handleTestConnectivity = () => setConnectivity(checkConnectivity(topology));

  // Keyboard shortcuts — ignored while typing in a rename/other text field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const map: Record<string, Tool> = { v: "select", p: "pc", s: "switch", r: "router", e: "server" };
      const key = e.key.toLowerCase();
      if (map[key]) { setTool(map[key]); return; }
      if (e.key === "Escape") { setTool("select"); setSelectedDeviceId(null); setSelectedLinkId(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedDeviceId) {
          const d = topology.devices.find((x) => x.id === selectedDeviceId);
          if (d) handleRemoveDeviceByLabel(d.label);
        } else if (selectedLinkId) {
          const l = topology.links.find((x) => x.id === selectedLinkId);
          if (l) {
            const from = topology.devices.find((d) => d.id === l.from);
            const to = topology.devices.find((d) => d.id === l.to);
            if (from && to) handleDisconnect(from.label, to.label);
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDeviceId, selectedLinkId, topology, handleRemoveDeviceByLabel, handleDisconnect]);

  const complexity = lastAction ? TOPOLOGY_COMPLEXITY[lastAction.op] : undefined;
  const annotation = lastAction ? TOPOLOGY_ANNOTATIONS[lastAction.op]?.[lastAction.highlightLine] : undefined;
  const captionClass = phaseCaption[lastAction?.phase ?? "default"] ?? phaseCaption.default;

  const selectedDevice = selectedDeviceId ? topology.devices.find((d) => d.id === selectedDeviceId) ?? null : null;
  const selectedLinkObj = selectedLinkId ? topology.links.find((l) => l.id === selectedLinkId) : undefined;
  const selectedLink = selectedLinkObj
    ? {
        id: selectedLinkObj.id,
        fromLabel: topology.devices.find((d) => d.id === selectedLinkObj.from)?.label ?? "?",
        toLabel: topology.devices.find((d) => d.id === selectedLinkObj.to)?.label ?? "?",
      }
    : null;

  const canvas = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-300">Topology</span>
        <span className="text-xs text-neutral-500">{topology.devices.length} devices &middot; {topology.links.length} links</span>
      </div>
      <TopologyVisualizer
        state={topology}
        tool={tool}
        onPlace={handlePlace}
        onMoveDevice={handleMoveDevice}
        onCreateLink={handleCreateLink}
        onRenameDevice={handleRenameDevice}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        selectedLinkId={selectedLinkId}
        onSelectLink={setSelectedLinkId}
      />
      {lastAction && (
        <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition-all duration-300 ${captionClass}`}>
          <span className="text-base shrink-0">&#9656;</span>
          <span className="text-sm leading-relaxed">{lastAction.explanation}</span>
        </div>
      )}
    </div>
  );

  const inspector = (
    <InspectorPanel
      tabs={[
        {
          id: "learn",
          label: "Learn",
          content: (
            <div className="space-y-3">
              {LESSONS.map((lesson) => (
                <div key={lesson.title} className="bg-neutral-900 border border-neutral-700 rounded-xl p-3.5 space-y-2">
                  <h3 className="text-sm font-semibold text-white">{lesson.title}</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">{lesson.body}</p>
                  {lesson.preset && (
                    <button
                      type="button"
                      onClick={() => handleLoadPreset(lesson.preset!)}
                      className="text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
                    >
                      Load this topology &rarr;
                    </button>
                  )}
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "templates",
          label: "Templates",
          content: (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-neutral-500 mb-2">One click replaces the canvas with a named shape — a starting point, not a constraint. You can drag devices or keep building on top of it right after.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_ORDER.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleLoadPreset(p)}
                      title={PRESET_INFO[p].description}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors"
                    >
                      {PRESET_INFO[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">How they compare</div>
                <div className="overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-neutral-900 text-neutral-500">
                        <th className="text-left px-2.5 py-1.5 font-medium">Topology</th>
                        <th className="text-left px-2.5 py-1.5 font-medium">Cost</th>
                        <th className="text-left px-2.5 py-1.5 font-medium">Reliability</th>
                        <th className="text-left px-2.5 py-1.5 font-medium">Scalability</th>
                        <th className="text-left px-2.5 py-1.5 font-medium">Common use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TOPOLOGY_COMPARISON.map((row) => (
                        <tr key={row.topology} className="border-t border-neutral-800 text-neutral-300">
                          <td className="px-2.5 py-1.5 font-medium text-white">{row.topology}</td>
                          <td className="px-2.5 py-1.5">{row.cost}</td>
                          <td className="px-2.5 py-1.5">{row.reliability}</td>
                          <td className="px-2.5 py-1.5">{row.scalability}</td>
                          <td className="px-2.5 py-1.5">{row.use}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-neutral-600 mt-2 italic">Tree and Hybrid combine the shapes above — there&apos;s no one-click button for them on purpose. Try building one yourself in the Lab tab.</p>
              </div>
            </div>
          ),
        },
        {
          id: "lab",
          label: "Lab",
          content: (
            <TopologyControls
              tool={tool}
              onSetTool={setTool}
              onArrangeCircle={handleArrangeCircle}
              onArrangeGrid={handleArrangeGrid}
              connectivity={connectivity}
              onTestConnectivity={handleTestConnectivity}
              selectedDevice={selectedDevice}
              selectedLink={selectedLink}
              onRenameDevice={handleRenameDevice}
              onDeleteDevice={handleRemoveDeviceByLabel}
              onDeleteLink={handleDisconnect}
            />
          ),
        },
        {
          id: "details",
          label: "Details",
          content: complexity ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Time</div>
                  <div className="text-lg font-bold text-indigo-400">{complexity.time}</div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Space</div>
                  <div className="text-lg font-bold text-violet-400">{complexity.space}</div>
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{complexity.note}</p>
            </div>
          ) : (
            <p className="text-xs text-neutral-600 italic">Place, connect, rename, or remove something to see its complexity notes.</p>
          ),
        },
        {
          id: "code",
          label: "Code",
          content: lastAction ? (
            <CodePanel lines={TOPOLOGY_CODE[lastAction.op] ?? []} highlightLine={lastAction.highlightLine} annotation={annotation} />
          ) : (
            <p className="text-xs text-neutral-600 italic">Place, connect, rename, or remove something to see its pseudocode.</p>
          ),
        },
        {
          id: "explain",
          label: "Explain",
          content: lastAction ? (
            <AIExplainer
              algorithm="Network Topology"
              stepExplanation={lastAction.explanation}
              stepIndex={0}
              totalSteps={1}
            />
          ) : (
            <p className="text-xs text-neutral-600 italic">Place, connect, rename, or remove something to get an AI explanation.</p>
          ),
        },
      ]}
    />
  );

  return (
    <SimulatorShell
      title="Network Lab"
      phaseLabel="Phase 1 · Foundation"
      helpTitle="Network Lab"
      helpSections={HELP_SECTIONS}
      canvas={canvas}
      inspector={inspector}
    />
  );
}
