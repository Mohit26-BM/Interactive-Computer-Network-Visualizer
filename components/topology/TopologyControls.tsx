"use client";

import { useState } from "react";
import { DeviceKind, DeviceNode, ConnectivityResult } from "@/lib/topology-engine";
import { Tool } from "./TopologyVisualizer";

interface SelectedLink {
  id: string;
  fromLabel: string;
  toLabel: string;
}

interface Props {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onArrangeCircle: () => void;
  onArrangeGrid: () => void;
  connectivity: ConnectivityResult | null;
  onTestConnectivity: () => void;
  selectedDevice: DeviceNode | null;
  selectedLink: SelectedLink | null;
  onRenameDevice: (id: string, newLabel: string) => void;
  onDeleteDevice: (label: string) => void;
  onDeleteLink: (fromLabel: string, toLabel: string) => void;
}

const TOOLS: { value: Tool; label: string; key: string }[] = [
  { value: "select", label: "Select", key: "V" },
  { value: "pc", label: "PC", key: "P" },
  { value: "switch", label: "Switch", key: "S" },
  { value: "router", label: "Router", key: "R" },
  { value: "server", label: "Server", key: "E" },
];

const KIND_LABEL: Record<DeviceKind, string> = { pc: "PC", switch: "Switch", router: "Router", server: "Server" };

// Keyed by device id from the parent so React remounts (and re-initializes
// renameValue) whenever the selection changes — no effect needed to sync it.
function RenameField({ device, onRenameDevice, onDeleteDevice }: {
  device: DeviceNode;
  onRenameDevice: (id: string, newLabel: string) => void;
  onDeleteDevice: (label: string) => void;
}) {
  const [renameValue, setRenameValue] = useState(device.label);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onRenameDevice(device.id, renameValue)}
          className="flex-1 px-2.5 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
        />
        <button type="button" onClick={() => onRenameDevice(device.id, renameValue)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors">
          Rename
        </button>
      </div>
      <button type="button" onClick={() => onDeleteDevice(device.label)} className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors">
        Delete {device.label}
      </button>
    </div>
  );
}

export default function TopologyControls({
  tool, onSetTool, onArrangeCircle, onArrangeGrid,
  connectivity, onTestConnectivity,
  selectedDevice, selectedLink, onRenameDevice, onDeleteDevice, onDeleteLink,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs text-neutral-400 uppercase tracking-wider block mb-2">Tools</label>
          <div className="grid grid-cols-2 gap-1.5">
            {TOOLS.map((t) => (
              <button
                key={t.value}
                type="button"
                draggable={t.value !== "select"}
                onDragStart={() => onSetTool(t.value)}
                onClick={() => onSetTool(tool === t.value ? "select" : t.value)}
                className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tool === t.value ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700"
                }`}
              >
                <span>{t.label}</span>
                <span className="text-[10px] opacity-60 font-mono">{t.key}</span>
              </button>
            ))}
          </div>
        </div>

        {tool !== "select" ? (
          <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs rounded-lg px-3 py-2 leading-relaxed">
            <span className="font-semibold">{KIND_LABEL[tool]} placement mode</span> — click anywhere on the canvas
            to place one (drag from the palette works too). Stays on so you can place several. Press{" "}
            <kbd className="px-1 py-0.5 bg-neutral-800 rounded">Esc</kbd> or click the tool again to stop.
          </div>
        ) : (
          <p className="text-xs text-neutral-500 leading-relaxed">
            Drag any device to reposition it. Hover a device to reveal connection handles — drag from a handle onto
            another device to cable them. Double-click a name to rename it; select a device or cable and press{" "}
            <kbd className="px-1 py-0.5 bg-neutral-800 rounded">Delete</kbd> to remove it.
          </p>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-2">
        <label className="text-xs text-neutral-400 uppercase tracking-wider block">Auto-layout</label>
        <p className="text-xs text-neutral-500">One-time actions — nothing is auto-arranged unless you click one.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onArrangeCircle} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors">
            Arrange in Circle
          </button>
          <button type="button" onClick={onArrangeGrid} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors">
            Arrange in Grid
          </button>
        </div>
      </div>

      {(selectedDevice || selectedLink) && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-2">
          <label className="text-xs text-neutral-400 uppercase tracking-wider block">Selected</label>
          {selectedDevice && (
            <RenameField key={selectedDevice.id} device={selectedDevice} onRenameDevice={onRenameDevice} onDeleteDevice={onDeleteDevice} />
          )}
          {selectedLink && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-400 font-mono">{selectedLink.fromLabel} — {selectedLink.toLabel}</p>
              <button type="button" onClick={() => onDeleteLink(selectedLink.fromLabel, selectedLink.toLabel)} className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors">
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-2">
        <button type="button" onClick={onTestConnectivity} className="w-full py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          Test Connectivity
        </button>
        {connectivity && (
          connectivity.ok ? (
            <div className="bg-green-500/10 border border-green-500/30 text-green-200 text-xs rounded-lg px-3 py-2">
              Every device can reach every other device.
            </div>
          ) : (
            <div className="space-y-2">
              {connectivity.issues.map((issue, i) => (
                <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-xs text-red-200 leading-relaxed">{issue.reason}</p>
                  <ul className="space-y-0.5">
                    {issue.suggestions.map((s, j) => (
                      <li key={j} className="text-xs text-neutral-400 leading-relaxed">&bull; {s}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
