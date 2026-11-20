import type { CapturedPacket } from "./types";

// Turns a list of decoded packets into explanations and a summary: it follows each TCP connection
// (handshake, retransmissions, duplicate ACKs, resets, teardown), pairs DNS queries with their
// responses, and points out what TLS exposes. Everything is computed locally from the packets.

export interface FlowSummary {
  flow: string;
  client: string;
  clientPort: number;
  server: string;
  serverPort: number;
  handshake: "complete" | "incomplete" | "midstream";
  synAttempts: number;
  handshakeMs?: number;
  options: { clientMss?: number; serverMss?: number; clientWscale?: number; serverWscale?: number; sack: boolean; timestamps: boolean };
  retransmissions: number;
  dupAcks: number;
  resets: number;
  closed: boolean;
  packets: number;
  payloadBytes: number;
  durationS: number;
}

export interface DnsSummary { name: string; type: string; answers: string[]; ms?: number; rcode: number }

export interface Insights {
  packets: number;
  durationS: number;
  hosts: string[];
  protocols: Record<string, number>;
  tcpFlows: FlowSummary[];
  dns: DnsSummary[];
  tls: { server?: string; sni?: string; version?: string; cipher?: string }[];
  retransmissions: number;
  resets: number;
  arp: number;
  icmp: number;
  checksumWarnings: number;
}

interface FlowState {
  summary: FlowSummary;
  isn: Map<string, number>;
  base: Map<string, number>;
  seen: Map<string, { no: number; time: number }>;
  lastSynTime: number;
  firstTime: number;
  lastTime: number;
  lastAck: Map<string, { ack: number; win: number; count: number }>;
  gotSynAck: boolean;
  tlsServerHelloSeen: boolean;
}

const MOD = 2 ** 32;
const rel = (v: number, base: number) => ((v - base) % MOD + MOD) % MOD;
const ms = (s: number) => `${(s * 1000).toFixed(s < 0.01 ? 2 : 0)} ms`;

export function analyze(packets: CapturedPacket[]): Insights {
  const flows = new Map<string, FlowState>();
  const dnsQueries = new Map<string, { time: number; name: string; type: string }>();
  const dns: DnsSummary[] = [];
  const tlsSeen: Insights["tls"] = [];
  const protocols: Record<string, number> = {};
  const hosts = new Set<string>();
  let retransmissions = 0, resets = 0, arp = 0, icmp = 0, checksumWarnings = 0;
  let checksumNoted = false;

  for (const p of packets) {
    p.notes = [];
    protocols[p.proto] = (protocols[p.proto] ?? 0) + 1;
    if (p.arp) arp++;
    if (p.icmp) icmp++;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(p.src) || p.src.includes(":")) hosts.add(p.src);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(p.dst) || p.dst.includes(":")) hosts.add(p.dst);
    let phase: CapturedPacket["phase"] = "default";

    if (p.badChecksum) {
      checksumWarnings++;
      if (!checksumNoted) { p.notes.push("The IPv4 header checksum is not valid. When a capture is taken on the sending computer this is normal: the network card fills the checksum in after Wireshark sees the packet (checksum offload)."); checksumNoted = true; }
    }

    // ── TCP ──
    if (p.tcp && p.flow) {
      const t = p.tcp;
      const f = t.flags;
      const syn = f.includes("SYN"), ack = f.includes("ACK"), fin = f.includes("FIN"), rst = f.includes("RST");
      let fs = flows.get(p.flow);
      if (!fs) {
        const clientIsSrc = !(syn && ack);
        fs = {
          summary: {
            flow: p.flow, client: clientIsSrc ? p.src : p.dst, clientPort: clientIsSrc ? t.srcPort : t.dstPort,
            server: clientIsSrc ? p.dst : p.src, serverPort: clientIsSrc ? t.dstPort : t.srcPort,
            handshake: syn ? "incomplete" : "midstream", synAttempts: 0,
            options: { sack: false, timestamps: false },
            retransmissions: 0, dupAcks: 0, resets: 0, closed: false, packets: 0, payloadBytes: 0, durationS: 0,
          },
          isn: new Map(), base: new Map(), seen: new Map(), lastSynTime: p.time, firstTime: p.time, lastTime: p.time,
          lastAck: new Map(), gotSynAck: false, tlsServerHelloSeen: false,
        };
        flows.set(p.flow, fs);
      }
      const s = fs.summary;
      s.packets++; s.payloadBytes += t.payloadLen; fs.lastTime = p.time;
      const fromClient = p.src === s.client && t.srcPort === s.clientPort;
      const who = fromClient ? `client ${s.client}` : `server ${s.server}`;
      const dir = `${p.src}:${t.srcPort}`;
      const peer = `${p.dst}:${t.dstPort}`;

      if (syn && !fs.isn.has(dir)) fs.isn.set(dir, t.seq);
      if (!fs.base.has(dir)) fs.base.set(dir, t.seq);
      const base = fs.isn.get(dir) ?? fs.base.get(dir)!;
      t.relSeq = rel(t.seq, base);
      const peerBase = fs.isn.get(peer) ?? fs.base.get(peer);
      if (ack && peerBase !== undefined) t.relAck = rel(t.ack, peerBase);

      // retransmission: the same bytes (or SYN/FIN) sent again from the same side
      let isRetrans = false;
      if ((t.payloadLen > 0 || syn || fin) && !rst) {
        const key = `${dir}|${t.seq}|${t.payloadLen}|${syn ? 1 : 0}${fin ? 1 : 0}`;
        const first = fs.seen.get(key);
        if (first) {
          isRetrans = true; retransmissions++; s.retransmissions++;
          const gap = p.time - first.time;
          p.notes.push(syn
            ? `Retransmitted SYN (first sent in packet #${first.no}, ${gap.toFixed(3)} s earlier). No SYN-ACK arrived, so the client's retransmission timer fired: the first timeout is 1 s and it doubles after every failure.`
            : `Retransmission of packet #${first.no}, sent ${gap.toFixed(3)} s earlier: the original was probably lost or its ACK was. TCP resends until it is acknowledged.`);
          phase = "error";
        } else fs.seen.set(key, { no: p.no, time: p.time });
      }

      if (syn && !ack) {
        s.synAttempts++;
        fs.lastSynTime = p.time;
        const o = t.options;
        s.options.clientMss = o.mss ?? s.options.clientMss; s.options.clientWscale = o.wscale ?? s.options.clientWscale;
        s.options.sack = s.options.sack || !!o.sackPermitted; s.options.timestamps = s.options.timestamps || !!o.timestamps;
        if (!isRetrans) {
          const offered = [o.mss !== undefined ? `MSS ${o.mss}` : "", o.wscale !== undefined ? `window scale ${o.wscale} (x${2 ** o.wscale})` : "", o.sackPermitted ? "SACK" : "", o.timestamps ? "timestamps" : ""].filter(Boolean);
          p.notes.push(`${who} opens a connection to ${p.dst}:${t.dstPort} (SYN).${offered.length ? ` It offers: ${offered.join(", ")}.` : ""}`);
          phase = "insert";
        }
      } else if (syn && ack) {
        fs.gotSynAck = true;
        const o = t.options;
        s.options.serverMss = o.mss; s.options.serverWscale = o.wscale;
        s.options.sack = s.options.sack && !!o.sackPermitted; s.options.timestamps = s.options.timestamps && !!o.timestamps;
        s.handshakeMs = (p.time - fs.lastSynTime) * 1000;
        const neg = [s.options.clientMss !== undefined && o.mss !== undefined ? `MSS ${Math.min(s.options.clientMss, o.mss)}` : "", s.options.clientWscale !== undefined && o.wscale !== undefined ? "window scaling on" : "", s.options.sack ? "SACK on" : "", s.options.timestamps ? "timestamps on" : ""].filter(Boolean);
        p.notes.push(`${who} accepts (SYN-ACK) ${ms(p.time - fs.lastSynTime)} after the SYN it answers.${neg.length ? ` Options both sides agreed: ${neg.join(", ")}. An option only works if BOTH SYNs carry it.` : ""}`);
        phase = "found";
      } else if (ack && fromClient && fs.gotSynAck && s.handshake === "incomplete" && !fin && !rst) {
        s.handshake = "complete";
        p.notes.push(`Handshake complete: SYN, SYN-ACK, ACK${s.synAttempts > 1 ? ` after ${s.synAttempts} SYNs` : ""} took ${ms((p.time - fs.firstTime))} overall; the network round trip is about ${ms(s.handshakeMs! / 1000)}. Data can flow now.`);
        phase = "found";
      }

      if (rst) {
        resets++; s.resets++; s.closed = true;
        p.notes.push(syn || (!fs.gotSynAck && s.handshake === "incomplete")
          ? `${who} answers with a RST: the connection was refused (nothing listening on that port, or a firewall rejected it).`
          : `${who} resets the connection (RST): an abrupt close, unlike the orderly FIN exchange. Common causes: application crash, closed socket with unread data, or a firewall/NAT dropping state.`);
        phase = "error";
      } else if (fin) {
        if (!isRetrans) p.notes.push(`${who} has no more data to send and closes its direction (FIN). The other side may keep sending until it also sends FIN.`);
        s.closed = true; phase = "default";
      }

      // duplicate ACKs
      if (ack && !syn && !fin && !rst && t.payloadLen === 0) {
        const last = fs.lastAck.get(dir);
        if (last && last.ack === t.ack && last.win === t.window) {
          last.count++; s.dupAcks++;
          p.notes.push(last.count >= 3
            ? `Duplicate ACK #${last.count}: the receiver keeps asking for the same missing byte. Three duplicates make the sender retransmit immediately (fast retransmit) instead of waiting for a timeout.`
            : `Duplicate ACK #${last.count}: the receiver got data after a gap and is still asking for the missing byte.`);
          phase = "error";
        } else fs.lastAck.set(dir, { ack: t.ack, win: t.window, count: 0 });
      } else if (t.payloadLen > 0) fs.lastAck.delete(peer);

      // application layer on top of TCP
      if (p.tls) {
        const tls = p.tls;
        if (tls.handshake === "ClientHello") {
          p.notes.push(`TLS ClientHello${tls.serverName ? ` - the server name "${tls.serverName}" is sent in the clear (SNI), so anyone watching can see which site is being visited` : ""}${tls.offeredVersions?.length ? `. Versions offered: ${tls.offeredVersions.join(", ")}` : ""}${tls.alpn?.length ? `. Protocols (ALPN): ${tls.alpn.join(", ")}` : ""}.`);
          phase = "insert";
          tlsSeen.push({ sni: tls.serverName });
        } else if (tls.handshake === "ServerHello") {
          fs.tlsServerHelloSeen = true;
          const v = tls.selectedVersion ?? tls.recordVersion;
          p.notes.push(`TLS ServerHello: the server chose ${v ?? "a version"}${tls.cipherSuite ? ` with ${tls.cipherSuite}` : ""}.${tls.selectedVersion === "TLS 1.3" ? " In TLS 1.3 everything after this message, including the certificate, is encrypted." : ""}`);
          const open = tlsSeen.find((x) => x.sni !== undefined && x.version === undefined);
          const entry = open ?? tlsSeen[tlsSeen.length - 1] ?? (tlsSeen[tlsSeen.push({}) - 1]);
          entry.version = v; entry.cipher = tls.cipherSuite; entry.server = s.server;
          phase = "found";
        } else if (tls.recordTypes[0] === "Application Data") {
          p.notes.push(`Encrypted application data (${t.payloadLen} bytes). The content, including any HTTP headers and URLs, is not visible.`);
        } else if (tls.handshake) {
          p.notes.push(`TLS ${tls.handshake}.`);
        }
      } else if (p.httpLine) {
        p.notes.push(/^HTTP\//.test(p.httpLine) ? `HTTP response in plain text: "${p.httpLine}". Anyone on the path can read it.` : `HTTP request in plain text: "${p.httpLine}". Anyone on the path can read it, which is why sites use HTTPS.`);
        phase = /^HTTP\//.test(p.httpLine) ? "found" : "insert";
      } else if (t.payloadLen > 0 && !isRetrans && !p.tls) {
        p.notes.push(`${who} sends ${t.payloadLen} bytes (sequence ${t.relSeq} to ${t.relSeq + t.payloadLen}).`);
      }

      const flagText = f.length ? f.join(", ") : "no flags";
      p.info = `${t.srcPort} → ${t.dstPort} [${flagText}] Seq=${t.relSeq}${t.relAck !== undefined ? ` Ack=${t.relAck}` : ""} Win=${t.window} Len=${t.payloadLen}${p.tls?.handshake ? ` · ${p.tls.handshake}` : p.tls ? ` · ${p.tls.recordTypes[0]}` : p.httpLine ? ` · ${p.httpLine}` : ""}`;
    }

    // ── DNS ──
    if (p.dns) {
      const d = p.dns;
      const key = `${d.id}|${[p.src, p.dst].sort().join("|")}`;
      const q = d.questions[0];
      if (!d.response) {
        dnsQueries.set(key, { time: p.time, name: q?.name ?? "", type: q?.type ?? "A" });
        p.notes.push(`${p.src} asks ${p.dst} to resolve "${q?.name ?? "?"}" (${q?.type ?? "A"} record). Names must be turned into IP addresses before a connection can start.`);
        phase = "insert";
      } else {
        const asked = dnsQueries.get(key);
        const delta = asked ? p.time - asked.time : undefined;
        const answers = d.answers.map((a) => a.data);
        if (d.rcode === 3) { p.notes.push(`${p.src} answers NXDOMAIN: the name does not exist.`); phase = "error"; }
        else if (d.rcode !== 0) { p.notes.push(`The DNS server returned an error (rcode ${d.rcode}).`); phase = "error"; }
        else {
          const ttl = d.answers[0]?.ttl;
          p.notes.push(`${p.src} answers${answers.length ? `: ${answers.join(", ")}` : " with no records"}${delta !== undefined ? ` in ${ms(delta)}` : ""}${ttl ? `. The answer may be cached for ${ttl} s (TTL).` : "."}`);
          phase = "found";
        }
        dns.push({ name: q?.name ?? asked?.name ?? "?", type: q?.type ?? asked?.type ?? "A", answers, ms: delta !== undefined ? delta * 1000 : undefined, rcode: d.rcode });
      }
    }

    // ── ARP / ICMP / fragments ──
    if (p.arp) {
      const a = p.arp;
      if (a.senderIp === a.targetIp) p.notes.push(`Gratuitous ARP: ${a.senderIp} announces its own address, usually after a change or a failover, so neighbours refresh their caches.`);
      else if (a.op === "request") p.notes.push(`${a.senderIp} asks the whole local network (broadcast) which MAC address owns ${a.targetIp}. ARP only works inside one subnet.`);
      else p.notes.push(`${a.senderIp} replies directly (unicast) with its MAC address ${a.senderMac}, and the asker caches it.`);
      phase = a.op === "request" ? "insert" : "found";
    }
    if (p.icmp) {
      const n = p.icmp.name;
      if (n === "Time Exceeded") { p.notes.push(`A router discarded a packet because its TTL reached 0 and reported it from ${p.src}. This is how traceroute discovers each hop.`); phase = "error"; }
      else if (n === "Destination Unreachable") { p.notes.push(`${p.src} reports that the destination or port is unreachable (code ${p.icmp.code}).`); phase = "error"; }
      else if (n === "Echo Request") { p.notes.push(`Ping: ${p.src} asks ${p.dst} to reply.`); phase = "insert"; }
      else if (n === "Echo Reply") { p.notes.push(`Ping reply from ${p.src}.`); phase = "found"; }
    }
    if (p.fragment) p.notes.push("This packet is one fragment of a larger IPv4 datagram. Fragments are reassembled only at the destination; most modern traffic avoids fragmentation with Path MTU Discovery.");

    p.phase = phase;
  }

  const tcpFlows = [...flows.values()].map((fs) => ({ ...fs.summary, durationS: fs.lastTime - fs.firstTime }));
  for (const s of tcpFlows) if (s.handshake === "incomplete" && s.synAttempts > 0 && !s.closed) s.handshake = "incomplete";
  return {
    packets: packets.length,
    durationS: packets.length ? packets[packets.length - 1].time : 0,
    hosts: [...hosts],
    protocols, tcpFlows, dns, tls: tlsSeen,
    retransmissions, resets, arp, icmp, checksumWarnings,
  };
}

/** One sentence for the caption under the player. */
export function explain(p: CapturedPacket): string {
  if (p.notes.length) return p.notes.join(" ");
  return `${p.proto}: ${p.src} → ${p.dst}${p.info ? ` · ${p.info}` : ""}`;
}
