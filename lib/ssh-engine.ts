import { Step } from "./types";

// SSH: a Diffie-Hellman key exchange encrypts the channel before a single
// credential is sent, then authentication (password or public key) rides
// inside that already-encrypted tunnel — the same "encrypt first, then
// authenticate" shape as TLS (see the HTTPS page), applied to a remote
// shell instead of a browser request.

export type SshAuthMethod = "password" | "publickey";
export type SshStage = "banner" | "kex" | "hostkey" | "auth" | "shell";

export interface SshStep extends Step {
  stage: SshStage;
  encrypted: boolean;
}

function s(explanation: string, hl: number, stage: SshStage, encrypted: boolean, phase?: string): SshStep {
  return { explanation, highlightLine: hl, stage, encrypted, phase };
}

export function simulateSsh(authMethod: SshAuthMethod, firstConnection: boolean): SshStep[] {
  const steps: SshStep[] = [];

  steps.push(s("Client and server exchange version banners over plain TCP on port 22 — e.g. \"SSH-2.0-OpenSSH_9.3\" — so both sides know which protocol features the other supports.", 1, "banner", false));

  steps.push(s("Both sides negotiate algorithms and run a Diffie-Hellman key exchange. A shared symmetric session key is derived without ever sending it over the wire — from this point on, every byte exchanged is encrypted.", 2, "kex", true, "insert"));

  if (firstConnection) {
    steps.push(s("The server presents its host key fingerprint. This client has never connected here before, so it can't verify this is really the right server — just that it's the same server for every future connection (Trust On First Use).", 3, "hostkey", true, "error"));
    steps.push(s("The fingerprint is accepted and stored in known_hosts. Any future connection presenting a different key for this host will now trigger a loud warning instead of a quiet prompt.", 3, "hostkey", true));
  } else {
    steps.push(s("The server presents its host key. It matches the fingerprint already stored in known_hosts from a previous connection — accepted silently, no prompt needed.", 3, "hostkey", true));
  }

  if (authMethod === "password") {
    steps.push(s("Client sends a username, then a password — but both travel inside the encrypted tunnel established in step 2, never as cleartext on the wire the way plain Telnet would send them.", 4, "auth", true));
    steps.push(s("Server checks the password and accepts.", 4, "auth", true));
  } else {
    steps.push(s("Client offers a public key it has on file for this server.", 4, "auth", true));
    steps.push(s("Server checks that public key against ~/.ssh/authorized_keys, then sends a random challenge.", 4, "auth", true));
    steps.push(s("Client signs the challenge with its private key — which never leaves the client's machine, encrypted tunnel or not — and sends back the signature. Server verifies it with the matching public key and accepts.", 4, "auth", true, "insert"));
  }

  steps.push(s("An encrypted shell channel opens. Every keystroke sent and every byte of output returned is now protected by the same session key negotiated in step 2 — a full remote terminal, not just a file transfer.", 5, "shell", true, "insert"));

  return steps;
}

export const SSH_CODE: string[] = [
  "function connect(client, server) {",
  "  exchangeBanners(client, server);              // plaintext — just version negotiation",
  "  const sessionKey = diffieHellman(client, server); // encrypts everything from here on",
  "  if (!client.knownHosts.has(server.hostKey)) {",
  "    warnTrustOnFirstUse(server.hostKey);         // or fail loudly if it changed since last time",
  "    client.knownHosts.add(server.hostKey);",
  "  }",
  "  authenticate(client, server, sessionKey);       // password OR public-key — inside the tunnel",
  "  openShellChannel(client, server, sessionKey);   // encrypted terminal, not just a login",
  "}",
];

export const SSH_ANNOTATIONS: Record<number, string> = {
  1: "Version banners are the one part of SSH sent in the clear — there's nothing secret in \"I speak SSH-2.0\" itself.",
  2: "This is the same principle TLS uses for HTTPS: negotiate encryption before anything sensitive is sent, not after.",
  3: "Trust On First Use is SSH's biggest structural difference from TLS: there's no certificate authority vouching for the host key, just \"was it the same key as last time.\"",
  4: "Public-key authentication proves possession of a private key without ever transmitting it — the signature is proof enough.",
  5: "Everything after this point — ls, cat, vim, whatever — is just encrypted bytes over the channel opened here.",
};

export const SSH_COMPLEXITY = {
  time: "O(1) handshake, then O(1) per byte of shell traffic",
  space: "O(1) per session (one symmetric key), O(hosts) for known_hosts",
  note: "The interesting cost here isn't computational — it's the trust model: TLS outsources \"is this really the server\" to a certificate authority, SSH outsources it to \"did I check this fingerprint before.\"",
};
