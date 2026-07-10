// Ports & Sockets is deliberately not a Step[] playback — like Subnetting,
// it's a reference + an instant calculator, not a process with steps worth
// scrubbing through. This is the shared vocabulary (port ranges, well-known
// services, the socket 4-tuple) every later transport-layer engine assumes.

export interface WellKnownPort {
  port: number;
  service: string;
  protocol: "TCP" | "UDP" | "TCP/UDP";
  description: string;
}

export const WELL_KNOWN_PORTS: WellKnownPort[] = [
  { port: 20, service: "FTP (data)", protocol: "TCP", description: "The actual file bytes of an FTP transfer — control and data intentionally use separate connections." },
  { port: 21, service: "FTP (control)", protocol: "TCP", description: "Commands like LIST and RETR — the data itself travels on a different port entirely." },
  { port: 22, service: "SSH", protocol: "TCP", description: "Encrypted remote shell access — also commonly tunnels other traffic." },
  { port: 23, service: "Telnet", protocol: "TCP", description: "Unencrypted remote shell — effectively retired in favor of SSH." },
  { port: 25, service: "SMTP", protocol: "TCP", description: "Mail server-to-server delivery — not what your mail client uses to send, that's usually submission on 587." },
  { port: 53, service: "DNS", protocol: "TCP/UDP", description: "UDP for ordinary lookups (fast, fits in one packet); TCP for large responses and zone transfers." },
  { port: 67, service: "DHCP (server)", protocol: "UDP", description: "Where a DHCP server listens for Discover/Request messages." },
  { port: 68, service: "DHCP (client)", protocol: "UDP", description: "Where a DHCP client listens for Offer/Ack — before it even has an IP, so this can't be TCP." },
  { port: 80, service: "HTTP", protocol: "TCP", description: "Plain, unencrypted web traffic." },
  { port: 110, service: "POP3", protocol: "TCP", description: "Downloads mail to one device, traditionally removing it from the server." },
  { port: 143, service: "IMAP", protocol: "TCP", description: "Mail that stays on the server and syncs across multiple devices." },
  { port: 443, service: "HTTPS", protocol: "TCP", description: "HTTP wrapped in TLS — the vast majority of today's web traffic." },
  { port: 3306, service: "MySQL", protocol: "TCP", description: "A specific application's registered port, not an internet standard like the ones below 1024." },
];

export type PortRange = "well-known" | "registered" | "ephemeral" | "invalid";

const EPHEMERAL_MIN = 49152;
const EPHEMERAL_MAX = 65535;

export function classifyPort(port: number): PortRange {
  if (!Number.isInteger(port) || port < 0 || port > 65535) return "invalid";
  if (port <= 1023) return "well-known";
  if (port <= 49151) return "registered";
  return "ephemeral";
}

export function lookupPort(port: number): WellKnownPort | undefined {
  return WELL_KNOWN_PORTS.find((p) => p.port === port);
}

// A fresh outgoing connection gets a new, essentially random source port
// from the dynamic/ephemeral range — this is what lets one client open many
// simultaneous connections to the very same server port.
export function randomEphemeralPort(): number {
  return EPHEMERAL_MIN + Math.floor(Math.random() * (EPHEMERAL_MAX - EPHEMERAL_MIN + 1));
}

export function socketTuple(
  protocol: "TCP" | "UDP",
  clientIp: string, clientPort: number,
  serverIp: string, serverPort: number
): string {
  return `${protocol} ${clientIp}:${clientPort} ↔ ${serverIp}:${serverPort}`;
}

export const PORTS_CODE: string[] = [
  "socket = (protocol, srcIP, srcPort, dstIP, dstPort)",
  "",
  "function classify(port) {",
  "  if (port <= 1023)   return 'well-known';   // HTTP=80, HTTPS=443, DNS=53, SSH=22...",
  "  if (port <= 49151)  return 'registered';   // vendor / specific applications",
  "  return 'ephemeral';                        // OS-assigned for an outgoing connection",
  "}",
  "",
  "function connect(client, serverIP, serverPort) {",
  "  srcPort = pickEphemeralPort();  // e.g. 52341, different every connection",
  "  return (TCP, client.ip, srcPort, serverIP, serverPort);",
  "}",
];

export const PORTS_ANNOTATIONS: Record<number, string> = {
  1: "The socket is all four values together — the same server port (443) serves thousands of clients because each client's IP:port pair is unique.",
  4: "Well-known ports are standardized — port 80 means HTTP everywhere, not just on your machine.",
  5: "Registered ports are reserved for a specific vendor/application (like MySQL's 3306) but aren't internet-wide standards.",
  6: "Ephemeral ports exist purely so a client can tell its own connections apart — nobody needs to memorize them.",
};

export const PORTS_COMPLEXITY = {
  time: "O(1)",
  space: "O(1)",
  note: "Classifying or looking up a port is a constant-time range check or table lookup — no traversal involved.",
};
