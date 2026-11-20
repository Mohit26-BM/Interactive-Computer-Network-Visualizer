import { Step, PacketState } from "./types";
import { TopologyState, DeviceNode } from "./topology-engine";
import { findPath } from "./packet-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST";

export interface HttpStep extends Step {
  topology: TopologyState;
  packet: PacketState;
}

const FRAMES_PER_LINK = 6;

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  404: "Not Found",
  500: "Internal Server Error",
};

// A tiny fixed "site" — enough to demonstrate a hit and a miss without a
// general-purpose routing table.
const PAGES: Record<string, string> = {
  "/": "<html><body><h1>Welcome</h1></body></html>",
  "/about": "<html><body><h1>About us</h1></body></html>",
};

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

function st(topology: TopologyState, packet: PacketState, explanation: string, hl: number, phase?: string): HttpStep {
  return {
    topology,
    packet: clonePacket(packet),
    explanation,
    highlightLine: hl,
    highlightNodes: packet.atNode ? [packet.atNode] : [],
    phase,
  };
}

// ─── Send one HTTP request, get one response ────────────────────────────────
// This assumes the TCP connection underneath is already open (see TCP
// Handshake) — HTTP itself only ever deals in one request, one response.

export function sendHttpRequest(
  topology: TopologyState,
  clientLabel: string,
  serverLabel: string,
  method: HttpMethod,
  path: string,
  body?: string
): HttpStep[] {
  const steps: HttpStep[] = [];

  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);

  let packet: PacketState = { id: "http", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };

  if (!client) { steps.push(st(topology, packet, `Device "${clientLabel}" does not exist.`, 1, "error")); return steps; }
  if (!server) { steps.push(st(topology, packet, `Device "${serverLabel}" does not exist.`, 1, "error")); return steps; }

  const pathLabels = findPath(topology, clientLabel, serverLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, packet, `No path between "${clientLabel}" and "${serverLabel}".`, 1, "error"));
    return steps;
  }
  const hops = pathLabels.map((l) => findDevice(topology, l)!);

  function travel(pkt: PacketState, label: string, forward: boolean) {
    const path = forward ? hops : [...hops].reverse();
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const hopFrom = path[i];
      const hopTo = path[i + 1];
      const link = findLink(topology, hopFrom.id, hopTo.id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, `${label} leaving ${hopFrom.label}.`, 1));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 1));
      }
      p = { ...clonePacket(p), atNode: hopTo.id, currentLink: null, progress: 0 };
    }
    return p;
  }

  const requestFields: Record<string, string> = {
    method, path, host: server.ip ?? serverLabel,
    headers: "User-Agent: NetViz/1.0; Accept: text/html",
  };
  if (method === "POST" && body) requestFields.body = body;

  packet = { ...clonePacket(packet), layers: [{ protocol: "HTTP", fields: requestFields }] };
  steps.push(st(topology, packet, `${clientLabel} sends ${method} ${path} to ${serverLabel} — riding on top of the TCP connection already open between them.`, 1, "insert"));
  packet = travel(packet, `${method} ${path}`, true);
  steps.push(st(topology, packet, `${serverLabel} receives the request.`, 3, "found"));

  const html = PAGES[path];
  const status = html ? 200 : 404;
  const responseBody = html ?? "<html><body><h1>404 Not Found</h1></body></html>";

  packet = {
    ...clonePacket(packet),
    layers: [{ protocol: "HTTP", fields: { status, statusText: STATUS_TEXT[status], headers: `Content-Type: text/html; Content-Length: ${responseBody.length}`, body: responseBody } }],
  };
  steps.push(st(topology, packet, `${serverLabel} looks up "${path}" — ${html ? "found it" : "no such page"} — and responds ${status} ${STATUS_TEXT[status]}.`, 5, status === 200 ? "insert" : "error"));
  packet = travel(packet, `${status} ${STATUS_TEXT[status]}`, false);
  packet = { ...clonePacket(packet), fate: "delivered" };
  steps.push(st(topology, packet, `${clientLabel} receives the response and (if 200) the browser renders the HTML body.`, 7, "found"));

  return steps;
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const HTTP_CODE: string[] = [
  "function request(method, path) {",
  "  send(HTTP{ method, path, host, headers });",
  "",
  "  on receive(request):",
  "    resource = lookup(path);",
  "    if (resource)",
  "      respond(200, headers, resource.body);",
  "    else",
  "      respond(404, headers, notFoundPage);",
  "",
  "  on receive(response):",
  "    if (response.status === 200)",
  "      render(response.body);",
  "}",
];

export const HTTP_ANNOTATIONS: Record<number, string> = {
  1: "GET asks for a resource; POST sends data to be processed — the method itself tells the server what kind of operation this is.",
  3: "Headers carry metadata about the request (or response) separately from the actual content — things like what formats are acceptable, or how large the body is.",
  5: "Status codes are grouped by their first digit: 2xx success, 3xx redirect, 4xx client error (you asked wrong), 5xx server error (it broke on their end).",
  7: "The browser only renders on success — a 404 or 500 gets shown as an error page instead of parsed as if it were the real content.",
};

export const HTTP_COMPLEXITY = {
  time: "O(hops) per direction",
  space: "O(1)",
  note: "One request, one response — HTTP itself has no concept of a multi-step exchange the way TCP's handshake or DNS's referrals do.",
};

// ─── Real-world behaviour: persistent connections and HTTP caching ──────────
// A browser session is several requests, not one. Two things decide how much of the network it
// really uses: whether the TCP connection is reused (keep-alive) and whether a cached copy can
// answer (or be cheaply revalidated) instead of a full download.

export const CACHE_MAX_AGE = 60; // seconds, sent as Cache-Control: max-age=60

export interface SessionRequest { path: string; at: number } // `at` = seconds since the session started
export interface SessionOptions { keepAlive: boolean; cache: boolean }
export interface SessionSummary { roundTrips: number; bodyBytes: number; networkRequests: number; cacheHits: number; connections: number }

export interface SessionResult { steps: HttpStep[]; summary: SessionSummary }

const etagOf = (path: string) => `"v1-${path === "/" ? "root" : path.slice(1)}"`;

export function sendHttpSession(
  topology: TopologyState,
  clientLabel: string,
  serverLabel: string,
  requests: SessionRequest[],
  opts: SessionOptions
): SessionResult {
  const steps: HttpStep[] = [];
  const summary: SessionSummary = { roundTrips: 0, bodyBytes: 0, networkRequests: 0, cacheHits: 0, connections: 0 };
  const client = findDevice(topology, clientLabel);
  const server = findDevice(topology, serverLabel);
  const base: PacketState = { id: "http-session", layers: [], currentLink: null, progress: 0, atNode: client?.id ?? null, fate: "queued" };
  if (!client || !server) {
    steps.push(st(topology, base, `Device "${!client ? clientLabel : serverLabel}" does not exist.`, 1, "error"));
    return { steps, summary };
  }
  const pathLabels = findPath(topology, clientLabel, serverLabel);
  if (!pathLabels || pathLabels.length < 2) {
    steps.push(st(topology, base, `No path between "${clientLabel}" and "${serverLabel}".`, 1, "error"));
    return { steps, summary };
  }
  const hops = pathLabels.map((l) => findDevice(topology, l)!);

  function travel(pkt: PacketState, label: string, forward: boolean) {
    const path = forward ? hops : [...hops].reverse();
    let p = pkt;
    for (let i = 0; i < path.length - 1; i++) {
      const link = findLink(topology, path[i].id, path[i + 1].id)!;
      p = { ...clonePacket(p), currentLink: link.id, atNode: null, progress: 0, fate: "in-flight" };
      steps.push(st(topology, p, `${label} leaving ${path[i].label}.`, 0));
      for (let f = 1; f <= FRAMES_PER_LINK; f++) {
        p = { ...clonePacket(p), progress: f / FRAMES_PER_LINK };
        steps.push(st(topology, p, `${label} on the wire (${Math.round((f / FRAMES_PER_LINK) * 100)}% of the way).`, 0));
      }
      p = { ...clonePacket(p), atNode: path[i + 1].id, currentLink: null, progress: 0 };
    }
    return p;
  }

  let packet = clonePacket(base);
  let connected = false;
  const cache = new Map<string, { etag: string; storedAt: number; bytes: number }>();

  requests.forEach((req, idx) => {
    const n = idx + 1;
    const where = `Request ${n} (t=${req.at} s): GET ${req.path}.`;
    const entry = opts.cache ? cache.get(req.path) : undefined;

    if (entry && req.at - entry.storedAt < CACHE_MAX_AGE) {
      summary.cacheHits++;
      packet = { ...clonePacket(base), atNode: client.id, fate: "delivered" };
      steps.push(st(topology, packet, `${where} The browser has a copy stored ${req.at - entry.storedAt} s ago and the server said max-age=${CACHE_MAX_AGE}, so it is still FRESH. The page comes straight from the cache: zero packets, zero round trips.`, 3, "found"));
      return;
    }

    const reused = connected;
    if (!connected) {
      summary.connections++;
      summary.roundTrips += 1;
      packet = { ...clonePacket(base), atNode: client.id, fate: "queued" };
      steps.push(st(topology, packet, `${where} No open connection, so TCP first runs its three-way handshake (SYN, SYN-ACK, ACK): one full round trip before a single byte of HTTP can be sent. (On HTTPS, TLS adds another round trip - see the TLS page.)`, 4, "default"));
      connected = true;
    }

    const conditional = !!entry;
    const reqFields: Record<string, string> = { method: "GET", path: req.path, host: server.ip ?? serverLabel, headers: "User-Agent: NetViz/1.0; Accept: text/html" };
    if (conditional) reqFields.ifNoneMatch = entry!.etag;
    packet = { ...clonePacket(base), atNode: client.id, layers: [{ protocol: "HTTP", fields: reqFields }] };
    steps.push(st(topology, packet, conditional
      ? `${where} The cached copy is ${req.at - entry!.storedAt} s old, older than max-age=${CACHE_MAX_AGE}, so it is STALE - but it may still be right. The browser asks the server to REVALIDATE with If-None-Match: ${entry!.etag}.`
      : `${where} Not in the cache, so it is fetched from the server${reused ? " over the connection that is already open (no new handshake)" : ""}.`, 5, "insert"));
    packet = travel(packet, `GET ${req.path}`, true);
    summary.networkRequests++;
    summary.roundTrips += 1;

    const html = PAGES[req.path];
    const etag = etagOf(req.path);
    if (conditional && html && entry!.etag === etag) {
      packet = { ...clonePacket(packet), layers: [{ protocol: "HTTP", fields: { status: 304, statusText: "Not Modified", headers: `ETag: ${etag}; Cache-Control: max-age=${CACHE_MAX_AGE}`, body: "(none)" } }] };
      steps.push(st(topology, packet, `${serverLabel} compares the ETag: it matches, so the page has not changed. It answers 304 Not Modified with NO body - a few hundred bytes instead of the whole page.`, 6, "insert"));
      packet = travel(packet, "304 Not Modified", false);
      cache.set(req.path, { ...entry!, storedAt: req.at });
      packet = { ...clonePacket(packet), fate: "delivered" };
      steps.push(st(topology, packet, `${clientLabel} keeps using its cached copy and restarts its ${CACHE_MAX_AGE} s freshness timer. Saved: ${entry!.bytes} bytes of body.`, 6, "found"));
    } else {
      const status = html ? 200 : 404;
      const body = html ?? "<html><body><h1>404 Not Found</h1></body></html>";
      summary.bodyBytes += body.length;
      const headers = html
        ? `Content-Type: text/html; Content-Length: ${body.length}; ETag: ${etag}; Cache-Control: max-age=${CACHE_MAX_AGE}`
        : `Content-Type: text/html; Content-Length: ${body.length}`;
      packet = { ...clonePacket(packet), layers: [{ protocol: "HTTP", fields: { status, statusText: STATUS_TEXT[status], headers, body } }] };
      steps.push(st(topology, packet, `${serverLabel} responds ${status} ${STATUS_TEXT[status]}${html ? ` with ETag ${etag} and Cache-Control: max-age=${CACHE_MAX_AGE}, which lets the browser reuse the page` : ""}.`, 7, status === 200 ? "insert" : "error"));
      packet = travel(packet, `${status} ${STATUS_TEXT[status]}`, false);
      packet = { ...clonePacket(packet), fate: "delivered" };
      steps.push(st(topology, packet, `${clientLabel} receives the response${html && opts.cache ? " and stores it in the cache" : ""}.`, 7, "found"));
      if (html && opts.cache) cache.set(req.path, { etag, storedAt: req.at, bytes: body.length });
    }

    if (!opts.keepAlive) {
      connected = false;
      steps.push(st(topology, packet, `Without keep-alive the server sends Connection: close and the TCP connection is torn down. The next request must pay for a new handshake.`, 8, "default"));
    }
  });

  steps.push(st(topology, packet, `Session total: ${requests.length} requests, ${summary.networkRequests} went over the network, ${summary.cacheHits} answered from cache, ${summary.connections} TCP connection${summary.connections === 1 ? "" : "s"} opened, ${summary.roundTrips} round trips, ${summary.bodyBytes} body bytes downloaded.`, 0, "found"));
  return { steps, summary };
}

export type SessionScenario = "no-keepalive" | "keepalive" | "cache";

export const SESSION_SCENARIOS: Record<SessionScenario, { label: string; description: string; requests: SessionRequest[]; options: SessionOptions }> = {
  "no-keepalive": {
    label: "New connection per request",
    description: "HTTP/1.0 style: every request opens and closes its own TCP connection.",
    requests: [{ path: "/", at: 0 }, { path: "/about", at: 1 }, { path: "/", at: 2 }],
    options: { keepAlive: false, cache: false },
  },
  keepalive: {
    label: "Keep-alive",
    description: "The same three requests over one persistent connection (the default since HTTP/1.1).",
    requests: [{ path: "/", at: 0 }, { path: "/about", at: 1 }, { path: "/", at: 2 }],
    options: { keepAlive: true, cache: false },
  },
  cache: {
    label: "Caching",
    description: "Load the same page at 0 s, 20 s (fresh: from cache) and 90 s (stale: revalidate, 304).",
    requests: [{ path: "/", at: 0 }, { path: "/", at: 20 }, { path: "/", at: 90 }],
    options: { keepAlive: true, cache: true },
  },
};

export const HTTP_SESSION_CODE: string[] = [
  "function fetch(url):",
  "  entry = cache.get(url);",
  "  if (entry && entry.age < entry.maxAge) return entry.body;   // fresh: no network at all",
  "  if (!connection.open) connection = tcpHandshake(server);    // keep-alive avoids this",
  "  response = send(GET url, entry ? { If-None-Match: entry.etag } : {});",
  "  if (response.status == 304) { entry.age = 0; return entry.body; }   // not modified, no body",
  "  cache.put(url, response, response.maxAge, response.etag);",
  "  if (response.connection == close) connection.close();",
  "  return response.body;",
];

export const HTTP_SESSION_ANNOTATIONS: Record<number, string> = {
  3: "Cache-Control: max-age tells the browser how long it may reuse a response without asking again. Fresh hits cost nothing - the fastest request is the one never sent.",
  4: "Opening a TCP connection costs a full round trip (plus TLS on HTTPS). HTTP/1.1 keep-alive, HTTP/2 multiplexing and HTTP/3 over QUIC all exist to avoid paying it repeatedly.",
  5: "A conditional request lets the server say 'unchanged' in a few hundred bytes. ETag is a fingerprint of the content; Last-Modified / If-Modified-Since works the same way with dates.",
};
