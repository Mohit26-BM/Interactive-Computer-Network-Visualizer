import { flowKey } from "./decode";
import { CapturedPacket, LIMITS, ParseResult, TcpInfo } from "./types";
import type { PacketHeaderLayer } from "../types";

// Reads Wireshark's "Export Packet Dissections > As JSON" (and `tshark -T json`) output.
// The JSON is untrusted: every field is type-checked and unknown shapes are skipped, not trusted.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** tshark repeats a field as an array when it occurs several times; take the first value. */
function str(v: unknown): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" ? x.slice(0, 200) : typeof x === "number" ? String(x) : undefined;
}
function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined || s === "") return undefined;
  const n = s.startsWith("0x") ? parseInt(s, 16) : Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const FLAG_BITS: [number, string][] = [[0x01, "FIN"], [0x02, "SYN"], [0x04, "RST"], [0x08, "PSH"], [0x10, "ACK"], [0x20, "URG"], [0x40, "ECE"], [0x80, "CWR"]];

function convert(el: unknown, index: number): { p: CapturedPacket; epoch: number } | null {
  if (!isObj(el) || !isObj(el._source) || !isObj(el._source.layers)) return null;
  const L = el._source.layers as Obj;
  const frame = isObj(L.frame) ? L.frame : {};
  const eth = isObj(L.eth) ? L.eth : undefined;
  const ip = isObj(L.ip) ? L.ip : undefined;
  const ip6 = isObj(L.ipv6) ? L.ipv6 : undefined;
  const tcp = isObj(L.tcp) ? L.tcp : undefined;
  const udp = isObj(L.udp) ? L.udp : undefined;
  const dnsL = isObj(L.dns) ? L.dns : undefined;
  const tlsL = isObj(L.tls) ? L.tls : undefined;
  const httpL = isObj(L.http) ? L.http : undefined;
  const icmp = isObj(L.icmp) ? L.icmp : undefined;
  const arp = isObj(L.arp) ? L.arp : undefined;

  const epoch = num(frame["frame.time_epoch"]) ?? 0;
  const layers: PacketHeaderLayer[] = [];
  const p: CapturedPacket = { no: num(frame["frame.number"]) ?? index + 1, time: 0, length: num(frame["frame.len"]) ?? 0, src: "?", dst: "?", proto: "Frame", info: "", layers, notes: [] };

  if (eth) {
    p.src = str(eth["eth.src"]) ?? "?"; p.dst = str(eth["eth.dst"]) ?? "?"; p.proto = "Ethernet";
    layers.push({ protocol: "Ethernet", fields: { dstMAC: p.dst, srcMAC: p.src, etherType: str(eth["eth.type"]) ?? "" } });
  }
  if (arp) {
    p.proto = "ARP";
    const op = num(arp["arp.opcode"]);
    const sIp = str(arp["arp.src.proto_ipv4"]) ?? "?", tIp = str(arp["arp.dst.proto_ipv4"]) ?? "?", sMac = str(arp["arp.src.hw_mac"]) ?? "?";
    p.arp = { op: op === 1 ? "request" : "reply", senderIp: sIp, senderMac: sMac, targetIp: tIp };
    p.src = sIp; p.dst = tIp;
    p.info = op === 1 ? `Who has ${tIp}? Tell ${sIp}` : `${sIp} is at ${sMac}`;
    layers.push({ protocol: "ARP", fields: { operation: op === 1 ? "request" : "reply", senderIP: sIp, targetIP: tIp } });
    return { p, epoch };
  }
  if (ip) {
    p.src = str(ip["ip.src"]) ?? "?"; p.dst = str(ip["ip.dst"]) ?? "?"; p.ttl = num(ip["ip.ttl"]); p.proto = "IPv4";
    layers.push({ protocol: "IPv4", fields: { srcIP: p.src, dstIP: p.dst, ttl: p.ttl ?? 0, protocol: num(ip["ip.proto"]) ?? 0 } });
  } else if (ip6) {
    p.src = str(ip6["ipv6.src"]) ?? "?"; p.dst = str(ip6["ipv6.dst"]) ?? "?"; p.ttl = num(ip6["ipv6.hlim"]); p.proto = "IPv6";
    layers.push({ protocol: "IPv6", fields: { srcIP: p.src, dstIP: p.dst, hopLimit: p.ttl ?? 0 } });
  }

  if (tcp) {
    const sp = num(tcp["tcp.srcport"]) ?? 0, dp = num(tcp["tcp.dstport"]) ?? 0;
    const fl = num(tcp["tcp.flags"]) ?? 0;
    const flags = FLAG_BITS.filter(([bit]) => (fl & bit) !== 0).map(([, n]) => n);
    const info: TcpInfo = {
      srcPort: sp, dstPort: dp, flags,
      seq: num(tcp["tcp.seq_raw"]) ?? num(tcp["tcp.seq"]) ?? 0,
      ack: num(tcp["tcp.ack_raw"]) ?? num(tcp["tcp.ack"]) ?? 0,
      window: num(tcp["tcp.window_size_value"]) ?? num(tcp["tcp.window_size"]) ?? 0,
      payloadLen: num(tcp["tcp.len"]) ?? 0,
      options: {},
    };
    const optText = JSON.stringify(tcp["tcp.options_tree"] ?? tcp["tcp.options"] ?? "");
    const mss = num(tcp["tcp.options.mss_val"]); if (mss !== undefined) info.options.mss = mss;
    const ws = num(tcp["tcp.options.wscale.shift"]); if (ws !== undefined) info.options.wscale = ws;
    if (/sack_perm/i.test(optText) || tcp["tcp.options.sack_perm"] !== undefined) info.options.sackPermitted = true;
    if (/timestamp/i.test(optText)) info.options.timestamps = true;
    p.tcp = info; p.srcPort = sp; p.dstPort = dp; p.proto = "TCP";
    p.flow = flowKey(p.src, sp, p.dst, dp, "tcp");
    layers.push({ protocol: "TCP", fields: { srcPort: sp, dstPort: dp, seq: info.seq, ack: flags.includes("ACK") ? info.ack : "-", flags: flags.join(","), window: info.window, payloadBytes: info.payloadLen } });
  } else if (udp) {
    const sp = num(udp["udp.srcport"]) ?? 0, dp = num(udp["udp.dstport"]) ?? 0;
    p.srcPort = sp; p.dstPort = dp; p.proto = "UDP";
    p.flow = flowKey(p.src, sp, p.dst, dp, "udp");
    layers.push({ protocol: "UDP", fields: { srcPort: sp, dstPort: dp, payloadBytes: num(udp["udp.length"]) ?? 0 } });
    p.info = `${sp} → ${dp}`;
  } else if (icmp) {
    const type = num(icmp["icmp.type"]) ?? 0;
    p.proto = "ICMP"; p.icmp = { type, code: num(icmp["icmp.code"]) ?? 0, name: `type ${type}` };
    p.info = `ICMP type ${type}`;
    layers.push({ protocol: "ICMP", fields: { type, code: p.icmp.code } });
  }

  if (dnsL) {
    const qn = str(dnsL["dns.qry.name"]);
    const resp = (num(dnsL["dns.flags.response"]) ?? 0) === 1;
    const answers: { name: string; type: string; ttl: number; data: string }[] = [];
    const a = str(dnsL["dns.a"]); if (a) answers.push({ name: qn ?? "", type: "A", ttl: 0, data: a });
    const aaaa = str(dnsL["dns.aaaa"]); if (aaaa) answers.push({ name: qn ?? "", type: "AAAA", ttl: 0, data: aaaa });
    p.dns = { id: num(dnsL["dns.id"]) ?? 0, response: resp, rcode: num(dnsL["dns.flags.rcode"]) ?? 0, questions: qn ? [{ name: qn, type: "A" }] : [], answers };
    p.proto = "DNS";
    p.info = `${resp ? "Response" : "Query"} ${qn ?? ""}${resp && answers.length ? ` → ${answers.map((x) => x.data).join(", ")}` : ""}`;
    layers.push({ protocol: "DNS", fields: { type: resp ? "response" : "query", question: qn ?? "" } });
  } else if (tlsL) {
    const hsType = num(tlsL["tls.handshake.type"]);
    const names: Record<number, string> = { 1: "ClientHello", 2: "ServerHello", 4: "NewSessionTicket", 8: "EncryptedExtensions", 11: "Certificate", 15: "CertificateVerify", 20: "Finished" };
    const recType = num(tlsL["tls.record.content_type"]);
    const rec = recType === 22 ? "Handshake" : recType === 23 ? "Application Data" : recType === 21 ? "Alert" : recType === 20 ? "Change Cipher Spec" : "TLS";
    const sni = str(tlsL["tls.handshake.extensions_server_name"]);
    p.tls = { recordTypes: [rec], handshake: hsType !== undefined ? names[hsType] ?? `type ${hsType}` : undefined, serverName: sni };
    p.proto = "TLS";
    p.info = `${p.tls.handshake ?? rec}${sni ? ` (SNI ${sni})` : ""}`;
    layers.push({ protocol: "TLS", fields: { records: rec, ...(p.tls.handshake ? { handshake: p.tls.handshake } : {}), ...(sni ? { serverName: sni } : {}) } });
  } else if (httpL) {
    const line = str(httpL["http.request.line"]) ?? str(httpL["http.response.line"]) ?? `${str(httpL["http.request.method"]) ?? "HTTP"} ${str(httpL["http.request.uri"]) ?? ""}`.trim();
    p.httpLine = line.replace(/[\r\n]+/g, " ").slice(0, 100); p.proto = "HTTP"; p.info = p.httpLine;
    layers.push({ protocol: "HTTP", fields: { firstLine: p.httpLine } });
  } else if (p.tcp) {
    p.info = `${p.srcPort} → ${p.dstPort} [${p.tcp.flags.join(", ")}]`;
  }
  return { p, epoch };
}

export function parseTsharkJson(text: string): ParseResult {
  if (text.length > LIMITS.maxBytes) return { ok: false, error: `This file is larger than ${LIMITS.maxBytes / 1048576} MB. Filter or trim the capture in Wireshark first.` };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file is not valid JSON. Use File > Export Packet Dissections > As JSON in Wireshark." }; }
  if (!Array.isArray(data)) return { ok: false, error: "Expected a JSON array of packets (Wireshark's JSON export)." };
  if (data.length === 0) return { ok: false, error: "The capture contains no packets." };

  const out: { p: CapturedPacket; epoch: number }[] = [];
  let skipped = 0;
  for (let i = 0; i < data.length; i++) {
    if (out.length >= LIMITS.maxPackets) break;
    const c = convert(data[i], i);
    if (c) out.push(c); else skipped++;
  }
  if (out.length === 0) return { ok: false, error: "No packets in this JSON have the layout Wireshark exports (_source.layers)." };
  const t0 = out[0].epoch;
  const packets = out.map(({ p, epoch }, i) => ({ ...p, no: i + 1, time: Math.max(0, epoch - t0) }));
  const warnings: string[] = [];
  if (skipped) warnings.push(`${skipped} entr${skipped === 1 ? "y" : "ies"} could not be read and ${skipped === 1 ? "was" : "were"} skipped.`);
  const truncated = data.length > LIMITS.maxPackets;
  if (truncated) warnings.push(`Only the first ${LIMITS.maxPackets} packets are shown.`);
  return { ok: true, capture: { format: "tshark-json", packets, skipped, truncated, warnings } };
}
