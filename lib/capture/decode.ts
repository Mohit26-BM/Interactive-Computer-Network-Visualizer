import type { PacketHeaderLayer } from "../types";
import type { CapturedPacket, DnsInfo, TcpOptions, TlsInfo } from "./types";

// Decodes one captured frame into the layers this site already knows how to draw.
// Every read is bounds-checked: a capture is untrusted input and may be truncated or malformed.

const hex = (n: number, w = 2) => n.toString(16).padStart(w, "0");

export const LINKTYPE = { ETHERNET: 1, RAW: 101, LINUX_SLL: 113 } as const;

class Reader {
  constructor(public d: Uint8Array) {}
  has(o: number, n: number) { return o >= 0 && n >= 0 && o + n <= this.d.length; }
  u8(o: number) { return this.has(o, 1) ? this.d[o] : null; }
  u16(o: number) { return this.has(o, 2) ? (this.d[o] << 8) | this.d[o + 1] : null; }
  u32(o: number) { return this.has(o, 4) ? ((this.d[o] * 2 ** 24) + (this.d[o + 1] << 16) + (this.d[o + 2] << 8) + this.d[o + 3]) : null; }
}

export const mac = (d: Uint8Array, o: number) => Array.from(d.slice(o, o + 6)).map((b) => hex(b)).join(":");
export const ip4 = (d: Uint8Array, o: number) => `${d[o]}.${d[o + 1]}.${d[o + 2]}.${d[o + 3]}`;

export function ip6(d: Uint8Array, o: number): string {
  const g: number[] = [];
  for (let i = 0; i < 8; i++) g.push((d[o + 2 * i] << 8) | d[o + 2 * i + 1]);
  // collapse the longest run of zero groups
  let bestStart = -1, bestLen = 0;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  if (bestLen < 2) return g.map((x) => x.toString(16)).join(":");
  const left = g.slice(0, bestStart).map((x) => x.toString(16)).join(":");
  const right = g.slice(bestStart + bestLen).map((x) => x.toString(16)).join(":");
  return `${left}::${right}`;
}

/** Printable ASCII only, capped: captured text is shown, never interpreted. */
export function printable(bytes: Uint8Array, max = 120): string {
  let out = "";
  for (let i = 0; i < bytes.length && out.length < max; i++) {
    const b = bytes[i];
    out += b >= 32 && b < 127 ? String.fromCharCode(b) : b === 10 || b === 13 ? " " : ".";
  }
  return out;
}

export function ipv4ChecksumOk(d: Uint8Array, off: number, ihl: number): boolean {
  let sum = 0;
  for (let i = 0; i < ihl; i += 2) sum += (d[off + i] << 8) | d[off + i + 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return sum === 0xffff;
}

const ICMP_TYPES: Record<number, string> = {
  0: "Echo Reply", 3: "Destination Unreachable", 4: "Source Quench", 5: "Redirect", 8: "Echo Request",
  11: "Time Exceeded", 12: "Parameter Problem", 13: "Timestamp Request", 14: "Timestamp Reply",
};
const ICMP6_TYPES: Record<number, string> = {
  1: "Destination Unreachable", 2: "Packet Too Big", 3: "Time Exceeded", 128: "Echo Request", 129: "Echo Reply",
  133: "Router Solicitation", 134: "Router Advertisement", 135: "Neighbor Solicitation", 136: "Neighbor Advertisement",
};

// ── TCP ───────────────────────────────────────────────────────────────────────

const FLAG_BITS: [number, string][] = [[0x01, "FIN"], [0x02, "SYN"], [0x04, "RST"], [0x08, "PSH"], [0x10, "ACK"], [0x20, "URG"], [0x40, "ECE"], [0x80, "CWR"]];

function tcpOptions(r: Reader, start: number, end: number): TcpOptions {
  const o: TcpOptions = {};
  let i = start;
  while (i < end) {
    const kind = r.u8(i);
    if (kind === null || kind === 0) break;          // end of option list
    if (kind === 1) { i++; continue; }               // NOP padding
    const len = r.u8(i + 1);
    if (len === null || len < 2 || i + len > end) break;
    if (kind === 2 && len === 4) o.mss = r.u16(i + 2) ?? undefined;
    else if (kind === 3 && len === 3) o.wscale = r.u8(i + 2) ?? undefined;
    else if (kind === 4) o.sackPermitted = true;
    else if (kind === 5) o.sackBlocks = Math.floor((len - 2) / 8);
    else if (kind === 8) o.timestamps = true;
    i += len;
  }
  return o;
}

// ── DNS ───────────────────────────────────────────────────────────────────────

const DNS_TYPES: Record<number, string> = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 65: "HTTPS" };

function dnsName(d: Uint8Array, start: number): { name: string; next: number } | null {
  const labels: string[] = [];
  let o = start;
  let next = -1;
  let jumps = 0;
  for (let guard = 0; guard < 128; guard++) {
    if (o >= d.length) return null;
    const len = d[o];
    if (len === 0) { return { name: labels.join(".") || ".", next: next === -1 ? o + 1 : next }; }
    if ((len & 0xc0) === 0xc0) {                       // compression pointer
      if (o + 1 >= d.length) return null;
      if (next === -1) next = o + 2;
      const ptr = ((len & 0x3f) << 8) | d[o + 1];
      if (++jumps > 10 || ptr >= d.length) return null;
      o = ptr;
      continue;
    }
    if (len > 63 || o + 1 + len > d.length) return null;
    labels.push(printable(d.slice(o + 1, o + 1 + len), 63));
    if (labels.join(".").length > 253) return null;
    o += 1 + len;
  }
  return null;
}

export function decodeDns(d: Uint8Array): DnsInfo | null {
  const r = new Reader(d);
  if (d.length < 12) return null;
  const id = r.u16(0)!, flags = r.u16(2)!;
  const qd = r.u16(4)!, an = r.u16(6)!;
  if (qd > 16 || an > 64) return null;
  const info: DnsInfo = { id, response: (flags & 0x8000) !== 0, rcode: flags & 0xf, questions: [], answers: [] };
  let o = 12;
  for (let i = 0; i < qd; i++) {
    const n = dnsName(d, o);
    if (!n || !r.has(n.next, 4)) return info.questions.length ? info : null;
    info.questions.push({ name: n.name, type: DNS_TYPES[r.u16(n.next)!] ?? `type${r.u16(n.next)}` });
    o = n.next + 4;
  }
  for (let i = 0; i < an; i++) {
    const n = dnsName(d, o);
    if (!n || !r.has(n.next, 10)) break;
    const type = r.u16(n.next)!, ttl = r.u32(n.next + 4)!, rdlen = r.u16(n.next + 8)!;
    const rd = n.next + 10;
    if (!r.has(rd, rdlen)) break;
    let data = "";
    if (type === 1 && rdlen === 4) data = ip4(d, rd);
    else if (type === 28 && rdlen === 16) data = ip6(d, rd);
    else if (type === 5 || type === 2 || type === 12) data = dnsName(d, rd)?.name ?? "?";
    else data = `${rdlen} bytes`;
    info.answers.push({ name: n.name, type: DNS_TYPES[type] ?? `type${type}`, ttl, data });
    o = rd + rdlen;
  }
  return info;
}

// ── TLS ───────────────────────────────────────────────────────────────────────

const TLS_RECORD: Record<number, string> = { 20: "Change Cipher Spec", 21: "Alert", 22: "Handshake", 23: "Application Data" };
const TLS_HS: Record<number, string> = { 1: "ClientHello", 2: "ServerHello", 4: "NewSessionTicket", 8: "EncryptedExtensions", 11: "Certificate", 12: "ServerKeyExchange", 13: "CertificateRequest", 14: "ServerHelloDone", 15: "CertificateVerify", 16: "ClientKeyExchange", 20: "Finished" };
const TLS_VERSION: Record<number, string> = { 0x0300: "SSL 3.0", 0x0301: "TLS 1.0", 0x0302: "TLS 1.1", 0x0303: "TLS 1.2", 0x0304: "TLS 1.3" };
const CIPHERS: Record<number, string> = {
  0x1301: "TLS_AES_128_GCM_SHA256", 0x1302: "TLS_AES_256_GCM_SHA384", 0x1303: "TLS_CHACHA20_POLY1305_SHA256",
  0xc02b: "ECDHE_ECDSA_AES128_GCM_SHA256", 0xc02c: "ECDHE_ECDSA_AES256_GCM_SHA384", 0xc02f: "ECDHE_RSA_AES128_GCM_SHA256",
  0xc030: "ECDHE_RSA_AES256_GCM_SHA384", 0xcca8: "ECDHE_RSA_CHACHA20_POLY1305", 0xcca9: "ECDHE_ECDSA_CHACHA20_POLY1305",
};

export function decodeTls(d: Uint8Array): TlsInfo | null {
  const r = new Reader(d);
  if (d.length < 5 || !(d[0] >= 20 && d[0] <= 23) || d[1] !== 3 || d[2] > 4) return null;
  const info: TlsInfo = { recordTypes: [], recordVersion: TLS_VERSION[(d[1] << 8) | d[2]] };
  // a segment can hold several records
  let o = 0;
  for (let n = 0; n < 8 && r.has(o, 5); n++) {
    const type = d[o];
    if (!(type >= 20 && type <= 23) || d[o + 1] !== 3) break;
    const len = r.u16(o + 3)!;
    info.recordTypes.push(TLS_RECORD[type]);
    if (type === 22 && n === 0) parseHandshake(d, o + 5, Math.min(d.length, o + 5 + len), info);
    o += 5 + len;
  }
  return info;
}

function parseHandshake(d: Uint8Array, start: number, end: number, info: TlsInfo) {
  const r = new Reader(d);
  const type = r.u8(start);
  if (type === null) return;
  info.handshake = TLS_HS[type] ?? `type ${type}`;
  if (type !== 1 && type !== 2) return;
  let o = start + 4 + 2 + 32;                    // handshake header, legacy_version, random
  const sidLen = r.u8(o); if (sidLen === null) return;
  o += 1 + sidLen;
  if (type === 1) {
    const csLen = r.u16(o); if (csLen === null) return;
    o += 2 + csLen;
    const compLen = r.u8(o); if (compLen === null) return;
    o += 1 + compLen;
  } else {
    const cs = r.u16(o); if (cs === null) return;
    info.cipherSuite = CIPHERS[cs] ?? `0x${hex(cs, 4)}`;
    o += 2 + 1;                                   // cipher suite + compression method
  }
  const extLen = r.u16(o); if (extLen === null) return;
  o += 2;
  const extEnd = Math.min(end, o + extLen);
  while (o + 4 <= extEnd) {
    const et = r.u16(o)!, el = r.u16(o + 2)!;
    const b = o + 4;
    if (b + el > extEnd) break;
    if (et === 0 && type === 1) {                 // server_name
      const nameLen = r.u16(b + 3);
      if (nameLen !== null && r.has(b + 5, nameLen)) info.serverName = printable(d.slice(b + 5, b + 5 + nameLen), 100);
    } else if (et === 43) {                       // supported_versions
      if (type === 1) {
        const l = r.u8(b) ?? 0; const vs: string[] = [];
        for (let i = 0; i + 1 < l && b + 1 + i + 1 < extEnd; i += 2) { const v = r.u16(b + 1 + i)!; if ((v & 0x0f0f) !== 0x0a0a) vs.push(TLS_VERSION[v] ?? `0x${hex(v, 4)}`); }
        info.offeredVersions = vs;
      } else { const v = r.u16(b); if (v !== null) info.selectedVersion = TLS_VERSION[v] ?? `0x${hex(v, 4)}`; }
    } else if (et === 16 && type === 1) {         // ALPN
      const list: string[] = []; let p = b + 2;
      while (p < b + el && list.length < 8) { const l = r.u8(p)!; if (!r.has(p + 1, l)) break; list.push(printable(d.slice(p + 1, p + 1 + l), 20)); p += 1 + l; }
      info.alpn = list;
    }
    o = b + el;
  }
}

// ── Whole frame ──────────────────────────────────────────────────────────────

const HTTP_START = /^(GET |POST |PUT |HEAD |DELETE |OPTIONS |PATCH |HTTP\/1\.[01] )/;

export function decodeFrame(data: Uint8Array, linkType: number, no: number, time: number, wireLength: number): CapturedPacket | null {
  const r = new Reader(data);
  const layers: PacketHeaderLayer[] = [];
  const pkt: CapturedPacket = { no, time, length: wireLength || data.length, src: "?", dst: "?", proto: "Frame", info: "", layers, notes: [] };

  let off = 0;
  let etherType: number | null = null;

  if (linkType === LINKTYPE.ETHERNET) {
    if (data.length < 14) return null;
    const dstMac = mac(data, 0), srcMac = mac(data, 6);
    etherType = r.u16(12)!;
    off = 14;
    const fields: Record<string, string | number> = { dstMAC: dstMac, srcMAC: srcMac, etherType: `0x${hex(etherType, 4)}` };
    if (etherType === 0x8100 && r.has(14, 4)) {   // 802.1Q VLAN tag
      fields.vlan = (r.u16(14)! & 0x0fff);
      etherType = r.u16(16)!;
      off = 18;
      fields.etherType = `0x${hex(etherType, 4)} (inside VLAN tag)`;
    }
    layers.push({ protocol: "Ethernet", fields });
    pkt.src = srcMac; pkt.dst = dstMac; pkt.proto = "Ethernet";
  } else if (linkType === LINKTYPE.LINUX_SLL) {
    if (data.length < 16) return null;
    etherType = r.u16(14)!;
    off = 16;
    pkt.proto = "Frame";
  } else if (linkType === LINKTYPE.RAW) {
    const v = data[0] >> 4;
    etherType = v === 4 ? 0x0800 : v === 6 ? 0x86dd : null;
  } else {
    return null;
  }

  if (etherType === 0x0806) return decodeArp(data, off, r, pkt);
  if (etherType !== 0x0800 && etherType !== 0x86dd) {
    pkt.info = etherType === null ? "Unknown payload" : `EtherType 0x${hex(etherType, 4)}`;
    return pkt;
  }

  // ── network layer ──
  let proto: number;
  let payloadOff: number;
  let payloadEnd = data.length;
  if (etherType === 0x0800) {
    const vihl = r.u8(off);
    if (vihl === null || vihl >> 4 !== 4) return pkt;
    const ihl = (vihl & 0xf) * 4;
    if (ihl < 20 || !r.has(off, ihl)) return pkt;
    const total = r.u16(off + 2)!;
    const ttl = data[off + 8];
    proto = data[off + 9];
    const flagsFrag = r.u16(off + 6)!;
    const fragOffset = flagsFrag & 0x1fff, mf = (flagsFrag & 0x2000) !== 0, df = (flagsFrag & 0x4000) !== 0;
    pkt.src = ip4(data, off + 12); pkt.dst = ip4(data, off + 16); pkt.ttl = ttl; pkt.proto = "IPv4";
    pkt.badChecksum = !ipv4ChecksumOk(data, off, ihl);
    layers.push({ protocol: "IPv4", fields: { srcIP: pkt.src, dstIP: pkt.dst, ttl, protocol: proto, id: r.u16(off + 4)!, flags: `${df ? "DF " : ""}${mf ? "MF" : ""}`.trim() || "none", fragmentOffset: fragOffset * 8, totalLength: total, headerChecksum: pkt.badChecksum ? "invalid (often NIC offload)" : "ok" } });
    payloadOff = off + ihl;
    if (total >= ihl && off + total <= data.length) payloadEnd = off + total;
    if (fragOffset > 0 || mf) {
      pkt.fragment = true;
      pkt.info = `Fragmented IPv4 packet (offset ${fragOffset * 8}${mf ? ", more fragments" : ", last fragment"}), protocol ${proto}`;
      return pkt;
    }
  } else {
    if (!r.has(off, 40) || data[off] >> 4 !== 6) return pkt;
    proto = data[off + 6];
    pkt.src = ip6(data, off + 8); pkt.dst = ip6(data, off + 24); pkt.ttl = data[off + 7]; pkt.proto = "IPv6";
    layers.push({ protocol: "IPv6", fields: { srcIP: pkt.src, dstIP: pkt.dst, hopLimit: data[off + 7], nextHeader: proto, payloadLength: r.u16(off + 4)! } });
    payloadOff = off + 40;
    const plen = r.u16(off + 4)!;
    if (plen > 0 && payloadOff + plen <= data.length) payloadEnd = payloadOff + plen;
  }

  const payload = data.subarray(payloadOff, Math.max(payloadOff, payloadEnd));
  const pr = new Reader(payload);

  // ── transport ──
  if (proto === 6) {
    if (payload.length < 20) { pkt.proto = "TCP"; pkt.info = "TCP (truncated)"; return pkt; }
    const sp = pr.u16(0)!, dp = pr.u16(2)!;
    const hdr = (payload[12] >> 4) * 4;
    if (hdr < 20 || hdr > payload.length) { pkt.proto = "TCP"; pkt.info = "TCP (bad header length)"; return pkt; }
    const flagByte = payload[13];
    const flags = FLAG_BITS.filter(([bit]) => (flagByte & bit) !== 0).map(([, n]) => n);
    const body = payload.subarray(hdr);
    const options = tcpOptions(pr, 20, hdr);
    pkt.srcPort = sp; pkt.dstPort = dp; pkt.proto = "TCP";
    pkt.tcp = { srcPort: sp, dstPort: dp, seq: pr.u32(4)!, ack: pr.u32(8)!, flags, window: pr.u16(14)!, payloadLen: body.length, options };
    const fields: Record<string, string | number> = { srcPort: sp, dstPort: dp, seq: pkt.tcp.seq, ack: flags.includes("ACK") ? pkt.tcp.ack : "-", flags: flags.join(","), window: pkt.tcp.window, payloadBytes: body.length };
    const opt: string[] = [];
    if (options.mss !== undefined) opt.push(`MSS ${options.mss}`);
    if (options.sackPermitted) opt.push("SACK-permitted");
    if (options.timestamps) opt.push("Timestamps");
    if (options.wscale !== undefined) opt.push(`WScale ${options.wscale}`);
    if (options.sackBlocks) opt.push(`SACK blocks ${options.sackBlocks}`);
    if (opt.length) fields.options = opt.join(", ");
    layers.push({ protocol: "TCP", fields });
    pkt.flow = flowKey(pkt.src, sp, pkt.dst, dp, "tcp");
    appLayer(pkt, body, true);
    return pkt;
  }
  if (proto === 17) {
    if (payload.length < 8) { pkt.proto = "UDP"; pkt.info = "UDP (truncated)"; return pkt; }
    const sp = pr.u16(0)!, dp = pr.u16(2)!;
    const body = payload.subarray(8);
    pkt.srcPort = sp; pkt.dstPort = dp; pkt.proto = "UDP";
    layers.push({ protocol: "UDP", fields: { srcPort: sp, dstPort: dp, length: pr.u16(4)!, payloadBytes: body.length } });
    pkt.flow = flowKey(pkt.src, sp, pkt.dst, dp, "udp");
    pkt.info = `${sp} → ${dp} Len=${body.length}`;
    appLayer(pkt, body, false);
    return pkt;
  }
  if ((proto === 1 && etherType === 0x0800) || (proto === 58 && etherType === 0x86dd)) {
    const type = payload[0], code = payload[1] ?? 0;
    if (type === undefined) { pkt.proto = "ICMP"; return pkt; }
    const name = (proto === 1 ? ICMP_TYPES : ICMP6_TYPES)[type] ?? `type ${type}`;
    pkt.icmp = { type, code, name };
    pkt.proto = proto === 1 ? "ICMP" : "ICMPv6";
    layers.push({ protocol: "ICMP", fields: { type: `${name} (${type})`, code } });
    pkt.info = name + (type === 8 || type === 0 ? ` id=${pr.u16(4) ?? 0} seq=${pr.u16(6) ?? 0}` : "");
    return pkt;
  }
  pkt.info = `IP protocol ${proto}`;
  return pkt;
}

function decodeArp(data: Uint8Array, off: number, r: Reader, pkt: CapturedPacket): CapturedPacket {
  pkt.proto = "ARP";
  if (!r.has(off, 28) || r.u16(off + 2) !== 0x0800 || data[off + 4] !== 6 || data[off + 5] !== 4) { pkt.info = "ARP (unsupported format)"; return pkt; }
  const op = r.u16(off + 6)!;
  const senderMac = mac(data, off + 8), senderIp = ip4(data, off + 14), targetIp = ip4(data, off + 24);
  pkt.arp = { op: op === 1 ? "request" : "reply", senderIp, senderMac, targetIp };
  pkt.src = senderIp; pkt.dst = targetIp;
  pkt.layers.push({ protocol: "ARP", fields: { operation: op === 1 ? "request" : op === 2 ? "reply" : String(op), senderMAC: senderMac, senderIP: senderIp, targetMAC: mac(data, off + 18), targetIP: targetIp } });
  pkt.info = op === 1 ? `Who has ${targetIp}? Tell ${senderIp}` : `${senderIp} is at ${senderMac}`;
  return pkt;
}

export function flowKey(aIp: string, aPort: number, bIp: string, bPort: number, kind: string): string {
  const a = `${aIp}:${aPort}`, b = `${bIp}:${bPort}`;
  return `${kind}|${a < b ? a : b}|${a < b ? b : a}`;
}

function appLayer(pkt: CapturedPacket, body: Uint8Array, tcp: boolean) {
  const ports = [pkt.srcPort, pkt.dstPort];
  if (ports.includes(53) || ports.includes(5353)) {
    const msg = tcp ? (body.length > 2 ? body.subarray(2) : new Uint8Array(0)) : body;
    const dns = decodeDns(msg);
    if (dns) {
      pkt.dns = dns; pkt.proto = "DNS";
      pkt.layers.push({ protocol: "DNS", fields: { id: dns.id, type: dns.response ? "response" : "query", rcode: dns.rcode, question: dns.questions.map((q) => `${q.name} ${q.type}`).join("; "), ...(dns.answers.length ? { answers: dns.answers.map((a) => `${a.type} ${a.data}`).join("; ") } : {}) } });
      pkt.info = `${dns.response ? "Response" : "Query"} 0x${hex(dns.id, 4)} ${dns.questions.map((q) => `${q.type} ${q.name}`).join(", ")}${dns.response ? ` → ${dns.answers.length ? dns.answers.map((a) => a.data).join(", ") : dns.rcode === 3 ? "NXDOMAIN" : `no answer (rcode ${dns.rcode})`}` : ""}`;
      return;
    }
  }
  if (tcp && body.length) {
    const tls = decodeTls(body);
    if (tls) {
      pkt.tls = tls; pkt.proto = "TLS";
      const f: Record<string, string | number> = { records: tls.recordTypes.join(", ") };
      if (tls.recordVersion) f.recordVersion = tls.recordVersion;
      if (tls.handshake) f.handshake = tls.handshake;
      if (tls.serverName) f.serverName = tls.serverName;
      if (tls.offeredVersions?.length) f.offeredVersions = tls.offeredVersions.join(", ");
      if (tls.selectedVersion) f.selectedVersion = tls.selectedVersion;
      if (tls.cipherSuite) f.cipherSuite = tls.cipherSuite;
      if (tls.alpn?.length) f.alpn = tls.alpn.join(", ");
      pkt.layers.push({ protocol: "TLS", fields: f });
      pkt.info = `${tls.handshake ?? tls.recordTypes[0]}${tls.serverName ? ` (SNI ${tls.serverName})` : ""}`;
      return;
    }
    const head = printable(body.subarray(0, 12), 12);
    if (HTTP_START.test(head)) {
      const line = printable(body.subarray(0, 160), 100).split("  ")[0];
      pkt.httpLine = line; pkt.proto = "HTTP";
      pkt.layers.push({ protocol: "HTTP", fields: { firstLine: line } });
      pkt.info = line;
    }
  }
}
