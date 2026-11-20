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
// TLS 1.3: the keys come from an ephemeral (EC)DH exchange carried in the Hello
// messages; the certificate's key only signs the transcript to prove identity.
// Every byte after the ServerHello is encrypted.

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

  // --- 1. ClientHello (plaintext) ---
  // TLS 1.3 puts the client's ephemeral (EC)DH public value in the very first message.
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "ClientHello", supportedVersions: "TLS 1.3", cipherSuites: "TLS_AES_128_GCM_SHA256, TLS_CHACHA20_POLY1305_SHA256", clientRandom: "9f3a...e21c", keyShare: "X25519 public value (client)", serverName: serverLabel + " (SNI, still plaintext)", alpn: "h2, http/1.1" } }] };
  steps.push(st(topology, packet, "NONE", `${clientLabel} sends ClientHello: supported versions and cipher suites, a random value, and - already - its ephemeral X25519 public value (key_share). Putting the key share in the first message is what lets TLS 1.3 finish in one round trip. This message is plaintext, including the server name (SNI).`, 1, "insert"));
  packet = travel(packet, "ClientHello", "NONE", true);
  steps.push(st(topology, packet, "NONE", `${serverLabel} receives the ClientHello and generates its own ephemeral key pair.`, 2, "found"));

  // --- 2. ServerHello (plaintext) ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS", fields: { message: "ServerHello", chosenCipher: "TLS_AES_128_GCM_SHA256", serverRandom: "1b7d...a904", keyShare: "X25519 public value (server)" } }] };
  steps.push(st(topology, packet, "HELLO_EXCHANGED", `${serverLabel} replies with ServerHello: the chosen cipher suite, its random value and its own X25519 public value. This is the last plaintext handshake message.`, 3, "insert"));
  packet = travel(packet, "ServerHello", "HELLO_EXCHANGED", false);
  steps.push(st(topology, packet, "KEYS_EXCHANGED", `${clientLabel} combines its private value with the server's public value (ECDHE) and runs the result through HKDF. ${serverLabel} did the same. Both hold the same handshake keys and nothing secret ever crossed the wire - everything from here on is encrypted.`, 4, "found"));

  // --- 3. Encrypted server flight ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS (encrypted)", fields: { message: "EncryptedExtensions + Certificate + CertificateVerify + Finished", encrypted: "yes - handshake keys", certificate: `subject ${serverLabel}, issuer Demo CA, chain to a trusted root`, certificateVerify: "signature over the handshake transcript, made with the server's private key", finished: "MAC over the transcript" } }] };
  steps.push(st(topology, packet, "KEYS_EXCHANGED", `${serverLabel} sends its whole flight in one go, already encrypted: its certificate chain, a CertificateVerify signature (proof that it holds the certificate's private key - that key is NOT used to encrypt anything) and its Finished MAC. In TLS 1.2 the certificate was visible to eavesdroppers; in 1.3 it is not.`, 5, "insert"));
  packet = travel(packet, "Server flight (encrypted)", "KEYS_EXCHANGED", false);
  steps.push(st(topology, packet, "CERT_VERIFIED", `${clientLabel} decrypts the flight and checks: the chain leads to a trusted CA, the certificate is within its validity dates and not revoked, the name matches "${serverLabel}", and the CertificateVerify signature is valid. If any check fails the connection is aborted here.`, 6, "found"));

  // --- 4. Client Finished ---
  packet = { ...clonePacket(packet), layers: [{ protocol: "TLS (encrypted)", fields: { message: "Finished", encrypted: "yes - handshake keys", finished: "MAC over the whole transcript" } }] };
  steps.push(st(topology, packet, "CERT_VERIFIED", `${clientLabel} sends its Finished message, a MAC over the entire handshake. Both sides now derive the application traffic keys. The client may start sending encrypted HTTP in the same flight.`, 7, "insert"));
  packet = travel(packet, "Client Finished (encrypted)", "CERT_VERIFIED", true);
  steps.push(st(topology, packet, "ESTABLISHED", `${serverLabel} verifies the client's Finished. Total: one round trip (ClientHello out, server flight back) before application data - TLS 1.2 needed two. The session is ESTABLISHED.`, 8, "found"));

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
  steps.push(st(topology, packet, "ESTABLISHED", `${clientLabel} sends a GET request exactly like the plain HTTP page does — but wrapped inside a TLS record. Anyone watching the wire sees encrypted bytes, not the method or path (the server name was visible only in the ClientHello's SNI).`, 9, "insert"));
  packet = travel(packet, true);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, "ESTABLISHED", `${serverLabel} decrypts the record with the shared session key and reads the exact same HTTP request underneath — HTTP hasn't changed, only what's visible on the wire has.`, 10, "found"));

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
  "send(ClientHello: versions, ciphers, random, key_share = clientPublic, SNI);   // 1. plaintext",
  "on receive(ClientHello): (serverPrivate, serverPublic) = newEphemeralKey();    // 2.",
  "send(ServerHello: chosenCipher, random, key_share = serverPublic);             // 3. last plaintext message",
  "handshakeKeys = HKDF(ECDH(myPrivate, peerPublic), transcript);   // 4. both sides, nothing secret sent",
  "send({EncryptedExtensions, Certificate, CertificateVerify, Finished});         // 5. server flight, encrypted",
  "verify(chain, hostname, validity, CertificateVerify);  // abort if any check fails   // 6.",
  "send({Finished});  appKeys = HKDF(handshakeSecret, transcript);                 // 7. client Finished",
  "server verifies client Finished  ->  session ESTABLISHED   (1 round trip total)  // 8.",
  "send(ApplicationData: httpRequest, encryptedWith: appKeys);                     // 9.",
  "// server decrypts with appKeys, reads the same HTTP request                    // 10.",
];

export const TLS_ANNOTATIONS: Record<number, string> = {
  1: "TLS 1.3 sends the client's key share immediately, guessing which group (X25519) the server will pick. The server name (SNI) is still plaintext unless Encrypted Client Hello is used.",
  4: "ECDHE: each side combines its own private value with the other's public value and gets the same secret. Because the keys are ephemeral, recording the traffic and stealing the server's key later does not reveal it (forward secrecy).",
  5: "The certificate's private key signs the transcript (CertificateVerify) to prove identity. It is not used to encrypt or to derive keys - that is the big change from RSA key transport in TLS 1.2.",
  6: "Real clients also check revocation (OCSP stapling / CRLite), certificate transparency and the hostname. A failed check aborts the handshake.",
  8: "TLS 1.3 needs one round trip before data. Resumption with a session ticket can even send data in the first flight (0-RTT), at the cost of replay risk.",
  9: "HTTP doesn't run instead of TLS - it runs after TLS, riding inside the encrypted channel this handshake just established.",
};

export const TLS_COMPLEXITY = {
  time: "O(hops) per leg × handshake legs, then O(hops) per encrypted record",
  space: "O(1)",
  note: "The handshake is a fixed one-time cost per connection — TLS 1.3 needs only one round trip before application data (like HTTP) can start flowing, encrypted, on top of it.",
};
