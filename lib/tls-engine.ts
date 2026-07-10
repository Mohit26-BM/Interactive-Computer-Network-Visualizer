import { Step, PacketState, PacketHeaderLayer } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TlsState = "NONE" | "HELLO_EXCHANGED" | "CERT_VERIFIED" | "KEYS_EXCHANGED" | "ESTABLISHED";

export interface TlsStep extends Step {
  topology: TopologyState;
  packet: PacketState;
  sessionState: TlsState;
}

const FRAMES_PER_LINK = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePacket(p: PacketState): PacketState {
  return { ...p, layers: p.layers.map((l) => ({ protocol: l.protocol, fields: { ...l.fields } })) };
}

function findDevice(topology: TopologyState, label: string): DeviceNode | undefined {
  return topology.devices.find((d) => d.label === label);
}

function findLink(topology: TopologyState, aId: string, bId: string) {
  return topology.links.find((l) => (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId));
}

function st(topology: TopologyState, packet: PacketState, sessionState: TlsState, explanation: string, hl: number, phase?: string): TlsStep {
  return {
    topology,
    packet: clonePacket(packet),
    sessionState,
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── The TLS handshake, then one encrypted HTTP request riding inside it ────
// The public/private keypair (in the certificate) is only ever used to
// establish trust and exchange a symmetric session key — every byte of the
// actual HTTP conversation afterward is encrypted with that fast symmetric
// key, not with the slow asymmetric keypair itself.

export function tlsHandshake(topology: TopologyState, clientLabel: string, serverLabel: string): TlsStep[] {
  const steps: TlsStep[] = [];

  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);

  let packet: PacketState = { id: "tls", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client) { steps.push(st(topology, packet, "NONE", `Device "${clientLabel}" does not exist.`, 1, "error")); return steps; }
  if (!server) { steps.push(st(topology, packet, "NONE", `Device "${serverLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, clientLabel, serverLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, "NONE", `No path between "${clientLabel}" and "${serverLabel}".`, 1, "error"));
    return steps;
  }
  const hops = pathLabels.map((l) => findDevice(topology, l)!);

  function travel(pkt: PacketState, label: string, state: TlsState, forward: boolean) {
    const path = forward ? hops : [...hops].reverse();
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const hopFrom = path[i];
      const hopTo = path[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, state, `${label} leaving ${hopFrom.label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, state, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 1));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  // --- 1. ClientHello ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "ClientHello", version: "TLS 1.3", cipherSuites: "TLS_AES_128_GCM_SHA256, TLS_CHACHA20_POLY1305_SHA256", clientRandom: "9f3a...e21c" } }] };
  steps.push(st(topology, packet, "NONE", `${clientLabel} sends ClientHello: the TLS versions and cipher suites it supports, plus a random value used later to derive keys.`, 1, "insert"));
  packet = travel(packet, "ClientHello", "NONE", true);
  steps.push(st(topology, packet, "NONE", `${serverLabel} receives the ClientHello.`, 2, "found"));

  // --- 2. ServerHello ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "ServerHello", chosenCipher: "TLS_AES_128_GCM_SHA256", serverRandom: "1b7d...a904" } }] };
  steps.push(st(topology, packet, "HELLO_EXCHANGED", `${serverLabel} picks one cipher suite from the client's list and replies with its own random value.`, 3, "insert"));
  packet = travel(packet, "ServerHello", "HELLO_EXCHANGED", false);
  steps.push(st(topology, packet, "HELLO_EXCHANGED", `${clientLabel} receives the ServerHello — both sides have now agreed on exactly how this session will be encrypted.`, 4, "found"));

  // --- 3. Certificate ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "Certificate", subject: serverLabel, issuer: "Demo CA", publicKey: "(RSA 2048-bit)" } }] };
  steps.push(st(topology, packet, "HELLO_EXCHANGED", `${serverLabel} sends its certificate — containing its public key, signed by a Certificate Authority the client is supposed to already trust.`, 5, "insert"));
  packet = travel(packet, "Certificate", "HELLO_EXCHANGED", false);
  steps.push(st(topology, packet, "CERT_VERIFIED", `${clientLabel} checks the certificate's signature against its trusted CA list. If this didn't check out, the connection would stop here — right now, it's valid.`, 6, "found"));

  // --- 4. Key Exchange ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "KeyExchange", note: "Client and server each independently derive the same symmetric session key from both random values plus the key exchange math." } }] };
  steps.push(st(topology, packet, "CERT_VERIFIED", `Key exchange happens: the server's public key is used only to protect this one exchange — the actual symmetric session key both sides end up with is never sent over the wire at all.`, 7, "insert"));
  packet = travel(packet, "KeyExchange", "CERT_VERIFIED", true);
  packet = travel(packet, "KeyExchange", "KEYS_EXCHANGED", false);
  steps.push(st(topology, packet, "KEYS_EXCHANGED", `Both ${clientLabel} and ${serverLabel} now hold the same symmetric session key — fast enough to encrypt every byte of real traffic, unlike the public/private keypair used only to get here.`, 8, "found"));

  // --- 5. Finished ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "Finished", note: "encrypted with the new session key — the first thing either side sends that the other couldn't have forged without it" } }] };
  steps.push(st(topology, packet, "ESTABLISHED", `Both sides send a "Finished" message, encrypted with the session key, proving the handshake wasn't tampered with. The TLS session is now established.`, 9, "found"));

  return steps;
}

// ─── Encrypted HTTP, riding inside the now-established TLS session ─────────
// This is the payoff: HTTP doesn't change at all — it's the exact same
// request as the plain HTTP page — but everything past the TLS record layer
// is opaque to anyone watching the wire.

export function sendEncryptedHttp(topology: TopologyState, clientLabel: string, serverLabel: string): TlsStep[] {
  const steps: TlsStep[] = [];
  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);
  if (!client || !server) return steps;

  const pathLabels = findPath(topology, clientLabel, serverLabel)!;
  const hops = pathLabels.map((l) => findDevice(topology, l)!);

  function travel(pkt: PacketState, forward: boolean) {
    const path = forward ? hops : [...hops].reverse();
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const link = findLink(topology, path[i].id, path[i + 1].id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, "ESTABLISHED", `Encrypted record leaving ${path[i].label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, "ESTABLISHED", `Encrypted record on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}%).`, 1));
      }
      p = { ...clonePacket(p), atNode: path[i + 1].id, currentLink: null, progress: 0 };
    }
    return p;
  }

  let packet: PacketState = {
    id: "tls-http", atNode: client.id, currentLink: null, progress: 0, fate: "queued",
    layers: [
      { protocol: "TLS", fields: { message: "Application Data", encrypted: "yes" } },
      { protocol: "HTTP (encrypted)", fields: { method: "••• (hidden)", path: "••• (hidden)", host: "••• (hidden)" } },
    ],
  };
  steps.push(st(topology, packet, "ESTABLISHED", `${clientLabel} sends a GET request exactly like the plain HTTP page does — but wrapped inside a TLS record. Anyone watching the wire sees encrypted bytes, not the method, path, or host.`, 10, "insert"));
  packet = travel(packet, true);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, "ESTABLISHED", `${serverLabel} decrypts the record with the shared session key and reads the exact same HTTP request underneath — HTTP hasn't changed, only what's visible on the wire has.`, 11, "found"));

  return steps;
}

// ─── Plaintext vs TLS visibility comparison (reference, no engine needed) ──

export function visibilityComparison(): { plaintext: PacketHeaderLayer[]; encrypted: PacketHeaderLayer[] } {
  return {
    plaintext: [{ protocol: "HTTP", fields: { method: "GET", path: "/account/settings", host: "example.com", headers: "Cookie: session=abc123" } }],
    encrypted: [
      { protocol: "TLS", fields: { message: "Application Data", encrypted: "yes" } },
      { protocol: "HTTP (encrypted)", fields: { method: "•••", path: "•••", host: "•••", headers: "•••" } },
    ],
  };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const TLS_CODE: string[] = [
  "send(ClientHello: versions, ciphers, random);       // 1. client -> server",
  "on receive(ClientHello): prepareResponse();         // 2. server got it",
  "send(ServerHello: chosenCipher, random);            // 3. server -> client",
  "on receive(ServerHello): agreedOnCipher = true;     // 4. client got it",
  "send(Certificate: publicKey, signedBy: CA);         // 5. server -> client",
  "verify(certificate, trustedCAs);  // stop here if this fails   // 6.",
  "sessionKey = deriveKey(bothRandoms, certificate.publicKey);    // 7.",
  "// server independently derives the identical sessionKey       // 8.",
  "send(Finished, encryptedWith: sessionKey);          // 9. session established",
  "send(ApplicationData: httpRequest, encryptedWith: sessionKey); // 10.",
  "// server decrypts with sessionKey, reads the same HTTP request // 11.",
];

export const TLS_ANNOTATIONS: Record<number, string> = {
  1: "The client proposes what it supports; nothing here is a secret yet — this part of the handshake happens in plaintext.",
  6: "Certificate verification is what stops an attacker from just handing over their own public key and pretending to be the real server.",
  7: "This is the key idea: the slow asymmetric keypair only ever protects this one moment — the fast symmetric key it produces is what actually encrypts the conversation.",
  9: "Finished is the first message either side sends that only someone holding the real session key could have produced — proof the handshake wasn't tampered with.",
  10: "HTTP doesn't run instead of TLS — it runs after TLS, riding inside the encrypted channel this handshake just established.",
};

export const TLS_COMPLEXITY = {
  time: "O(hops) per leg × handshake legs, then O(hops) per encrypted record",
  space: "O(1)",
  note: "The handshake is a fixed one-time cost per connection — TLS 1.3 needs only one round trip before application data (like HTTP) can start flowing, encrypted, on top of it.",
};
