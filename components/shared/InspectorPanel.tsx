"use client";

import { ReactNode, useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
}

// Tabbed supporting-information panel — packet details, pseudocode, and the
// AI explanation live here instead of stacked one after another, so they
// never compete with the simulation for the user's attention.
export default function InspectorPanel({ tabs }: Props) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-neutral-800 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveId(t.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              active?.id === t.id
                ? "text-indigo-300 border-indigo-500"
                : "text-neutral-500 border-transparent hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-3">{active?.content}</div>
    </div>
  );
}
