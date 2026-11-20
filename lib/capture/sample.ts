// Builds real packet bytes (Ethernet, ARP, IPv4, TCP, UDP, DNS, TLS) and writes them as a classic
// pcap file. Used for the built-in sample capture and by the checks, so the decoder is tested on
// genuine wire formats rather than on its own output shape.

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const macBytes = (m: string) => m.split(":").map((h) => parseInt(h, 16));
const ipBytes = (ip: string) => ip.split(".").map(Number);

function checksum(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) | (bytes[i + 1] ?? 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

export function ethernet(dst: string, src: string, etherType: number, payload: number[]): number[] {
  return [...macBytes(dst), ...macBytes(src), ...be16(etherType), ...payload];
}

export function ipv4(src: string, dst: string, proto: number, payload: number[], opts: { id?: number; ttl?: number; df?: boolean; mf?: boolean; fragOffset?: number } = {}): number[] {
  const flagsFrag = (opts.df ? 0x4000 : 0) | (opts.mf ? 0x2000 : 0) | ((opts.fragOffset ?? 0) >> 3 & 0x1fff);
  const head = [0x45, 0, ...be16(20 + payload.length), ...be16(opts.id ?? 0), ...be16(flagsFrag), opts.ttl ?? 64, proto, 0, 0, ...ipBytes(src), ...ipBytes(dst)];
  const c = checksum(head);
  head[10] = c >> 8; head[11] = c & 0xff;
  return [...head, ...payload];
}

function pseudo(src: string, dst: string, proto: number, len: number): number[] {
  return [...ipBytes(src), ...ipBytes(dst), 0, proto, ...be16(len)];
}

export interface TcpSpec {
  src: string; dst: string; sport: number; dport: number;
  seq: number; ack?: number; flags: string[]; window?: number;
  options?: { mss?: number; wscale?: number; sack?: boolean; timestamps?: boolean };
  payload?: number[];
}
const FLAGS: Record<string, number> = { FIN: 1, SYN: 2, RST: 4, PSH: 8, ACK: 16, URG: 32 };

export function tcp(s: TcpSpec): number[] {
  const opt: number[] = [];
  const o = s.options ?? {};
  if (o.mss !== undefined) opt.push(2, 4, ...be16(o.mss));
  if (o.sack) opt.push(1, 1, 4, 2);
  if (o.timestamps) opt.push(1, 1, 8, 10, 0, 0, 0, 1, 0, 0, 0, 0);
  if (o.wscale !== undefined) opt.push(1, 3, 3, o.wscale);
  while (opt.length % 4) opt.push(0);
  const hdrLen = 20 + opt.length;
  const payload = s.payload ?? [];
  const head = [...be16(s.sport), ...be16(s.dport), ...be32(s.seq), ...be32(s.ack ?? 0), (hdrLen / 4) << 4, s.flags.reduce((a, f) => a | FLAGS[f], 0), ...be16(s.window ?? 65535), 0, 0, 0, 0, ...opt];
  const seg = [...head, ...payload];
  const c = checksum([...pseudo(s.src, s.dst, 6, seg.length), ...seg]);
  seg[16] = c >> 8; seg[17] = c & 0xff;
  return seg;
}

export function udp(src: string, dst: string, sport: number, dport: number, payload: number[]): number[] {
  const len = 8 + payload.length;
  const seg = [...be16(sport), ...be16(dport), ...be16(len), 0, 0, ...payload];
  const c = checksum([...pseudo(src, dst, 17, len), ...seg]) || 0xffff;
  seg[6] = c >> 8; seg[7] = c & 0xff;
  return seg;
}

function dnsNameBytes(name: string): number[] {
  const out: number[] = [];
  for (const label of name.split(".")) out.push(label.length, ...Array.from(label).map((c) => c.charCodeAt(0)));
  return [...out, 0];
}

export function dnsQuery(id: number, name: string, type = 1): number[] {
  return [...be16(id), ...be16(0x0100), ...be16(1), ...be16(0), ...be16(0), ...be16(0), ...dnsNameBytes(name), ...be16(type), ...be16(1)];
}

export function dnsAnswerA(id: number, name: string, ip: string, ttl: number): number[] {
  return [...be16(id), ...be16(0x8180), ...be16(1), ...be16(1), ...be16(0), ...be16(0), ...dnsNameBytes(name), ...be16(1), ...be16(1),
    0xc0, 0x0c, ...be16(1), ...be16(1), ...be32(ttl), ...be16(4), ...ipBytes(ip)];
}

export function arpPacket(op: 1 | 2, senderMac: string, senderIp: string, targetMac: string, targetIp: string): number[] {
  return [...be16(1), ...be16(0x0800), 6, 4, ...be16(op), ...macBytes(senderMac), ...ipBytes(senderIp), ...macBytes(targetMac), ...ipBytes(targetIp)];
}

const rec = (type: number, version: number, body: number[]) => [type, ...be16(version), ...be16(body.length), ...body];
const ext = (type: number, data: number[]) => [...be16(type), ...be16(data.length), ...data];

export function tlsClientHello(sni: string, alpn: string[] = ["h2", "http/1.1"]): number[] {
  const name = Array.from(sni).map((c) => c.charCodeAt(0));
  const sniExt = ext(0, [...be16(name.length + 3), 0, ...be16(name.length), ...name]);
  const versions = ext(43, [4, 0x03, 0x04, 0x03, 0x03]);
  const alpnList = alpn.flatMap((p) => [p.length, ...Array.from(p).map((c) => c.charCodeAt(0))]);
  const alpnExt = ext(16, [...be16(alpnList.length), ...alpnList]);
  const extensions = [...sniExt, ...versions, ...alpnExt];
  const suites = [0x13, 0x01, 0x13, 0x02, 0xc0, 0x2f];
  const body = [0x03, 0x03, ...new Array(32).fill(0x11), 0, ...be16(suites.length), ...suites, 1, 0, ...be16(extensions.length), ...extensions];
  const hs = [1, 0, ...be16(body.length), ...body];
  return rec(22, 0x0301, hs);
}

export function tlsServerHello(): number[] {
  const extensions = [...ext(43, [0x03, 0x04]), ...ext(51, [0x00, 0x1d, 0x00, 0x20, ...new Array(32).fill(0x22)])];
  const body = [0x03, 0x03, ...new Array(32).fill(0x33), 0, 0x13, 0x01, 0, ...be16(extensions.length), ...extensions];
  return rec(22, 0x0303, [2, 0, ...be16(body.length), ...body]);
}

export const tlsAppData = (n: number): number[] => rec(23, 0x0303, new Array(Math.max(0, n)).fill(0x5a));

export interface Frame { t: number; bytes: number[] }

/** Wrap frames in a classic little-endian microsecond pcap file (link type Ethernet). */
export function writePcap(frames: Frame[], t0 = 1_700_000_000): Uint8Array {
  const out: number[] = [];
  const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  out.push(...le32(0xa1b2c3d4), 2, 0, 4, 0, ...le32(0), ...le32(0), ...le32(65535), ...le32(1));
  for (const f of frames) {
    const sec = Math.floor(f.t), usec = Math.round((f.t - sec) * 1e6);
    out.push(...le32(t0 + sec), ...le32(usec), ...le32(f.bytes.length), ...le32(f.bytes.length), ...f.bytes);
  }
  return Uint8Array.from(out);
}

// ── The built-in sample: opening https://example.com from a laptop ──────────

export const SAMPLE = {
  client: "192.168.1.10", gateway: "192.168.1.1", server: "93.184.216.34",
  clientMac: "02:00:00:00:00:10", gatewayMac: "02:00:00:00:00:01",
  name: "example.com",
} as const;

export function buildSampleCapture(): Uint8Array {
  const { client, gateway, server, clientMac, gatewayMac, name } = SAMPLE;
  const frames: Frame[] = [];
  const toGw = (t: number, ipPacket: number[]) => frames.push({ t, bytes: ethernet(gatewayMac, clientMac, 0x0800, ipPacket) });
  const fromGw = (t: number, ipPacket: number[]) => frames.push({ t, bytes: ethernet(clientMac, gatewayMac, 0x0800, ipPacket) });

  // 1. ARP: who is the gateway?
  frames.push({ t: 0, bytes: ethernet("ff:ff:ff:ff:ff:ff", clientMac, 0x0806, arpPacket(1, clientMac, client, "00:00:00:00:00:00", gateway)) });
  frames.push({ t: 0.001, bytes: ethernet(clientMac, gatewayMac, 0x0806, arpPacket(2, gatewayMac, gateway, clientMac, client)) });

  // 2. DNS: example.com -> address
  toGw(0.002, ipv4(client, gateway, 17, udp(client, gateway, 53211, 53, dnsQuery(0x1a2b, name)), { id: 1 }));
  fromGw(0.023, ipv4(gateway, client, 17, udp(gateway, client, 53, 53211, dnsAnswerA(0x1a2b, name, server, 300)), { id: 2 }));

  // 3. TCP handshake; the first SYN is lost, so the client retransmits after 1 s
  const cIsn = 3_100_000_000, sIsn = 700_000;
  const syn = (id: number) => ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cIsn, flags: ["SYN"], options: { mss: 1460, sack: true, timestamps: true, wscale: 7 } }), { id, df: true });
  toGw(0.024, syn(3));
  toGw(1.025, syn(4));
  fromGw(1.066, ipv4(server, client, 6, tcp({ src: server, dst: client, sport: 443, dport: 49500, seq: sIsn, ack: cIsn + 1, flags: ["SYN", "ACK"], options: { mss: 1440, sack: true, timestamps: true, wscale: 8 } }), { id: 5, ttl: 52, df: true }));
  toGw(1.0661, ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cIsn + 1, ack: sIsn + 1, flags: ["ACK"] }), { id: 6, df: true }));

  // 4. TLS 1.3 handshake, then encrypted data
  const hello = tlsClientHello(name);
  toGw(1.067, ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cIsn + 1, ack: sIsn + 1, flags: ["PSH", "ACK"], payload: hello }), { id: 7, df: true }));
  const sh = tlsServerHello();
  fromGw(1.108, ipv4(server, client, 6, tcp({ src: server, dst: client, sport: 443, dport: 49500, seq: sIsn + 1, ack: cIsn + 1 + hello.length, flags: ["PSH", "ACK"], payload: sh }), { id: 8, ttl: 52, df: true }));
  const flight = tlsAppData(1395);
  fromGw(1.1085, ipv4(server, client, 6, tcp({ src: server, dst: client, sport: 443, dport: 49500, seq: sIsn + 1 + sh.length, ack: cIsn + 1 + hello.length, flags: ["ACK"], payload: flight }), { id: 9, ttl: 52, df: true }));
  const fin1 = tlsAppData(74);
  toGw(1.112, ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cIsn + 1 + hello.length, ack: sIsn + 1 + sh.length + flight.length, flags: ["PSH", "ACK"], payload: fin1 }), { id: 10, df: true }));
  const resp = tlsAppData(1210);
  fromGw(1.153, ipv4(server, client, 6, tcp({ src: server, dst: client, sport: 443, dport: 49500, seq: sIsn + 1 + sh.length + flight.length, ack: cIsn + 1 + hello.length + fin1.length, flags: ["PSH", "ACK"], payload: resp }), { id: 11, ttl: 52, df: true }));

  // 5. orderly close
  const cSeq = cIsn + 1 + hello.length + fin1.length;
  const sSeq = sIsn + 1 + sh.length + flight.length + resp.length;
  toGw(2.4, ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cSeq, ack: sSeq, flags: ["FIN", "ACK"] }), { id: 12, df: true }));
  fromGw(2.441, ipv4(server, client, 6, tcp({ src: server, dst: client, sport: 443, dport: 49500, seq: sSeq, ack: cSeq + 1, flags: ["FIN", "ACK"] }), { id: 13, ttl: 52, df: true }));
  toGw(2.4411, ipv4(client, server, 6, tcp({ src: client, dst: server, sport: 49500, dport: 443, seq: cSeq + 1, ack: sSeq + 1, flags: ["ACK"] }), { id: 14, df: true }));

  return writePcap(frames);
}
