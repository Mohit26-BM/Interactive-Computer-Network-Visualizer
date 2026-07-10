// Reference data for /ipv6 — no engine, no Step[], same category as
// /osi and /network-devices: a map explained alongside the IPv4 the rest
// of this project already teaches, not a new simulation.

export interface IPv6Topic {
  name: string;
  short: string;
  detail: string;
  example: string;
  ipv4Contrast: string;
}

export const IPV6_TOPICS: IPv6Topic[] = [
  {
    name: "Address Format",
    short: "128 bits, written as eight groups of four hex digits",
    detail: "An IPv6 address is 128 bits — four times the width of IPv4's 32 — written as eight 16-bit groups separated by colons, each group shown in hexadecimal. That's the entire reason IPv6 exists: IPv4's ~4.3 billion addresses ran out; 128 bits provides more addresses than there are grains of sand on Earth.",
    example: "2001:0db8:0000:0000:0000:ff00:0042:8329",
    ipv4Contrast: "IPv4: 32 bits, four decimal octets (e.g. 192.168.1.10) — about 4.3 billion addresses total.",
  },
  {
    name: "Prefix",
    short: "The network portion, written as a /length exactly like CIDR",
    detail: "IPv6 keeps CIDR notation — a slash and a bit count marks where the network ID ends and the host portion begins. A /64 is the overwhelmingly common allocation for a single subnet: 64 bits of network, 64 bits left for the interface identifier, which is normally derived from the device's own MAC address.",
    example: "2001:0db8:0000:0000::/64",
    ipv4Contrast: "IPv4 subnetting (see the Subnetting page) reasons about the same network/host split — just with 32 bits total instead of 128.",
  },
  {
    name: "Compression",
    short: "Leading zeros drop; one run of all-zero groups collapses to ::",
    detail: "Two shorthand rules make 128-bit addresses typeable: leading zeros in each group can be dropped (0db8 → db8), and exactly one contiguous run of all-zero groups can be replaced with a bare ::. A second :: in the same address would make the zero count ambiguous, so the rule caps it at one use.",
    example: "2001:0db8:0000:0000:0000:ff00:0042:8329  →  2001:db8::ff00:42:8329",
    ipv4Contrast: "IPv4 has no equivalent — every octet is always written out, since there's no ambiguity to compress away in a 4-group address.",
  },
  {
    name: "Neighbor Discovery",
    short: "Replaces ARP — and adds router discovery on top",
    detail: "IPv6 has no ARP. Neighbor Discovery Protocol (NDP) uses ICMPv6 messages instead: Neighbor Solicitation/Advertisement resolve an IP to a MAC (ARP's exact job), while Router Solicitation/Advertisement let a host discover its default router and even auto-configure its own address (SLAAC) without DHCP.",
    example: "Neighbor Solicitation → Neighbor Advertisement  (compare to ARP's Request → Reply)",
    ipv4Contrast: "IPv4 splits this across two separate mechanisms: ARP (see the ARP page) for address resolution, DHCP for configuration. IPv6 folds both into one ICMPv6-based protocol.",
  },
  {
    name: "IPv4 vs IPv6",
    short: "Same job — route packets between networks — different address space and header",
    detail: "IPv6 isn't IPv4 with extra digits: the header is simplified (no checksum, no built-in fragmentation — routers just drop oversized packets), fragmentation becomes the sending host's job as a result, and NAT stops being a scarcity workaround since every device can get its own public address again.",
    example: "IPv4 header: 13 fields, variable length, includes a checksum. IPv6 header: 8 fields, fixed 40 bytes, no checksum.",
    ipv4Contrast: "This project's IPv4, Fragmentation, and NAT pages show exactly the mechanisms IPv6 either removes or no longer needs.",
  },
];
