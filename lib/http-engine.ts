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
