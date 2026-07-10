// Logic smoke test for lib/websocket-engine.ts — run with:
//   npx tsx scripts/verify-websocket.mjs
import { simulateWebSocket } from "../lib/websocket-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const steps = simulateWebSocket();

assert(steps[0].stage === "handshake-request", "Scenario starts with the HTTP upgrade request");
assert(steps[1].stage === "handshake-response", "Second step is the HTTP 101 response");
assert(steps.filter((s) => s.stage === "handshake-request" || s.stage === "handshake-response").length === 2, "Exactly one HTTP request/response pair happens — no repeated handshakes");

const openIndex = steps.findIndex((s) => s.stage === "open");
const messageIndices = steps.map((s, i) => (s.stage === "message" ? i : -1)).filter((i) => i >= 0);
assert(messageIndices.every((i) => i > openIndex), "Every message frame happens only after the connection is marked open");

assert(steps.some((s, i) => s.stage === "message" && s.messageFrom === "server" && steps[i - 1]?.messageFrom === "server"), "At least one server message is NOT an immediate reply to a client message — a genuine unprompted push");

assert(steps[steps.length - 1].stage === "close", "Scenario ends with a close handshake");

console.log("\nAll WebSocket logic checks passed.");
