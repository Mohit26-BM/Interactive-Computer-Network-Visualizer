// Logic smoke test for lib/experiments/diagnostic-lab.ts — run with:
//   npx tsx scripts/verify-diagnostic-lab.mjs
import { simulateDiagnostic } from "../lib/experiments/diagnostic-lab.ts";
import { JOURNEY_STAGES } from "../lib/browser-journey.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const dnsDown = simulateDiagnostic("dns-down");
assert(dnsDown.some((s) => s.stageId === "dhcp" && s.outcome === "ok"), "dns-down: DHCP still succeeds before the failure point");
assert(dnsDown.some((s) => s.stageId === "dns" && s.outcome === "failed"), "dns-down: DNS is the stage that fails");
assert(!dnsDown.some((s) => s.stageId === "arp"), "dns-down: ARP never runs — everything after the failure is absent, not just skipped");
assert(dnsDown[dnsDown.length - 1].explanation.startsWith("Suggested fix:"), "dns-down: ends with an actionable suggestion");

const arpFail = simulateDiagnostic("arp-no-reply");
assert(arpFail.some((s) => s.stageId === "dns" && s.outcome === "ok"), "arp-no-reply: DNS succeeds first");
assert(arpFail.some((s) => s.stageId === "arp" && s.outcome === "failed"), "arp-no-reply: ARP is the stage that fails");
assert(!arpFail.some((s) => s.stageId === "ethernet"), "arp-no-reply: Ethernet never runs");

const gatewayDown = simulateDiagnostic("gateway-down");
assert(gatewayDown.some((s) => s.stageId === "arp" && s.outcome === "ok"), "gateway-down: ARP succeeds (the gateway does answer locally)");
assert(gatewayDown.some((s) => s.stageId === "ip" && s.outcome === "failed"), "gateway-down: IP routing is the stage that fails");

const portClosed = simulateDiagnostic("port-closed");
assert(portClosed.some((s) => s.stageId === "ip" && s.outcome === "ok"), "port-closed: IP routing succeeds");
assert(portClosed.some((s) => s.stageId === "tcp" && s.outcome === "failed"), "port-closed: TCP handshake is the stage that fails");
assert(!portClosed.some((s) => s.stageId === "tls" || s.stageId === "http-request"), "port-closed: nothing above TCP ever runs");

// No scenario should ever reach the final "render" stage — every one is a failure by construction.
for (const scenario of [dnsDown, arpFail, gatewayDown, portClosed]) {
  assert(!scenario.some((s) => s.stageId === "render"), "No diagnostic scenario reaches the final render stage");
}

// Sanity: every failure scenario's failStageId is an actual stage id from browser-journey.ts (no drift between the two files).
const stageIds = new Set(JOURNEY_STAGES.map((s) => s.id));
for (const scenario of [dnsDown, arpFail, gatewayDown, portClosed]) {
  const failedStage = scenario.find((s) => s.outcome === "failed");
  assert(failedStage && stageIds.has(failedStage.stageId), "Each scenario's failure point is a real stage id shared with the Browser Journey page");
}

console.log("\nAll Diagnostic Lab logic checks passed.");
