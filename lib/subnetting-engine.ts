// A pure calculator, not a Step[] playback process — subnetting math is
// instantaneous, there's no sequence of decisions worth scrubbing through.
// This is the one Phase 3 module that deliberately skips usePlayer.

export interface SubnetResult {
  ok: true;
  cidr: string;
  ip: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string | null;
  lastHost: string | null;
  totalAddresses: number;
  usableHosts: number;
}

export interface SubnetError {
  ok: false;
  error: string;
}

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const octet = parseInt(p, 10);
    if (octet < 0 || octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function calculateSubnet(input: string): SubnetResult | SubnetError {
  const trimmed = input.trim();
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { ok: false, error: "Enter a CIDR block like 192.168.1.0/24." };

  const ipPart = trimmed.slice(0, slash);
  const prefixPart = trimmed.slice(slash + 1);

  const ipNum = ipToInt(ipPart);
  if (ipNum === null) return { ok: false, error: `"${ipPart}" isn't a valid IPv4 address.` };

  if (!/^\d+$/.test(prefixPart)) return { ok: false, error: "The prefix after / must be a number." };
  const prefix = parseInt(prefixPart, 10);
  if (prefix < 0 || prefix > 32) return { ok: false, error: "Prefix must be between /0 and /32." };

  const maskNum = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const wildcardNum = (~maskNum) >>> 0;
  const networkNum = (ipNum & maskNum) >>> 0;
  const broadcastNum = (networkNum | wildcardNum) >>> 0;

  const totalAddresses = 2 ** (32 - prefix);
  let firstHost: string | null = null;
  let lastHost: string | null = null;
  let usableHosts = 0;

  if (prefix <= 30) {
    usableHosts = totalAddresses - 2;
    firstHost = intToIp(networkNum + 1);
    lastHost = intToIp(broadcastNum - 1);
  } else if (prefix === 31) {
    // RFC 3021 point-to-point link: both addresses usable, no network/broadcast reserved
    usableHosts = 2;
    firstHost = intToIp(networkNum);
    lastHost = intToIp(broadcastNum);
  } else {
    // /32 — a single host route
    usableHosts = 1;
    firstHost = intToIp(networkNum);
    lastHost = intToIp(networkNum);
  }

  return {
    ok: true,
    cidr: `${intToIp(ipNum)}/${prefix}`,
    ip: intToIp(ipNum),
    prefix,
    mask: intToIp(maskNum),
    wildcard: intToIp(wildcardNum),
    network: intToIp(networkNum),
    broadcast: intToIp(broadcastNum),
    firstHost,
    lastHost,
    totalAddresses,
    usableHosts,
  };
}

export const SUBNETTING_CODE: string[] = [
  "function subnet(ip, prefix) {",
  "  mask = 0xFFFFFFFF << (32 - prefix);",
  "  wildcard = ~mask;",
  "  network = ip & mask;",
  "  broadcast = network | wildcard;",
  "  usableHosts = 2^(32-prefix) - 2;   // reserve network + broadcast",
  "  firstHost = network + 1;",
  "  lastHost  = broadcast - 1;",
  "  return { mask, network, broadcast, firstHost, lastHost, usableHosts };",
  "}",
];

export const SUBNETTING_ANNOTATIONS: Record<number, string> = {
  1: "The mask is just prefix-many 1 bits followed by 0s — /24 means the first 24 bits are fixed, the last 8 identify hosts.",
  2: "The wildcard mask is the mask's bitwise complement — it marks exactly the bits that vary within this subnet.",
  3: "AND-ing the IP with the mask zeroes out every host bit — whatever's left is the network's own address, never assignable to a host.",
  4: "OR-ing the network with the wildcard sets every host bit to 1 — the highest address in the range, reserved for broadcast.",
  5: "Every address in a subnet is either the network id, the broadcast address, or a usable host — hence minus 2.",
};

export const SUBNETTING_COMPLEXITY = {
  time: "O(1)",
  space: "O(1)",
  note: "Every value here comes from a fixed number of 32-bit bitwise operations — the size of the subnet never changes the cost.",
};
