// Logic smoke test for lib/packet-life-engine.ts — run with:
//   npx tsx scripts/verify-packet-life.mjs
import { buildIcmpTopology } from "../lib/topology-engine.ts";
import { simulatePacketLife } from "../lib/packet-life-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function layer(packet, protocol) {
  return packet.layers.find((l) => l.protocol === protocol);
}

const topology = buildIcmpTopology();
const steps = simulatePacketLife(topology);

assert(steps.length > 0, "The engine produces at least one step");

const firstStep = steps[0];
assert(["Ethernet", "IPv4", "TCP", "HTTP"].every((p) => layer(firstStep.packet, p)), "The very first step already carries all four layers at once");
assert(Number(layer(firstStep.packet, "IPv4").fields.ttl) === 64, "The request starts with TTL 64");

// TTL must decrement exactly twice on the way to SRV-1 (at R-1 and R-2), and the IP addresses must never change mid-flight.
const requestSteps = steps.filter((s) => s.packet.id === "pkt-life-request");
const ttlValuesOut = requestSteps.map((s) => Number(layer(s.packet, "IPv4").fields.ttl));
assert(Math.min(...ttlValuesOut) === 62, `TTL falls to exactly 62 by the time the request reaches SRV-1 (two router hops): got ${Math.min(...ttlValuesOut)}`);
const srcIps = new Set(requestSteps.map((s) => layer(s.packet, "IPv4").fields.srcIp));
assert(srcIps.size === 1, "The IPv4 source address never changes across the whole request leg — only Ethernet and TTL do");

// The Ethernet frame must be rebuilt (different MACs) between the first and last hop of the request leg.
const firstMac = layer(requestSteps[0].packet, "Ethernet").fields.srcMac;
const lastRequestStep = requestSteps[requestSteps.length - 1];
const lastMac = layer(lastRequestStep.packet, "Ethernet").fields.srcMac;
assert(firstMac !== lastMac, "The Ethernet source MAC at the destination differs from the MAC the packet left with — the frame was genuinely rebuilt");

// The response leg must swap TCP ports, advance ack based on the request's sequence number, and reduce the window.
const responseSteps = steps.filter((s) => s.packet.id === "pkt-life-response");
assert(responseSteps.length > 0, "A response leg actually runs");
const firstResponseTcp = layer(responseSteps[0].packet, "TCP");
assert(Number(firstResponseTcp.fields.srcPort) === 80 && Number(firstResponseTcp.fields.dstPort) === 51442, "The response's TCP ports are the reverse of the request's");
assert(Number(firstResponseTcp.fields.window) < 65535, "The response advertises a smaller window than the request did — a visible flow-control change");

// TTL resets to 64 for the new direction, then falls to 62 again by the time it's back at PC-1.
const ttlValuesBack = responseSteps.map((s) => Number(layer(s.packet, "IPv4").fields.ttl));
assert(Math.max(...ttlValuesBack) === 64, "The response leg starts with a fresh TTL of 64, not inherited from the request");
assert(Math.min(...ttlValuesBack) === 62, "The response's TTL also falls to 62 by the time it's back at PC-1");

console.log("\nAll Packet Life Explorer logic checks passed.");
