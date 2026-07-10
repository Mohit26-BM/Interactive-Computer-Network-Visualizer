import { Step } from "./types";

// WebSocket: one ordinary HTTP request asks to switch protocols, then the
// *same* TCP connection carries frames in both directions indefinitely —
// no more request/response pairing, and critically, the server can send
// unprompted. That last part is what plain HTTP structurally cannot do.

export type WsStage = "handshake-request" | "handshake-response" | "open" | "message" | "close";

export interface WebSocketStep extends Step {
  stage: WsStage;
  messageFrom?: "client" | "server";
  messageText?: string;
}

function w(explanation: string, hl: number, stage: WsStage, messageFrom?: "client" | "server", messageText?: string, phase?: string): WebSocketStep {
  return { explanation, highlightLine: hl, stage, messageFrom, messageText, phase };
}

export function simulateWebSocket(): WebSocketStep[] {
  return [
    w(`Client sends an ordinary HTTP GET request — but with Upgrade: websocket, Connection: Upgrade, and a Sec-WebSocket-Key header. It's asking the server to repurpose this same TCP connection.`, 1, "handshake-request", "client", "GET /chat HTTP/1.1\nUpgrade: websocket\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="),
    w(`Server replies HTTP 101 Switching Protocols with Sec-WebSocket-Accept (derived from the client's key) — confirming the upgrade instead of a normal 200 response.`, 2, "handshake-response", "server", "HTTP/1.1 101 Switching Protocols\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="),
    w(`The connection is now upgraded. This is the same TCP socket the HTTP request used — no new connection was opened, and from here on there are no more HTTP request/response pairs at all.`, 3, "open", undefined, undefined, "insert"),
    w(`Client sends a WebSocket data frame — a message, not a request. There's no HTTP verb, no headers repeated, no status code to wait for.`, 4, "message", "client", "{ \"type\": \"join\", \"room\": \"lobby\" }"),
    w(`Server replies with its own frame right away.`, 4, "message", "server", "{ \"type\": \"joined\", \"users\": 3 }"),
    w(`Server sends a frame the client never asked for — a genuine push. Over plain HTTP this would require polling or a workaround; over WebSocket it's just... sending a frame, because the connection is already open in both directions.`, 5, "message", "server", "{ \"type\": \"message\", \"from\": \"alice\", \"text\": \"hey!\" }"),
    w(`Either side can end the session: client sends a Close frame, server replies with its own Close frame, and only then does the underlying TCP connection actually close.`, 6, "close", "client", "Close(1000, \"done\")", "error"),
  ];
}

export const WEBSOCKET_CODE: string[] = [
  "// Handshake — exactly one HTTP request/response pair",
  "client.send(GET, { Upgrade: 'websocket', 'Sec-WebSocket-Key': key });",
  "server.reply(101, { 'Sec-WebSocket-Accept': accept(key) });",
  "",
  "// From here on: full-duplex frames on the same TCP socket, no HTTP left",
  "socket.on('message', frame => handle(frame));  // either side, any time",
  "socket.send(frame);                             // no request/response pairing",
  "",
  "// Teardown",
  "socket.send(CLOSE); // await CLOSE in reply, then the TCP connection ends",
];

export const WEBSOCKET_ANNOTATIONS: Record<number, string> = {
  1: "This one request is the entire reason WebSocket can start from an ordinary web server and firewall rules that already allow HTTP — it looks like HTTP until this exact moment.",
  2: "101 means \"I agree to stop speaking HTTP on this connection\" — every byte after this response is WebSocket framing, not HTTP.",
  3: "No second TCP handshake, no new port — the exact same socket that carried the HTTP request now carries WebSocket frames instead.",
  4: "Compare this to HTTP: every HTTP exchange needs a fresh request to get a fresh response. Here, either side just writes a frame whenever it wants.",
  5: "This is the single capability plain HTTP cannot offer without a workaround (long polling, Server-Sent Events) — a server-initiated message with no preceding request.",
  6: "The Close handshake exists so both sides agree the conversation ended cleanly, rather than one side abruptly dropping the TCP connection mid-frame.",
};

export const WEBSOCKET_COMPLEXITY = {
  time: "O(1) handshake, then O(1) per frame",
  space: "O(1) per open connection (just socket state — no request/response bookkeeping)",
  note: "The saving isn't computational — it's eliminating repeated HTTP header overhead and round-trips for every single message once the connection is already open.",
};
