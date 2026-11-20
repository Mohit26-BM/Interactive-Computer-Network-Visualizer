import type { PacketHeaderLayer } from "../types";

// Shared shapes for the capture importer. Everything here is plain data: captures are parsed in the
// browser and never uploaded anywhere.

export interface TcpOptions {
  mss?: number;
  wscale?: number;
  sackPermitted?: boolean;
  timestamps?: boolean;
  sackBlocks?: number;
}

export interface TcpInfo {
  srcPort: number;
  dstPort: number;
  seq: number;          // raw 32-bit sequence number
  ack: number;          // raw 32-bit acknowledgment number
  flags: string[];      // e.g. ["SYN", "ACK"]
  window: number;       // advertised window as sent (before scaling)
  payloadLen: number;
  options: TcpOptions;
  relSeq?: number;      // filled in by the analyzer (relative to the connection's ISN)
  relAck?: number;
}

export interface DnsInfo {
  id: number;
  response: boolean;
  rcode: number;
  questions: { name: string; type: string }[];
  answers: { name: string; type: string; ttl: number; data: string }[];
}

export interface TlsInfo {
  recordTypes: string[];          // e.g. ["Handshake"], ["Application Data"]
  handshake?: string;             // first handshake message type, e.g. "ClientHello"
  recordVersion?: string;
  serverName?: string;            // SNI
  offeredVersions?: string[];     // ClientHello supported_versions
  selectedVersion?: string;       // ServerHello
  cipherSuite?: string;
  alpn?: string[];
}

export interface CapturedPacket {
  no: number;
  time: number;         // seconds since the first packet
  length: number;       // bytes on the wire
  src: string;
  dst: string;
  srcPort?: number;
  dstPort?: number;
  proto: string;        // highest protocol we recognised
  info: string;         // one-line summary
  layers: PacketHeaderLayer[];
  ttl?: number;
  tcp?: TcpInfo;
  dns?: DnsInfo;
  tls?: TlsInfo;
  httpLine?: string;
  icmp?: { type: number; code: number; name: string };
  arp?: { op: "request" | "reply"; senderIp: string; senderMac: string; targetIp: string };
  fragment?: boolean;
  badChecksum?: boolean; // IPv4 header checksum failed
  flow?: string;         // canonical TCP/UDP flow key (same for both directions)
  notes: string[];       // plain-language observations added by the analyzer
  phase?: "insert" | "found" | "error" | "default";
}

export type CaptureFormat = "pcap" | "pcapng" | "tshark-json";

export interface ParsedCapture {
  format: CaptureFormat;
  packets: CapturedPacket[];
  skipped: number;      // frames we could not decode at all
  truncated: boolean;   // stopped at the packet or size limit
  warnings: string[];
}

export type ParseResult = { ok: true; capture: ParsedCapture } | { ok: false; error: string };

export const LIMITS = {
  maxBytes: 12 * 1024 * 1024,
  maxPackets: 5000,
  maxFrame: 262144,
} as const;
