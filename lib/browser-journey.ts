// The Browser Journey capstone — not a new simulation engine, deliberately.
// Every stage here already has its own fully-built visualizer; this page's
// only job is to put them in order and let you jump straight into any of
// them. No packet animation of its own, so no Step[]/usePlayer here either.

export interface JourneyStage {
  id: string;
  label: string;
  layer: string; // matches StackIndicator's layer names
  description: string;
  detail: string;
  href: string | null; // null for the final "nothing left to simulate" stage
  linkLabel?: string;
}

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: "dhcp",
    label: "DHCP",
    layer: "Application",
    description: "Does this device even have an IP address yet?",
    detail: "If it's a brand-new device on the network, it has no IP at all yet and has to get one via DORA before anything else below can happen. An already-configured device skips straight past this.",
    href: "/dhcp",
    linkLabel: "Open the DHCP simulator",
  },
  {
    id: "dns",
    label: "DNS",
    layer: "Application",
    description: '"google.com" means nothing to a network — it needs an IP address.',
    detail: "The resolver walks root → TLD → authoritative server on a cache miss, or answers instantly on a cache hit. Either way, this has to finish before a single packet can be addressed to the right place.",
    href: "/dns",
    linkLabel: "Open the DNS simulator",
  },
  {
    id: "arp",
    label: "ARP",
    layer: "Data Link",
    description: "Now there's an IP — but no frame can be built without a MAC address.",
    detail: "The device resolves the MAC address of its default gateway (or the destination directly, if it's on the same segment) via broadcast, then caches it for next time.",
    href: "/arp",
    linkLabel: "Open the ARP simulator",
  },
  {
    id: "ethernet",
    label: "Ethernet",
    layer: "Data Link",
    description: "With a MAC address in hand, the first frame gets built.",
    detail: "This frame only ever survives one segment — it gets torn down and rebuilt fresh at every router hop between here and the destination.",
    href: "/ethernet",
    linkLabel: "Open the Ethernet simulator",
  },
  {
    id: "ip",
    label: "IP Routing",
    layer: "Network",
    description: "The IP packet inside that frame gets routed, hop by hop, toward the destination.",
    detail: "Each router forwards it one step closer, decrementing TTL and rebuilding the Ethernet frame — the IP header itself survives the whole trip unchanged.",
    href: "/routing",
    linkLabel: "Open the Routing simulator",
  },
  {
    id: "tcp",
    label: "TCP Handshake",
    layer: "Transport",
    description: "Before any real data moves, the browser and server agree to a connection.",
    detail: "SYN, SYN-ACK, ACK — three segments, and both sides move from CLOSED/LISTEN to ESTABLISHED with agreed-upon starting sequence numbers.",
    href: "/tcp/handshake",
    linkLabel: "Open the TCP Handshake simulator",
  },
  {
    id: "tls",
    label: "TLS Handshake",
    layer: "Application",
    description: "For HTTPS, one more handshake happens before any HTTP is sent.",
    detail: "ClientHello, ServerHello, Certificate, Key Exchange, Finished — the slow public/private keypair only ever protects the moment a fast symmetric session key gets established.",
    href: "/https",
    linkLabel: "Open the HTTPS / TLS simulator",
  },
  {
    id: "load-balancing",
    label: "Load Balancing",
    layer: "Application",
    description: "The connection rarely lands directly on \"the server\" anymore — it lands on a pool.",
    detail: "A load balancer sits in front of the actual servers and decides which one handles this connection — by rotation, by current load, by a hash of the client's IP, or by whichever servers currently pass their health checks.",
    href: "/load-balancing",
    linkLabel: "Open the Load Balancing simulator",
  },
  {
    id: "http-request",
    label: "HTTP Request",
    layer: "Application",
    description: 'The browser finally asks: "GET / please."',
    detail: "Riding inside the TCP connection (and, for HTTPS, inside the encrypted TLS session), the actual request is just a method, a path, a host, and some headers.",
    href: "/http",
    linkLabel: "Open the HTTP simulator",
  },
  {
    id: "http-response",
    label: "HTTP Response",
    layer: "Application",
    description: "The server replies with a status code and a body.",
    detail: "200 OK and the page's HTML, or an error status if something went wrong — the same exchange, just traveling in reverse.",
    href: "/http",
    linkLabel: "Open the HTTP simulator",
  },
  {
    id: "render",
    label: "Browser Renders the Page",
    layer: "Application",
    description: "Everything above finally pays off.",
    detail: "DHCP found an address, DNS found a name, ARP and Ethernet got a frame moving, IP routed it, TCP made the connection reliable, TLS made it private, and HTTP carried the actual request and response. This is the last stage — there's nothing left to simulate, only to render.",
    href: null,
  },
];
