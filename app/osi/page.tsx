"use client";

import { useState } from "react";
import Link from "next/link";
import RouteHelp from "@/components/shared/RouteHelp";
import Logo from "@/components/shared/Logo";
import SiteFooter from "@/components/shared/SiteFooter";

interface BuildsHereLink {
  label: string;
  href?: string;
}

interface Layer {
  name: string;
  pdu: string;
  short: string;
  detail: string;
  notResponsibleFor: string;
  keyDevices: string;
  examples: string[];
  buildsHere: BuildsHereLink[];
}

// The full seven-layer OSI model. Application/Presentation/Session are often
// collapsed into one "Application" layer in the simplified TCP/IP model, but
// this page teaches the real OSI stack, not the simplification.
const LAYERS: Layer[] = [
  {
    name: "Application",
    pdu: "Data",
    short: "What the user's software actually asks for",
    detail:
      "The layer your programs talk to directly. A browser doesn't know what a TCP segment is — it just asks for \"the bytes at this URL\" and everything below handles getting them there. This is the only layer a human ever interacts with directly.",
    notResponsibleFor: "Does not know or care how the bytes actually get delivered — no addressing, no reliability, no encryption of its own.",
    keyDevices: "End-user software: browsers, mail clients, DNS resolvers, DHCP clients.",
    examples: ["HTTP / HTTPS", "DNS", "DHCP"],
    buildsHere: [{ label: "DHCP", href: "/dhcp" }, { label: "DNS", href: "/dns" }, { label: "HTTP", href: "/http" }, { label: "HTTPS", href: "/https" }],
  },
  {
    name: "Presentation",
    pdu: "Data",
    short: "Translates data into a form both ends agree on",
    detail:
      "Encoding, compression, and encryption live conceptually here — making sure the bytes one program sends mean the same thing to the program receiving them. TLS is often taught as living at this layer, since it transforms plaintext into ciphertext before anything below ever sees it.",
    notResponsibleFor: "Does not decide what the data means (that's Application) or how it's delivered (that's Transport and below).",
    keyDevices: "Rarely a distinct piece of software — usually a library the application calls into (a TLS stack, a codec).",
    examples: ["TLS/SSL", "Character encoding (UTF-8)", "Compression (gzip)"],
    buildsHere: [{ label: "HTTPS / TLS", href: "/https" }],
  },
  {
    name: "Session",
    pdu: "Data",
    short: "Manages a conversation between two programs over time",
    detail:
      "Opening, maintaining, and synchronizing a logical conversation — separate from any one TCP connection, which might open and close many times during one \"session.\" In practice, most modern application protocols fold this responsibility into themselves (cookies, session tokens) rather than using a distinct session-layer protocol.",
    notResponsibleFor: "Does not move any bytes itself — it's a bookkeeping concept layered on top of whatever Transport connections come and go underneath it.",
    keyDevices: "Application-level session state: a login session, a cookie store, an RPC session handle.",
    examples: ["Session cookies", "RPC sessions", "SSO tokens"],
    buildsHere: [{ label: "Implicit wherever a protocol keeps state across requests" }],
  },
  {
    name: "Transport",
    pdu: "Segment (TCP) / Datagram (UDP)",
    short: "End-to-end delivery between two programs",
    detail:
      "Decides whether delivery needs to be reliable and ordered (TCP: handshake, sequence numbers, retransmission, congestion control) or just fast and simple (UDP: fire and forget, no guarantees). Addressed by port numbers, not IP addresses — this is what lets one device run many independent conversations at once.",
    notResponsibleFor: "Does not know how to find the destination across networks (that's Network/IP) or what's inside the payload (that's Application).",
    keyDevices: "The OS network stack on the two communicating hosts — routers and switches never open a segment.",
    examples: ["TCP", "UDP"],
    buildsHere: [{ label: "UDP", href: "/udp" }, { label: "TCP Handshake / Window / Congestion", href: "/tcp/handshake" }],
  },
  {
    name: "Network",
    pdu: "Packet",
    short: "Logical addressing and path-finding across networks",
    detail:
      "Where IP addresses and routing live. A router only ever looks this far up the stack to decide which interface to forward a packet out of. TTL gets decremented here, one hop at a time — the mechanism that stops a misrouted packet from circling forever.",
    notResponsibleFor: "Does not guarantee delivery or ordering (that's Transport's job) and does not know about MAC addresses (that's Data Link, rebuilt fresh at every hop).",
    keyDevices: "Routers — the only device type that reads this far up the stack to make a forwarding decision.",
    examples: ["IPv4 / IPv6", "ICMP", "Routing (Dijkstra, distance-vector, link-state)"],
    buildsHere: [{ label: "IPv4", href: "/ipv4" }, { label: "Subnetting", href: "/subnetting" }, { label: "Routing", href: "/routing" }, { label: "ICMP", href: "/icmp" }],
  },
  {
    name: "Data Link",
    pdu: "Frame",
    short: "Framing and delivery on one local network segment",
    detail:
      "Handles MAC addresses and physical-segment delivery. A switch lives entirely at this layer — it never looks at an IP address, only at the destination MAC in the Ethernet frame. ARP is what bridges this layer to the one above it: it's the only place a device asks \"what MAC does this IP belong to?\"",
    notResponsibleFor: "Does not span multiple networks — a frame only ever exists on one physical segment. Reaching a different network always means rebuilding the frame at a router.",
    keyDevices: "Switches (forward frames, learn MAC-to-port mappings) and network interface cards (build/check frames).",
    examples: ["Ethernet", "ARP", "Switching / MAC learning", "Wi-Fi (802.11)"],
    buildsHere: [{ label: "Ethernet", href: "/ethernet" }, { label: "MAC Learning", href: "/mac-learning" }, { label: "ARP", href: "/arp" }],
  },
  {
    name: "Physical",
    pdu: "Bits",
    short: "Bits, as voltages, light, or radio",
    detail:
      "The actual transmission medium — copper, fiber, or air — and the electrical/optical signaling that turns a 1 or a 0 into something that can physically travel. Everything above this layer is an abstraction built on the promise that a bit sent here arrives (mostly) intact at the other end.",
    notResponsibleFor: "Has no concept of addresses, frames, or errors beyond the raw signal — it doesn't know what a MAC address is, let alone an IP address.",
    keyDevices: "Cables, hubs, repeaters, radio transceivers — anything that only deals in signal, never in addresses.",
    examples: ["Copper cable (Cat6)", "Fiber optic", "Wi-Fi radio"],
    buildsHere: [{ label: "The final \"bits\" frame in Encapsulation", href: "/encapsulation" }],
  },
];

const HELP_SECTIONS = [
  {
    heading: "What this page does",
    body: "A reference, not a simulation. Seven stacked layers, each responsible for one job and unaware of the layers above it.",
  },
  {
    heading: "How to use it",
    body: "Use the summary strip at the top to jump straight to a layer, or scroll through all seven below. Each one lists what it does, what it deliberately doesn't do, and where it gets built out in this project.",
  },
];

export default function OSIPage() {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="min-h-screen flex flex-col text-white">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Network Visualizer home" title="Back to home">
          <Logo showWordmark={false} size={22} />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-sm font-bold shrink-0">&#8801;</div>
          <h1 className="text-xl font-bold truncate">OSI Layers</h1>
          <span className="text-xs bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full font-mono hidden sm:inline">
            Phase 1 &middot; Foundation
          </span>
        </div>
        <RouteHelp title="OSI Layers" sections={HELP_SECTIONS} />
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <p className="text-sm text-neutral-400 leading-relaxed">
          A model, not a simulation — seven layers, each doing one job, each unaware of the layers above it.
          Data flows down this stack on the sender, and back up it on the receiver — that round trip is exactly
          what <Link href="/encapsulation" className="text-indigo-400 hover:text-indigo-300">Encapsulation</Link> animates.
        </p>

        <div className="bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7">
            {LAYERS.map((layer, i) => (
              <button
                key={layer.name}
                type="button"
                onClick={() => setExpanded(i)}
                className={`px-1 py-3 text-center border-r last:border-r-0 border-neutral-800 transition-colors ${
                  expanded === i ? "bg-indigo-600/15" : "hover:bg-neutral-800/40"
                }`}
              >
                <div className={`text-[10px] font-mono font-bold ${expanded === i ? "text-indigo-300" : "text-neutral-500"}`}>{LAYERS.length - i}</div>
                <div className={`text-[10px] leading-tight mt-1 ${expanded === i ? "text-white" : "text-neutral-400"}`}>{layer.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {LAYERS.map((layer, i) => {
            const isOpen = expanded === i;
            return (
              <div key={layer.name} className="bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-neutral-800/40 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                    {LAYERS.length - i}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{layer.name}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">PDU: {layer.pdu}</span>
                    </div>
                    <div className="text-xs text-neutral-500">{layer.short}</div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-neutral-500 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 space-y-3 border-t border-neutral-800">
                    <p className="text-sm text-neutral-300 leading-relaxed">{layer.detail}</p>

                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
                      <span className="text-[10px] text-red-400/80 uppercase tracking-wider font-mono">Not responsible for</span>
                      <p className="text-xs text-neutral-400 leading-relaxed mt-1">{layer.notResponsibleFor}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Key devices</span>
                      <p className="text-xs text-neutral-400 leading-relaxed mt-1">{layer.keyDevices}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {layer.examples.map((ex) => (
                        <span key={ex} className="text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700 px-2 py-0.5 rounded-full font-mono">
                          {ex}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] text-neutral-600 uppercase tracking-wider font-mono">Built here:</span>
                      {layer.buildsHere.map((b) =>
                        b.href ? (
                          <Link key={b.label} href={b.href} className="text-xs text-indigo-400 hover:text-indigo-300 font-mono underline decoration-indigo-500/30 underline-offset-2">
                            {b.label}
                          </Link>
                        ) : (
                          <span key={b.label} className="text-xs text-neutral-500 font-mono italic">{b.label}</span>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
