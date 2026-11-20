import { decodeFrame } from "./decode";
import { CapturedPacket, LIMITS, ParseResult } from "./types";

// Reads classic pcap and pcapng files (what Wireshark and tcpdump save) entirely in memory.
// Handles both byte orders, microsecond and nanosecond timestamps, and refuses anything that
// would read past the end of the buffer.

interface RawFrame { data: Uint8Array; ts: number; orig: number; link: number }

function readClassic(buf: Uint8Array, view: DataView, little: boolean, nano: boolean, warnings: string[]): { frames: RawFrame[]; truncated: boolean } {
  if (buf.length < 24) return { frames: [], truncated: false };
  const link = view.getUint32(20, little) & 0xffff;
  const frames: RawFrame[] = [];
  let o = 24;
  let truncated = false;
  while (o + 16 <= buf.length) {
    const sec = view.getUint32(o, little), frac = view.getUint32(o + 4, little);
    const incl = view.getUint32(o + 8, little), orig = view.getUint32(o + 12, little);
    o += 16;
    if (incl > LIMITS.maxFrame || o + incl > buf.length) { warnings.push("The file ends in the middle of a packet; the rest was ignored."); truncated = true; break; }
    if (frames.length >= LIMITS.maxPackets) { truncated = true; break; }
    frames.push({ data: buf.subarray(o, o + incl), ts: sec + frac / (nano ? 1e9 : 1e6), orig, link });
    o += incl;
  }
  return { frames, truncated };
}

function readPcapng(buf: Uint8Array, view: DataView, warnings: string[]): { frames: RawFrame[]; truncated: boolean } {
  const frames: RawFrame[] = [];
  const ifaces: { link: number; unit: number }[] = [];       // unit = seconds per timestamp tick
  let little = true;
  let o = 0;
  let truncated = false;
  let lastTs = 0;
  while (o + 12 <= buf.length) {
    // The first block must be a Section Header, which tells us the byte order.
    const typeLE = view.getUint32(o, true);
    if (typeLE === 0x0a0d0d0a) {
      const bom = view.getUint32(o + 8, true);
      if (bom === 0x1a2b3c4d) little = true;
      else if (bom === 0x4d3c2b1a) little = false;
      else { warnings.push("Unrecognised pcapng byte order; stopped reading."); break; }
      ifaces.length = 0;
    }
    const type = view.getUint32(o, little);
    const len = view.getUint32(o + 4, little);
    if (len < 12 || len % 4 !== 0 || o + len > buf.length) { warnings.push("The file ends in the middle of a block; the rest was ignored."); truncated = true; break; }
    const body = o + 8;
    if (type === 1 && len >= 20) {                              // Interface Description Block
      const link = view.getUint16(body, little);
      let unit = 1e-6;
      let p = body + 8;
      while (p + 4 <= o + len - 4) {                            // options: code, length, value (padded to 4)
        const code = view.getUint16(p, little), olen = view.getUint16(p + 2, little);
        if (code === 0) break;
        if (code === 9 && olen === 1 && p + 4 < buf.length) {   // if_tsresol
          const v = buf[p + 4];
          unit = v & 0x80 ? 2 ** -(v & 0x7f) : 10 ** -v;
        }
        p += 4 + Math.ceil(olen / 4) * 4;
      }
      ifaces.push({ link, unit });
    } else if (type === 6 && len >= 32) {                       // Enhanced Packet Block
      const id = view.getUint32(body, little);
      const hi = view.getUint32(body + 4, little), lo = view.getUint32(body + 8, little);
      const cap = view.getUint32(body + 12, little), orig = view.getUint32(body + 16, little);
      const ifc = ifaces[id];
      if (ifc && cap <= LIMITS.maxFrame && body + 20 + cap <= o + len) {
        if (frames.length >= LIMITS.maxPackets) { truncated = true; break; }
        lastTs = (hi * 2 ** 32 + lo) * ifc.unit;
        frames.push({ data: buf.subarray(body + 20, body + 20 + cap), ts: lastTs, orig, link: ifc.link });
      }
    } else if (type === 3 && len >= 20) {                       // Simple Packet Block (no timestamp)
      const orig = view.getUint32(body, little);
      const cap = Math.min(orig, len - 16);
      const ifc = ifaces[0];
      if (ifc && cap <= LIMITS.maxFrame) {
        if (frames.length >= LIMITS.maxPackets) { truncated = true; break; }
        frames.push({ data: buf.subarray(body + 4, body + 4 + cap), ts: lastTs, orig, link: ifc.link });
      }
    }
    o += len;
  }
  return { frames, truncated };
}

export function parsePcap(input: ArrayBuffer | Uint8Array): ParseResult {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length > LIMITS.maxBytes) return { ok: false, error: `This file is ${(buf.length / 1048576).toFixed(1)} MB; the limit is ${LIMITS.maxBytes / 1048576} MB. Filter or trim the capture in Wireshark first.` };
  if (buf.length < 24) return { ok: false, error: "That file is too small to be a packet capture." };
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint32(0, false);
  const warnings: string[] = [];

  let raw: { frames: RawFrame[]; truncated: boolean };
  let format: "pcap" | "pcapng";
  if (magic === 0xa1b2c3d4 || magic === 0xa1b23c4d) { raw = readClassic(buf, view, false, magic === 0xa1b23c4d, warnings); format = "pcap"; }
  else if (magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1) { raw = readClassic(buf, view, true, magic === 0x4d3cb2a1, warnings); format = "pcap"; }
  else if (magic === 0x0a0d0d0a) { raw = readPcapng(buf, view, warnings); format = "pcapng"; }
  else return { ok: false, error: "This is not a pcap or pcapng file. In Wireshark use File > Save As (pcap or pcapng), or File > Export Packet Dissections > As JSON." };

  if (raw.frames.length === 0) return { ok: false, error: "The capture contains no packets." };

  const t0 = raw.frames[0].ts;
  const packets: CapturedPacket[] = [];
  let skipped = 0;
  raw.frames.forEach((f, i) => {
    const p = decodeFrame(f.data, f.link, i + 1, Math.max(0, f.ts - t0), f.orig);
    if (p) packets.push(p); else skipped++;
  });
  if (packets.length === 0) return { ok: false, error: "None of the packets use a link type this page can read (Ethernet, Linux cooked or raw IP)." };
  if (skipped) warnings.push(`${skipped} frame${skipped === 1 ? "" : "s"} used an unsupported link type and ${skipped === 1 ? "was" : "were"} skipped.`);
  if (raw.truncated) warnings.push(`Only the first ${packets.length} packets are shown.`);
  return { ok: true, capture: { format, packets, skipped, truncated: raw.truncated, warnings } };
}
