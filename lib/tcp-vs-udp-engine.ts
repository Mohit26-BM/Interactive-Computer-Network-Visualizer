// TCP vs UDP — like Ports & Sockets and Subnetting, this is a reference and
// a side-by-side comparison, not a Step[] playback. Everything either
// protocol *does* has already been simulated on its own page; this is where
// the two get placed next to each other.

export interface ComparisonRow {
  dimension: string;
  tcp: string;
  udp: string;
}

export const TCP_VS_UDP_COMPARISON: ComparisonRow[] = [
  { dimension: "Connection", tcp: "Requires a handshake before any data moves (SYN / SYN-ACK / ACK)", udp: "None — the first datagram just goes" },
  { dimension: "Reliability", tcp: "Every byte is acknowledged; lost segments are retransmitted", udp: "No acknowledgment, no retransmission — loss is silent" },
  { dimension: "Ordering", tcp: "Sequence numbers guarantee in-order delivery to the application", udp: "Datagrams can arrive out of order; the application must handle it itself" },
  { dimension: "Speed / latency", tcp: "Handshake and ACKs add round trips before and during transfer", udp: "Lowest possible latency — nothing to wait for" },
  { dimension: "Flow / congestion control", tcp: "Sliding window and congestion control adapt to the receiver and the network", udp: "None built in — the application decides its own pacing, if any" },
  { dimension: "Header overhead", tcp: "20+ bytes (seq, ack, flags, window, checksum, options...)", udp: "8 bytes (ports, length, checksum)" },
  { dimension: "Typical use", tcp: "HTTP, HTTPS, SSH, file transfer — anything that needs every byte to arrive", udp: "DNS lookups, video/voice streaming, gaming — speed over guarantees" },
];

export type Scenario = "video" | "webpage" | "dns";

export const SCENARIOS: Record<Scenario, { label: string; description: string; tcp: string[]; udp: string[] }> = {
  video: {
    label: "Streaming a live video call",
    description: "One frame's worth of data goes missing in transit.",
    tcp: [
      "The missing bytes are detected and retransmitted before anything later can be delivered.",
      "Playback has to pause and wait — a stall, not a glitch.",
      "By the time it catches up, the call may already feel behind real time.",
    ],
    udp: [
      "The dropped frame simply never arrives — nobody asks for it again.",
      "Playback keeps moving forward with everything that did arrive.",
      "The result is a brief visual/audio glitch instead of a freeze — usually the better tradeoff for something live.",
    ],
  },
  webpage: {
    label: "Loading a web page (HTTP)",
    description: "One TCP segment of the page's HTML is lost in transit.",
    tcp: [
      "TCP notices the gap and retransmits exactly that segment.",
      "The browser waits until the full, correctly-ordered page arrives.",
      "The page renders completely and correctly — just slightly later than if nothing was lost.",
    ],
    udp: [
      "If HTTP ran on raw UDP, that missing chunk of HTML would just be gone.",
      "The browser would have to detect and re-request it itself — reimplementing what TCP already does.",
      "This is exactly why nobody serves ordinary web pages over raw UDP.",
    ],
  },
  dns: {
    label: "Looking up a domain name",
    description: "A client asks a resolver to turn a hostname into an IP address.",
    tcp: [
      "A full handshake happens before the tiny query can even be sent.",
      "Reserved mostly for oversized responses or zone transfers, not ordinary lookups.",
      "Reliable, but a lot of overhead for one question and one answer.",
    ],
    udp: [
      "One packet out with the question, one packet back with the answer.",
      "If the reply is lost, the resolver just asks again after a short timeout — cheap enough that this is fine.",
      "This is why ordinary DNS queries default to UDP.",
    ],
  },
};

export const TCP_VS_UDP_CODE: string[] = [
  "function chooseTransport(requirement) {",
  "  if (requirement.everyByteMustArrive || requirement.mustBeInOrder)",
  "    return 'TCP';",
  "",
  "  if (requirement.latencyMattersMoreThanLoss)",
  "    return 'UDP';",
  "",
  "  return 'TCP'; // default to reliability unless you have a specific reason not to",
  "}",
];

export const TCP_VS_UDP_ANNOTATIONS: Record<number, string> = {
  2: "This single question — does losing a piece matter more than the delay of fixing it? — is really the whole decision.",
  5: "Real-time media, gaming, and simple query/response protocols are the classic cases where a late answer is worse than a missing one.",
  8: "TCP is the safe default specifically because reliability bugs are much harder to notice and debug than a slightly slower connection.",
};

export const TCP_VS_UDP_COMPLEXITY = {
  time: "N/A",
  space: "N/A",
  note: "This page is a comparison, not an algorithm — every behavior described here was already simulated in detail on the UDP, TCP Data Transfer, and TCP Congestion Control pages.",
};
