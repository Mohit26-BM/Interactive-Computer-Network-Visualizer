// One "In real networks" note per simulator page. The simulations are deliberately simplified;
// each note says what production systems do on top of (or instead of) what the page shows.
// Keyed by route path; shown in the page's "?" help panel by SimulatorShell.

export const REAL_WORLD_NOTES: Record<string, string> = {
  // Foundation
  "/topology": "Real networks are built in tiers (access, distribution, core) with redundant links, and every device also has a management plane (SSH, SNMP, telemetry) that this lab does not model.",
  "/packet": "A real packet does not move at one speed: each link adds serialization delay (size / bandwidth), propagation delay (distance at about two thirds of light speed) and queueing at every router. See the Link, Queue and Loss lab.",
  "/osi": "OSI is a teaching model. The internet runs TCP/IP, which merges OSI's top three layers into one application layer and its bottom two into one link layer, and protocols such as TLS and QUIC do not sit in a single layer.",
  "/encapsulation": "Production stacks add more wrappers: VLAN tags (4 bytes), VPN and VXLAN tunnels with extra headers, and NIC offloads (TSO/GRO) so the frames on the wire can differ from what software builds.",
  "/network-devices": "The boxes blur in practice: a home 'router' is also a switch, Wi-Fi access point, NAT, DHCP server and firewall, and enterprise layer-3 switches route in hardware at wire speed.",
  "/packet-life": "A real request first needs DHCP, DNS, ARP and a TLS handshake, and usually passes a CDN or load balancer before the server sees it. This page shows one clean pass.",

  // Layer 2
  "/ethernet": "Modern Ethernet is full-duplex and switched, so collisions and CSMA/CD no longer happen. Frames are at least 64 bytes, preceded by an 8-byte preamble and followed by a 12-byte gap, and data centres use jumbo frames of up to 9000 bytes.",
  "/mac-learning": "Real MAC tables are finite and age out after about 5 minutes. An attacker can flood a switch with fake MACs to make it behave like a hub, so ports use port security or 802.1X.",
  "/arp": "ARP has no authentication, so ARP spoofing works on most LANs; defences are dynamic ARP inspection and static entries. Hosts send gratuitous ARPs when an address changes, and IPv6 uses Neighbor Discovery instead.",

  // Layer 3
  "/ipv4": "Real IPv4 headers also carry options, DSCP/ECN bits and a checksum recomputed at every hop. Most users sit behind NAT because the public IPv4 space is exhausted.",
  "/ipv4/fragmentation": "Fragmentation is avoided in practice: hosts set the DF bit and use Path MTU Discovery, and firewalls often drop fragments. VPNs and tunnels shrink the effective MTU, which is why MSS clamping exists.",
  "/subnetting": "Real networks use variable-length subnets (VLSM), /31 on point-to-point links (RFC 3021) and several private ranges (10/8, 172.16/12, 192.168/16, 100.64/10 for carrier NAT). The internet routes on aggregated prefixes.",
  "/routing": "This page finds shortest paths on equal-cost links. Real routers forward by routing-table lookup with longest prefix match (see Routing Tables), and links have different costs and capacities.",
  "/routing-table": "The internet's global table holds roughly a million IPv4 prefixes, stored in hardware (TCAM) so a lookup takes constant time. Routes also carry policy (BGP local preference, communities), and ECMP spreads flows over several equal-cost next hops.",
  "/nat": "Home routers and carriers translate addresses and ports. Entries expire (UDP within seconds to minutes, idle TCP after hours), peer-to-peer apps need STUN or hole punching, and carrier-grade NAT shares one public address among many subscribers.",
  "/icmp": "Many networks rate-limit or block ICMP, so ping and traceroute can mislead: routers may show * and ECMP can send probes down different paths. Blocking all ICMP also breaks Path MTU Discovery.",

  // Layer 4
  "/ports": "Ports below 1024 need privileges on Unix, ephemeral ranges differ by OS (Linux 32768-60999, IANA 49152-65535), and firewalls and load balancers decide which ports are reachable from outside.",
  "/udp": "UDP carries DNS, voice, games and QUIC (HTTP/3), where the application adds its own reliability. NATs time UDP flows out quickly, and UDP floods and amplification are a major DDoS vector.",
  "/tcp/handshake": "Real handshakes carry options (MSS, SACK, window scale, timestamps), retransmit lost SYNs with exponential backoff, and servers defend with SYN cookies. TCP Fast Open and QUIC remove the extra round trip.",
  "/tcp/data-transfer": "Real TCP uses delayed ACKs (typically 40-200 ms), Nagle's algorithm, SACK and fast retransmit instead of waiting for timeouts, and sizes segments to the path MTU (usually 1460 bytes of data).",
  "/tcp/window": "Modern windows are scaled with the window-scale option (up to about 1 GB) and auto-tuned by the operating system. The usable window is the smaller of the receiver's window and the congestion window.",
  "/tcp/flow-control": "Receivers advertise how much buffer is free and senders probe a zero window. An application that reads slowly is what actually shrinks the window, and buffers are auto-tuned to the bandwidth-delay product.",
  "/tcp/congestion": "Most servers use CUBIC (Linux, Windows, macOS) or BBR (Google, Netflix). Modern stacks start with 10 segments, detect loss with SACK/RACK long before a timeout, and react to ECN marks.",
  "/tcp/termination": "Connections end with FIN in each direction or an abrupt RST. The side that closes first waits in TIME_WAIT (about 60 s on Linux), and busy servers can run out of ports because of it. Firewalls also silently drop idle connections.",
  "/tcp/vs-udp": "The choice is no longer binary: QUIC rebuilds reliable streams, congestion control and TLS on top of UDP to avoid TCP's head-of-line blocking and to get past middleboxes that freeze TCP's design.",

  // Application
  "/dhcp": "Enterprises use DHCP relays because the broadcast cannot cross routers, with reservations, lease times from minutes to days, and DHCP snooping to block rogue servers. Clients may probe the offered address to detect conflicts.",
  "/dns": "Almost every answer comes from a cache (driven by TTL). Resolvers pick among many authoritative servers, large answers switch from UDP to TCP, NXDOMAIN answers are cached too, and DNSSEC, DNS over TLS and DNS over HTTPS exist. CDNs answer differently by location.",
  "/http": "Browsers keep connections alive, cache with Cache-Control and ETag, and increasingly use HTTP/2 (multiplexed streams) or HTTP/3 (over QUIC). Cookies, redirects and compression sit on top.",
  "/https": "TLS 1.3 needs one round trip (zero on resumption). Certificates are checked for chain, name, expiry, revocation and transparency, ALPN picks HTTP/2 or HTTP/3, and the server name stays visible in the ClientHello unless Encrypted Client Hello is used.",
  "/load-balancing": "Production load balancers add health checks, connection draining, TLS termination and consistent hashing, sit behind anycast or DNS, and run in redundant pairs so they are not a single point of failure.",
  "/browser-journey": "Most of this journey is skipped on a warm browser: the DNS answer, the connection and often the page itself are cached, and a CDN edge near the user serves what is left.",

  // Algorithms
  "/error-detection": "Ethernet uses CRC-32, IP and TCP/UDP use simple 16-bit checksums, and TLS adds cryptographic MACs. Wi-Fi, 5G and optical links also use forward error correction, which repairs errors instead of only detecting them.",
  "/reliable-transmission": "Stop-and-wait wastes a long link. Real protocols pipeline with sliding windows (TCP combines cumulative and selective ACKs) and adaptive timeouts computed from measured round-trip times (RFC 6298).",
  "/mac-protocols": "Wired Ethernet no longer needs CSMA/CD. Wi-Fi uses CSMA/CA with optional RTS/CTS, cellular networks use scheduled access, and ALOHA survives in satellite and RFID systems.",

  // Enterprise
  "/vlan": "VLANs use 802.1Q tags and trunk links, with inter-VLAN routing on a router or layer-3 switch. Misconfigured native VLANs enable VLAN hopping, and data centres use VXLAN to scale past the 4094-VLAN limit.",
  "/stp": "Classic STP takes 30-50 seconds to converge; RSTP usually takes a second or two and is the default now. Large networks avoid loops with routed access, MLAG or EVPN-VXLAN, and edge ports use PortFast and BPDU guard.",
  "/routing-protocols": "Enterprises run OSPF or IS-IS inside their network, while the internet itself runs on BGP between over 70,000 autonomous systems, driven by policy rather than shortest path. RIP is mostly historical (15-hop limit, slow convergence).",
  "/ipv6": "IPv6 removes router fragmentation, uses Neighbor Discovery instead of ARP and SLAAC for addressing, and hosts are normally dual-stack, racing IPv6 against IPv4 ('Happy Eyeballs').",
  "/wireless": "Wi-Fi shares airtime, so speed drops with distance and neighbouring networks. WPA3 is replacing WPA2, roaming uses 802.11k/v/r, channels range from 20 to 320 MHz across 2.4, 5 and 6 GHz, and hidden nodes and interference make full rated speed rare.",
  "/websocket": "WebSockets start as an HTTP Upgrade and usually run over TLS (wss://). They need heartbeats because proxies and NATs drop idle connections, and they scale by spreading connections across servers behind a pub/sub backend.",
  "/email": "Real mail relies on SPF, DKIM and DMARC to prove who sent it, MX lookups, queues with retries, STARTTLS and spam filtering. Clients submit on port 587, which differs from the simple send shown here.",
  "/ssh": "Clients pin host keys (known_hosts) to detect impersonation, keys are preferred over passwords, and bastion hosts, short-lived certificates and agent forwarding are common. Rate limiting or fail2ban stops brute-force logins.",
  "/firewall-acl": "Modern firewalls are stateful (they track connections), inspect applications and use zones. ACLs are evaluated top-down with an implicit deny at the end, and cloud security groups apply the same idea per instance.",

  // Experiments
  "/capture": "Wireshark and tcpdump record exactly this: every frame on a link. Real analysis also reassembles TCP streams, follows many conversations at once and can decrypt TLS only with session keys exported by the browser (SSLKEYLOGFILE), since encrypted payloads stay opaque.",
  "/experiments/arp-timeout": "Timers differ widely: Linux treats an entry as reachable for about 30 seconds (randomised), while many routers keep ARP entries for 4 hours by default.",
  "/experiments/nat-scale": "Each NAT mapping uses memory and a port; one address has about 64,000 ports, so carrier-grade NAT assigns port blocks per subscriber and logs them. Connection-tracking tables have fixed limits.",
  "/experiments/routing-whatif": "Real convergence after a failure depends on detection time (BFD can detect in tens of milliseconds), protocol timers and how fast routes propagate. During it, traffic can black-hole or loop.",
  "/experiments/aloha-throughput": "The 18.4% (pure) and 36.8% (slotted) maxima are limits of an idealised shared channel. Real systems add carrier sensing, backoff and scheduling to do far better.",
  "/experiments/diagnostic": "Real troubleshooting follows the same order (link, IP and gateway, DNS, then the application) using ping, traceroute or mtr, dig, curl -v and packet captures in Wireshark or tcpdump.",
  "/experiments/link-model": "Real routers have per-port buffers and often use active queue management (CoDel, fq_codel) to fight bufferbloat. Loss and delay also come from wireless interference and changing paths, not only from full queues.",
};

export function realWorldNote(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const key = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return REAL_WORLD_NOTES[key];
}
