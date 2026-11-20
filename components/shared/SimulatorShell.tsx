"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import RouteHelp from "./RouteHelp";
import Logo from "./Logo";

interface HelpSection {
  heading: string;
  body: string;
}

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  phase: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    phase: "Foundation",
    items: [
      { href: "/topology", label: "Network Lab" },
      { href: "/packet", label: "Packet" },
      { href: "/osi", label: "OSI Layers" },
      { href: "/encapsulation", label: "Encapsulation" },
      { href: "/network-devices", label: "Network Devices" },
      { href: "/packet-life", label: "Packet Life Explorer" },
    ],
  },
  {
    phase: "Layer 2",
    items: [
      { href: "/ethernet", label: "Ethernet" },
      { href: "/mac-learning", label: "MAC Learning" },
      { href: "/arp", label: "ARP" },
    ],
  },
  {
    phase: "Layer 3",
    items: [
      { href: "/ipv4", label: "IPv4" },
      { href: "/ipv4/fragmentation", label: "IPv4 Fragmentation" },
      { href: "/subnetting", label: "Subnetting" },
      { href: "/routing", label: "Routing" },
      { href: "/routing-table", label: "Routing Tables" },
      { href: "/nat", label: "NAT" },
      { href: "/icmp", label: "ICMP" },
    ],
  },
  {
    phase: "Layer 4",
    items: [
      { href: "/ports", label: "Ports & Sockets" },
      { href: "/udp", label: "UDP" },
      { href: "/tcp/handshake", label: "TCP Handshake" },
      { href: "/tcp/data-transfer", label: "TCP Data Transfer" },
      { href: "/tcp/window", label: "TCP Sliding Window" },
      { href: "/tcp/flow-control", label: "TCP Flow Control" },
      { href: "/tcp/congestion", label: "TCP Congestion Control" },
      { href: "/tcp/termination", label: "TCP Termination" },
      { href: "/tcp/vs-udp", label: "TCP vs UDP" },
    ],
  },
  {
    phase: "Application",
    items: [
      { href: "/dhcp", label: "DHCP" },
      { href: "/dns", label: "DNS" },
      { href: "/http", label: "HTTP" },
      { href: "/https", label: "HTTPS / TLS" },
      { href: "/load-balancing", label: "Load Balancing" },
      { href: "/browser-journey", label: "Browser Journey" },
    ],
  },
  {
    phase: "Algorithms",
    items: [
      { href: "/error-detection", label: "Error Detection" },
      { href: "/reliable-transmission", label: "Reliable Transmission" },
      { href: "/mac-protocols", label: "Medium Access Control" },
    ],
  },
  {
    phase: "Enterprise",
    items: [
      { href: "/vlan", label: "VLANs" },
      { href: "/stp", label: "Spanning Tree Protocol" },
      { href: "/routing-protocols", label: "Routing Protocols" },
      { href: "/ipv6", label: "IPv6 Fundamentals" },
      { href: "/wireless", label: "Wireless Networking" },
      { href: "/websocket", label: "WebSocket" },
      { href: "/email", label: "Email Protocols" },
      { href: "/ssh", label: "SSH" },
      { href: "/firewall-acl", label: "Firewall & ACL" },
    ],
  },
  {
    phase: "Experiments",
    items: [
      { href: "/experiments/arp-timeout", label: "ARP Cache Timeout" },
      { href: "/experiments/nat-scale", label: "NAT Table Growth" },
      { href: "/experiments/routing-whatif", label: "Routing What-If" },
      { href: "/experiments/aloha-throughput", label: "ALOHA Throughput" },
      { href: "/experiments/diagnostic", label: "Diagnostic Lab" },
      { href: "/experiments/link-model", label: "Link, Queue and Loss" },
      { href: "/capture", label: "Capture Import" },
    ],
  },
];

interface Props {
  title: string;
  phaseLabel: string;
  helpTitle: string;
  helpSections: HelpSection[];
  canvas: ReactNode;
  inspector: ReactNode;
  timeline?: ReactNode;
}

// The shared skeleton for every simulation page: a slim nav rail, a canvas
// that dominates the screen, a tabbed inspector for supporting detail, and a
// playback timeline pinned to the bottom — not a stacked card list.
export default function SimulatorShell({ title, phaseLabel, helpTitle, helpSections, canvas, inspector, timeline }: Props) {
  const pathname = usePathname();

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white overflow-hidden">
      <header className="border-b border-neutral-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity shrink-0" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="w-px h-5 bg-neutral-800 shrink-0" />
        <h1 className="text-base font-bold truncate">{title}</h1>
        <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline shrink-0">
          {phaseLabel}
        </span>
        <div className="ml-auto shrink-0">
          <RouteHelp title={helpTitle} sections={helpSections} />
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <nav className="hidden md:flex md:flex-col md:w-40 shrink-0 border-r border-neutral-800 py-3 px-2 gap-3 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.phase} className="space-y-1">
              <div className="px-3 text-[10px] font-mono text-neutral-600 uppercase tracking-wider">{group.phase}</div>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors border ${
                      active
                        ? "bg-indigo-600/15 text-indigo-300 border-indigo-500/30"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-900 border-transparent"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="flex-1 min-w-0 overflow-y-auto">{canvas}</main>

        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-800 overflow-y-auto">
          {inspector}
        </aside>
      </div>

      {timeline && (
        <div className="border-t border-neutral-800 bg-neutral-900/95 backdrop-blur px-4 py-2 shrink-0">
          {timeline}
        </div>
      )}
    </div>
  );
}
