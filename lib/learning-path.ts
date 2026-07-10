// Reference data for /learning-path — the pedagogical grouping and "why this
// order" rationale, distinct from the Phase 1-5 project-organization labels
// used elsewhere. Deliberately a separate list rather than a refactor of the
// home page's STAGES: this page explains order and motivation, the home page
// explains what's built — different jobs, some inevitable overlap in hrefs.

export interface LearningPathTopic {
  label: string;
  href: string | null;
  built: boolean;
}

export interface LearningPathGroup {
  title: string;
  rationale: string;
  topics: LearningPathTopic[];
}

export const LEARNING_PATH: LearningPathGroup[] = [
  {
    title: "Foundation",
    rationale: "Before any protocol makes sense, you need the shared vocabulary: what a network even looks like, how a packet moves at all, the map of layers everything else fits into, and what \"wrapping a header around data\" actually means.",
    topics: [
      { label: "Network Lab", href: "/topology", built: true },
      { label: "Packet Animation", href: "/packet", built: true },
      { label: "OSI Layers", href: "/osi", built: true },
      { label: "Encapsulation", href: "/encapsulation", built: true },
      { label: "Network Devices", href: "/network-devices", built: true },
    ],
  },
  {
    title: "Local Networks",
    rationale: "The smallest possible network: one segment, no routing yet. This is where addresses (MAC) and the devices that read them (switches) get introduced before anything has to cross a boundary.",
    topics: [
      { label: "Ethernet", href: "/ethernet", built: true },
      { label: "MAC Learning", href: "/mac-learning", built: true },
      { label: "ARP", href: "/arp", built: true },
    ],
  },
  {
    title: "Internetworking",
    rationale: "Now networks connect to other networks. IP addressing, subnetting, routing between segments, NAT for sharing one public address, and fragmentation for when a packet is too big for the path it's taking — all fundamentally about crossing boundaries the previous group never had to.",
    topics: [
      { label: "IPv4", href: "/ipv4", built: true },
      { label: "IPv4 Fragmentation", href: "/ipv4/fragmentation", built: true },
      { label: "Subnetting", href: "/subnetting", built: true },
      { label: "Routing", href: "/routing", built: true },
      { label: "NAT", href: "/nat", built: true },
      { label: "ICMP", href: "/icmp", built: true },
    ],
  },
  {
    title: "Transport",
    rationale: "Packets can now reach the right host — but a host runs many programs at once. Ports identify which one; UDP and TCP are the two answers to \"how carefully should this arrive?\"",
    topics: [
      { label: "Ports & Sockets", href: "/ports", built: true },
      { label: "UDP", href: "/udp", built: true },
      { label: "TCP Handshake", href: "/tcp/handshake", built: true },
      { label: "TCP Data Transfer", href: "/tcp/data-transfer", built: true },
      { label: "TCP Sliding Window", href: "/tcp/window", built: true },
      { label: "TCP Flow Control", href: "/tcp/flow-control", built: true },
      { label: "TCP Congestion Control", href: "/tcp/congestion", built: true },
      { label: "TCP Connection Termination", href: "/tcp/termination", built: true },
      { label: "TCP vs UDP", href: "/tcp/vs-udp", built: true },
    ],
  },
  {
    title: "Applications",
    rationale: "Everything below exists to serve this: the protocols that actually feel like \"using the internet.\" By now you know why they use the ports and transport protocols they do.",
    topics: [
      { label: "DHCP", href: "/dhcp", built: true },
      { label: "DNS", href: "/dns", built: true },
      { label: "HTTP", href: "/http", built: true },
      { label: "HTTPS / TLS", href: "/https", built: true },
      { label: "Browser Journey (capstone)", href: "/browser-journey", built: true },
    ],
  },
  {
    title: "Advanced (Version 2)",
    rationale: "Not required to understand how the internet works end to end — but worth knowing once the fundamentals above are solid.",
    topics: [
      { label: "Spanning Tree Protocol (STP)", href: null, built: false },
      { label: "VLANs", href: null, built: false },
      { label: "Access Control Lists (ACLs)", href: null, built: false },
      { label: "Load Balancing", href: null, built: false },
    ],
  },
];
