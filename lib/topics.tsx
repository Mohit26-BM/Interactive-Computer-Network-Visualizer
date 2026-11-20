import { ReactNode } from "react";
import {
  TopologyPreview, PacketPreview, OSIPreview, EncapsulationPreview,
  EthernetPreview, MacLearningPreview, ArpPreview,
  IPv4Preview, SubnettingPreview, RoutingPreview, ICMPPreview,
  PortsPreview, UDPPreview, TCPHandshakePreview, TCPDataTransferPreview,
  TCPWindowPreview, TCPFlowControlPreview, TCPCongestionPreview, TCPTerminationPreview, TCPvsUDPPreview,
  DHCPPreview, DNSPreview, HTTPPreview, HTTPSPreview, BrowserJourneyPreview,
  NetworkDevicesPreview, FragmentationPreview, NatPreview,
  ErrorDetectionPreview, MacProtocolsPreview, ReliableTransmissionPreview,
  VlanPreview, StpPreview, RoutingProtocolsPreview, IPv6Preview, WirelessPreview,
  WebSocketPreview, EmailPreview, SshPreview, FirewallAclPreview,
  ArpTimeoutLabPreview, NatScaleLabPreview, RoutingWhatIfLabPreview, AlohaThroughputLabPreview,
  DiagnosticLabPreview, PacketLifePreview, LoadBalancingPreview,
} from "@/components/home/TopicPreviews";

// The single source of truth for every topic's rich card metadata (preview,
// description, badges) — shared by the home page's group cards and each
// group's /learn/[slug] hub page, instead of duplicating this a third time.

export interface Topic {
  href: string;
  preview: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  badges: string[];
  built: boolean;
}

export interface Stage {
  slug: string;
  phase: string;
  title: string;
  blurb: string;
  groupPreview: ReactNode; // the representative image shown on the home page's group card
  topics: Topic[];
}

export const STAGES: Stage[] = [
  {
    slug: "foundation",
    phase: "Phase 1",
    title: "Foundation",
    groupPreview: <EncapsulationPreview />,
    blurb: "No protocols yet. Just the engine: a topology to build on, a packet that can move, the OSI model to frame everything, and the encapsulation animation that ties them together.",
    topics: [
      { href: "/topology", preview: <TopologyPreview />, title: "Network Lab", subtitle: "PCs, switches, routers, servers", description: "Learn from guided examples, load a named topology template, or build anything from a blank canvas.", badges: ["interactive"], built: true },
      { href: "/packet", preview: <PacketPreview />, title: "Packet Animation", subtitle: "One packet, no protocol", description: "A single packet travels a path, hop by hop. If play / pause / rewind / speed all work here, everything later gets easier.", badges: ["playback"], built: true },
      { href: "/osi", preview: <OSIPreview />, title: "OSI Layers", subtitle: "Seven layers, one job each", description: "Not a simulation — a map. Click a layer to see what it's responsible for and where it gets built in this project.", badges: ["reference"], built: true },
      { href: "/encapsulation", preview: <EncapsulationPreview />, title: "Encapsulation", subtitle: "Where networking actually starts", description: "Watch HTTP data get wrapped in TCP, then IP, then Ethernet on the way out — and unwrapped in reverse on the way in.", badges: ["flagship"], built: true },
      { href: "/network-devices", preview: <NetworkDevicesPreview />, title: "Network Devices", subtitle: "Hub, switch, router, gateway, firewall, AP", description: "Click a device to see its OSI layer, what it forwards, and how it affects collision/broadcast domains.", badges: ["reference"], built: true },
      { href: "/packet-life", preview: <PacketLifePreview />, title: "Packet Life Explorer", subtitle: "Every layer, mutating together", description: "One HTTP request/response, fully encapsulated, crossing real hops — TTL, MAC, and TCP sequence/ack/window all changing live on a single packet's journey.", badges: ["signature"], built: true },
    ],
  },
  {
    slug: "layer-2",
    phase: "Phase 2",
    title: "Layer 2",
    blurb: "Communication on one local segment: frames, MAC addresses, and how a switch learns who's where.",
    groupPreview: <EthernetPreview />,
    topics: [
      { href: "/ethernet", preview: <EthernetPreview />, title: "Ethernet", subtitle: "Destination MAC, Source MAC, EtherType, CRC", description: "The frame format everything on a local network rides inside.", badges: ["frame"], built: true },
      { href: "/mac-learning", preview: <MacLearningPreview />, title: "MAC Address Learning", subtitle: "Flood, learn, forward", description: "Unknown MAC → flood → learn → forward. Watch a switch figure out your network by itself.", badges: ["switching"], built: true },
      { href: "/arp", preview: <ArpPreview />, title: "ARP", subtitle: "Need MAC → broadcast → reply → cache", description: "How an IP address turns into a MAC address before a frame can even be built.", badges: ["broadcast"], built: true },
    ],
  },
  {
    slug: "layer-3",
    phase: "Phase 3",
    title: "Layer 3",
    blurb: "Networking starts feeling real: addresses that mean something, and paths across many networks.",
    groupPreview: <RoutingPreview />,
    topics: [
      { href: "/ipv4", preview: <IPv4Preview />, title: "IPv4 Packet", subtitle: "Header fields + TTL", description: "Watch TTL count down, one router hop at a time.", badges: ["header"], built: true },
      { href: "/ipv4/fragmentation", preview: <FragmentationPreview />, title: "IPv4 Fragmentation", subtitle: "MTU, DF/MF, offsets, reassembly", description: "An oversized packet gets split into fragments at an 8-byte boundary, then reassembled at the destination.", badges: ["MTU"], built: true },
      { href: "/subnetting", preview: <SubnettingPreview />, title: "Subnetting", subtitle: "192.168.1.0/24 → network, broadcast, hosts", description: "Type a CIDR block, see the network ID, broadcast address, mask, and usable host range instantly.", badges: ["calculator"], built: true },
      { href: "/routing", preview: <RoutingPreview />, title: "Routing", subtitle: "Routing tables + forwarding", description: "The DSA visualizer's shortest-path renderer, repurposed: routing tables and packet forwarding.", badges: ["dijkstra"], built: true },
      { href: "/routing-table", preview: <RoutingPreview />, title: "Routing Tables", subtitle: "Longest prefix match, default gateway", description: "How a router really picks a route: compare the destination with every prefix, take the longest match, then rewrite the Ethernet header for the next hop. Switch routes off to see fallback.", badges: ["lpm", "gateway", "ttl"], built: true },
      { href: "/nat", preview: <NatPreview />, title: "NAT", subtitle: "Port Address Translation", description: "A whole private LAN shares one public IP — watch the router's translation table grow as connections come in.", badges: ["PAT"], built: true },
      { href: "/icmp", preview: <ICMPPreview />, title: "ICMP", subtitle: "Ping and traceroute", description: "Echo request/reply, and TTL-expired replies walking the path hop by hop.", badges: ["ping", "traceroute"], built: true },
    ],
  },
  {
    slug: "layer-4",
    phase: "Phase 4",
    title: "Layer 4",
    blurb: "Reliable transport, not just \"implement TCP.\" Ports first (everything else assumes them), then UDP because it's simple, then TCP split into one module per concept instead of one giant page.",
    groupPreview: <TCPHandshakePreview />,
    topics: [
      { href: "/ports", preview: <PortsPreview />, title: "Ports & Sockets", subtitle: "Well-known, registered, ephemeral", description: "Why port 80 means HTTP everywhere, and why your client's port is different every time.", badges: ["reference"], built: true },
      { href: "/udp", preview: <UDPPreview />, title: "UDP", subtitle: "Simple, fast, no guarantees", description: "Send a datagram end-to-end with no handshake, no ACK, no retransmission — and watch a lost one just vanish.", badges: ["connectionless"], built: true },
      { href: "/tcp/handshake", preview: <TCPHandshakePreview />, title: "TCP Handshake", subtitle: "SYN, SYN-ACK, ACK", description: "The three-way handshake that opens every TCP connection, with the connection-state machine on both sides.", badges: ["connection"], built: true },
      { href: "/tcp/data-transfer", preview: <TCPDataTransferPreview />, title: "TCP Data Transfer", subtitle: "Segments, sequence numbers, ACKs", description: "Basic reliable transfer before windowing — one segment, one ACK, one retransmit on loss.", badges: ["reliability"], built: true },
      { href: "/tcp/window", preview: <TCPWindowPreview />, title: "TCP Sliding Window", subtitle: "Windowing + ACKs", description: "How TCP keeps multiple segments in flight without waiting for each ACK individually.", badges: ["efficiency"], built: true },
      { href: "/tcp/flow-control", preview: <TCPFlowControlPreview />, title: "TCP Flow Control", subtitle: "Receiver window (rwnd)", description: "A slow receiver shrinks its advertised window to make the sender back off — separate from congestion control.", badges: ["rwnd"], built: true },
      { href: "/tcp/congestion", preview: <TCPCongestionPreview />, title: "TCP Congestion Control", subtitle: "Slow start, avoidance, fast retransmit", description: "How TCP responds to loss in the network itself — and shares it fairly with everyone else.", badges: ["congestion"], built: true },
      { href: "/tcp/termination", preview: <TCPTerminationPreview />, title: "TCP Connection Termination", subtitle: "FIN, ACK, FIN, ACK", description: "Why closing a connection takes four packets, and what TIME_WAIT is for.", badges: ["teardown"], built: true },
      { href: "/tcp/vs-udp", preview: <TCPvsUDPPreview />, title: "TCP vs UDP", subtitle: "Side-by-side comparison", description: "The same scenario, twice — once reliable and slower, once fast and lossy.", badges: ["comparison"], built: true },
    ],
  },
  {
    slug: "application",
    phase: "Phase 5",
    title: "Application Layer",
    blurb: "Everything comes together — the protocols that actually feel like \"using the internet.\"",
    groupPreview: <BrowserJourneyPreview />,
    topics: [
      { href: "/dhcp", preview: <DHCPPreview />, title: "DHCP", subtitle: "Discover, Offer, Request, Ack", description: "How a device gets an IP address without anyone typing one in.", badges: ["DORA"], built: true },
      { href: "/dns", preview: <DNSPreview />, title: "DNS", subtitle: "Recursive resolution", description: "How \"google.com\" becomes an IP address — resolver, root, TLD, authoritative.", badges: ["resolution"], built: true },
      { href: "/http", preview: <HTTPPreview />, title: "HTTP", subtitle: "Request, response, headers", description: "The request/response exchange that finally delivers the page.", badges: ["request", "response"], built: true },
      { href: "/https", preview: <HTTPSPreview />, title: "HTTPS", subtitle: "TLS, certificates, encryption", description: "Everything HTTP does, wrapped in a TLS handshake first.", badges: ["TLS"], built: true },
      { href: "/load-balancing", preview: <LoadBalancingPreview />, title: "Load Balancing", subtitle: "Round Robin, Least Connections, Weighted, IP Hash", description: "A real request rarely goes straight to \"the server\" anymore — it goes to a pool, and something has to decide which one.", badges: ["infrastructure"], built: true },
      { href: "/browser-journey", preview: <BrowserJourneyPreview />, title: "Browser Journey", subtitle: "The capstone — everything, connected", description: "DHCP, DNS, ARP, Ethernet, IP, TCP, TLS, Load Balancing, HTTP — one continuous story, each stage linking into the real simulator.", badges: ["capstone"], built: true },
    ],
  },
  {
    slug: "network-algorithms",
    phase: "Algorithms",
    title: "Network Algorithms",
    blurb: "The theoretical machinery behind the protocols above — not something you use directly, but what explains why they behave the way they do.",
    groupPreview: <ErrorDetectionPreview />,
    topics: [
      { href: "/error-detection", preview: <ErrorDetectionPreview />, title: "Error Detection", subtitle: "CRC, Internet Checksum, Parity", description: "The checksum/CRC field every earlier page has shown as an opaque hex value, finally computed by hand.", badges: ["CRC", "checksum"], built: true },
      { href: "/mac-protocols", preview: <MacProtocolsPreview />, title: "Medium Access Control", subtitle: "ALOHA, Slotted ALOHA, CSMA/CD, CSMA/CA", description: "What happens on a shared medium before switching solved the collision problem for good.", badges: ["contention"], built: true },
      { href: "/reliable-transmission", preview: <ReliableTransmissionPreview />, title: "Reliable Transmission", subtitle: "Go-Back-N vs Selective Repeat", description: "The two textbook strategies for recovering from loss while pipelining, compared side by side.", badges: ["ARQ"], built: true },
    ],
  },
  {
    slug: "enterprise",
    phase: "Version 1.1",
    title: "Enterprise Networking",
    blurb: "Beyond one flat LAN: how switches segment themselves, keep loops from destroying the network, choose routes automatically, and how modern clients actually connect — wired, wireless, and web.",
    groupPreview: <VlanPreview />,
    topics: [
      { href: "/vlan", preview: <VlanPreview />, title: "VLANs", subtitle: "One switch, many broadcast domains", description: "Split a switch into isolated VLANs, then watch cross-VLAN traffic get blocked — or routed, once a router-on-a-stick is added.", badges: ["802.1Q"], built: true },
      { href: "/stp", preview: <StpPreview />, title: "Spanning Tree Protocol", subtitle: "Root bridge, blocked ports, no loops", description: "A redundant link creates a loop that would broadcast-storm the network forever — STP elects a root and blocks the extra path before that happens.", badges: ["loop-free"], built: true },
      { href: "/routing-protocols", preview: <RoutingProtocolsPreview />, title: "Routing Protocols", subtitle: "Distance Vector vs Link State — RIP, OSPF", description: "One hub: RIP floods hop counts to neighbors; OSPF floods the whole topology and runs Dijkstra locally — same goal, opposite strategy.", badges: ["RIP", "OSPF"], built: true },
      { href: "/ipv6", preview: <IPv6Preview />, title: "IPv6 Fundamentals", subtitle: "128 bits, compressed notation, no NAT", description: "Address format, :: compression, prefixes, and neighbor discovery replacing ARP — side by side with the IPv4 you already know.", badges: ["reference"], built: true },
      { href: "/wireless", preview: <WirelessPreview />, title: "Wireless Networking", subtitle: "SSID, association, CSMA/CA", description: "Why Wi-Fi can't detect collisions mid-transmission the way Ethernet can, and how CSMA/CA works around that.", badges: ["Wi-Fi"], built: true },
      { href: "/websocket", preview: <WebSocketPreview />, title: "WebSocket", subtitle: "HTTP upgrade → persistent connection", description: "One HTTP handshake asks to switch protocols, then the same TCP connection carries frames both directions, no request/response needed.", badges: ["upgrade"], built: true },
      { href: "/email", preview: <EmailPreview />, title: "Email Protocols", subtitle: "SMTP, POP3, IMAP", description: "Sending is always SMTP; retrieving is POP3 (download and delete) or IMAP (stay synced across devices) — one page, all three.", badges: ["SMTP"], built: true },
      { href: "/ssh", preview: <SshPreview />, title: "SSH", subtitle: "Key exchange, authentication, encrypted shell", description: "How a remote shell session gets encrypted before a single command is typed — the same key-exchange idea as TLS, applied to a terminal.", badges: ["encryption"], built: true },
      { href: "/firewall-acl", preview: <FirewallAclPreview />, title: "Firewall & ACL", subtitle: "Permit / deny, first match wins", description: "A rule list checked top to bottom against one packet — first match wins, and nothing matched falls through to an implicit deny.", badges: ["permit/deny"], built: true },
    ],
  },
  {
    slug: "experiments",
    phase: "Experiments",
    title: "Experiments",
    blurb: "Same engines you've already seen, run with a different input — plus one page that's pure closed-form math, no simulation at all. Built to develop intuition about tradeoffs, not to teach a new protocol.",
    groupPreview: <RoutingWhatIfLabPreview />,
    topics: [
      { href: "/experiments/arp-timeout", preview: <ArpTimeoutLabPreview />, title: "ARP Cache Timeout", subtitle: "Parameter Lab", description: "The exact same ARP resolution, run repeatedly with a simulated clock — a short timeout forces far more broadcasts than a long one.", badges: ["parameter lab"], built: true },
      { href: "/experiments/nat-scale", preview: <NatScaleLabPreview />, title: "NAT Table Growth", subtitle: "Parameter Lab", description: "The same PAT logic as NAT, scaled to a whole household of devices — watch the table grow to any size on one shared public IP.", badges: ["parameter lab"], built: true },
      { href: "/experiments/routing-whatif", preview: <RoutingWhatIfLabPreview />, title: "Routing What-If", subtitle: "Parameter Lab", description: "The same Dijkstra run twice — once as-is, once after you reweight a link, fail a link, or fail a router — comparing cost and path before and after.", badges: ["parameter lab"], built: true },
      { href: "/experiments/aloha-throughput", preview: <AlohaThroughputLabPreview />, title: "ALOHA Throughput Curve", subtitle: "Analytical Lab", description: "The actual closed-form throughput equations for Pure and Slotted ALOHA — exact math, no randomness, plotted as a curve instead of one scenario.", badges: ["analytical lab"], built: true },
      { href: "/experiments/diagnostic", preview: <DiagnosticLabPreview />, title: "Diagnostic Lab", subtitle: "Diagnostic Lab", description: "The same browser-journey stages, with a real failure injected at one point — everything before it succeeds, everything after it never runs. Explains why, and what to check.", badges: ["diagnostic lab"], built: true },
      { href: "/experiments/link-model", preview: <TCPCongestionPreview />, title: "Link, Queue and Loss", subtitle: "Bandwidth, delay, buffers, Reno vs CUBIC", description: "Give a link a real speed, distance and finite queue, then watch packets queue, drop and TCP back off. Reno and CUBIC fill the same bottleneck side by side.", badges: ["queue", "loss", "cubic"], built: true },
      { href: "/capture", preview: <PacketLifePreview />, title: "Capture Import", subtitle: "Open a real Wireshark capture", description: "Load a .pcap, .pcapng or Wireshark JSON file and step through it packet by packet with plain-language explanations of handshakes, retransmissions, DNS and TLS. It all happens in your browser; nothing is uploaded.", badges: ["pcap", "wireshark", "local"], built: true },
    ],
  },
];

export function getStageBySlug(slug: string): Stage | undefined {
  return STAGES.find((s) => s.slug === slug);
}

export const totalTopics = STAGES.reduce((sum, s) => sum + s.topics.length, 0);
export const totalBuilt = STAGES.reduce((sum, s) => sum + s.topics.filter((t) => t.built).length, 0);
