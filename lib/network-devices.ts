// Reference data for /network-devices — no engine, no Step[], same category
// as the OSI page: a map, not a simulation.

export interface NetworkDeviceInfo {
  name: string;
  osiLayer: string;
  forwardingUnit: string;
  collisionDomain: string;
  broadcastDomain: string;
  short: string;
  detail: string;
  buildsHere: { label: string; href?: string }[];
}

export const NETWORK_DEVICES: NetworkDeviceInfo[] = [
  {
    name: "Hub",
    osiLayer: "Physical",
    forwardingUnit: "Bits — no addressing at all",
    collisionDomain: "One shared domain across every port",
    broadcastDomain: "One shared domain across every port",
    short: "A dumb repeater — everything in, everything out every other port",
    detail: "A hub has no concept of addresses at all — it just repeats every bit it receives out every other port. Every device attached to a hub is in the same collision domain, which is exactly why hubs have essentially disappeared from real networks in favor of switches.",
    buildsHere: [{ label: "Not modeled directly — switches replaced hubs entirely in this project, same as in real networks" }],
  },
  {
    name: "Bridge",
    osiLayer: "Data Link",
    forwardingUnit: "Frames, by MAC address",
    collisionDomain: "One per port",
    broadcastDomain: "One shared domain across all ports",
    short: "An early, usually 2-port version of what a switch does with many ports",
    detail: "A bridge reads MAC addresses and forwards frames only toward the segment that needs them, splitting a network into separate collision domains. A switch is really just a bridge with many ports — the MAC learning behavior is identical.",
    buildsHere: [{ label: "MAC Learning (the behavior a switch generalizes this into)", href: "/mac-learning" }],
  },
  {
    name: "Switch",
    osiLayer: "Data Link",
    forwardingUnit: "Frames, by MAC address",
    collisionDomain: "One per port",
    broadcastDomain: "One shared domain across all ports (unless split by VLANs)",
    short: "Learns which MAC address lives behind which port, and forwards accordingly",
    detail: "Floods a frame only the first time a destination MAC is unknown; after that, it forwards straight to the right port. Every port on a switch is its own collision domain — this is why switched networks don't suffer the collisions hubs did.",
    buildsHere: [{ label: "MAC Learning", href: "/mac-learning" }, { label: "Ethernet", href: "/ethernet" }, { label: "Network Lab (place and cable one yourself)", href: "/topology" }],
  },
  {
    name: "Router",
    osiLayer: "Network",
    forwardingUnit: "Packets, by IP address",
    collisionDomain: "One per interface",
    broadcastDomain: "One per interface — routers don't forward broadcasts onward",
    short: "The only device type in this list that reads an IP address to make its decision",
    detail: "A router terminates every Ethernet frame it receives and builds a brand-new one for the next hop — the IP packet inside survives the whole trip, decrementing TTL once per hop, while the frame around it never does.",
    buildsHere: [{ label: "IPv4", href: "/ipv4" }, { label: "Routing", href: "/routing" }, { label: "NAT", href: "/nat" }],
  },
  {
    name: "Gateway",
    osiLayer: "Any / all — often just \"a router doing more\"",
    forwardingUnit: "Whatever it's translating between",
    collisionDomain: "One per interface",
    broadcastDomain: "One per interface",
    short: "A general term for anything that connects two otherwise-incompatible networks",
    detail: "\"Default gateway\" usually just means the router a host sends everything to that isn't on its own local segment. More generally, a gateway can translate between entirely different protocols (a VoIP gateway between the phone network and IP, for example) — a role broader than any single OSI layer.",
    buildsHere: [{ label: "The \"default gateway\" a host resolves via ARP before leaving its own segment", href: "/arp" }],
  },
  {
    name: "Firewall",
    osiLayer: "Network through Application, depending on type",
    forwardingUnit: "Packets or connections, filtered by rule",
    collisionDomain: "One per interface",
    broadcastDomain: "One per interface",
    short: "Decides whether traffic is allowed through at all, rather than just where to send it",
    detail: "A simple packet-filtering firewall inspects IP/port headers (Network/Transport layer); a modern application firewall can inspect HTTP requests themselves (Application layer). Either way, its defining trait is permit/deny — not path-finding.",
    buildsHere: [{ label: "Firewall & ACL", href: "/firewall-acl" }],
  },
  {
    name: "Access Point",
    osiLayer: "Data Link (with Physical-layer radio underneath)",
    forwardingUnit: "Frames, by MAC address — over radio instead of copper",
    collisionDomain: "Shared over the air among all connected wireless clients",
    broadcastDomain: "Bridged into whatever wired segment it's plugged into",
    short: "A switch port's job, done over Wi-Fi instead of a cable",
    detail: "An access point does the same MAC-address forwarding job a switch does — it just replaces the cable with a radio link. It's typically bridged straight into a wired switch, extending that switch's broadcast domain over the air.",
    buildsHere: [{ label: "Ethernet and MAC Learning apply once a frame reaches the wired side", href: "/ethernet" }],
  },
];
