// Logic smoke test for Phase 5 engines — run with:
//   npx tsx scripts/verify-phase5.mjs
import { buildDefaultTopology, buildDhcpTopology, buildDnsTopology } from "../lib/topology-engine.ts";
import { runDhcp } from "../lib/dhcp-engine.ts";
import { resolveDns } from "../lib/dns-engine.ts";
import { sendHttpRequest } from "../lib/http-engine.ts";
import { tlsHandshake, sendEncryptedHttp, visibilityComparison } from "../lib/tls-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- DHCP: client starts with no IP, ends up configured after DORA ---
const dhcpTopo = buildDhcpTopology();
const client0 = dhcpTopo.devices.find((d) => d.label === "PC-NEW");
assert(client0.ip === undefined, "PC-NEW starts with no IP address at all");

const dhcpSteps = runDhcp(dhcpTopo, "PC-NEW", "DHCP-1");
const discoverStep = dhcpSteps.find((s) => s.packet.layers.some((l) => l.fields.messageType === "DHCPDISCOVER"));
assert(!!discoverStep, "A DHCPDISCOVER is broadcast");
const finalClient = dhcpSteps[dhcpSteps.length - 1].topology.devices.find((d) => d.label === "PC-NEW");
assert(finalClient.ip === "192.168.1.50", "PC-NEW ends up configured with the offered/leased IP");
const renewAckSteps = dhcpSteps.filter((s) => s.packet.layers.some((l) => l.fields.messageType === "DHCPACK"));
assert(renewAckSteps.length >= 2, "At least two distinct DHCPACK events occur (initial lease + renewal)");

// --- DNS: cache miss walks the full hierarchy, cache hit skips it entirely ---
const dnsTopo = buildDnsTopology();
const missResult = resolveDns(dnsTopo, {}, "PC-1", "RESOLVER", "google.com");
// Layers persist unchanged across every hop-travel sub-step, so dedupe by the
// distinct referral target rather than counting steps (which would overcount).
const referralTargets = new Set(
  missResult.steps
    .map((s) => s.packet.layers.find((l) => l.fields.referral)?.fields.referral)
    .filter(Boolean)
);
assert(referralTargets.size === 2, "A cache miss produces exactly 2 distinct referrals (root -> TLD -> authoritative): got " + referralTargets.size);
assert(missResult.cache["google.com"]?.ip, "The resolver's cache is populated after a successful miss-path resolution");

const hitResult = resolveDns(dnsTopo, missResult.cache, "PC-1", "RESOLVER", "google.com");
const hitReferralSteps = hitResult.steps.filter((s) => s.packet.layers.some((l) => l.fields.referral));
assert(hitReferralSteps.length === 0, "A cache hit makes zero referral hops");
assert(hitResult.steps.some((s) => /Cache hit/.test(s.explanation)), "A cache hit step explicitly says so");
const finalAnswer = hitResult.steps[hitResult.steps.length - 1].packet.layers.find((l) => l.protocol === "DNS")?.fields.ip;
assert(finalAnswer === missResult.cache["google.com"].ip, "Cache hit returns the exact same IP the miss path originally cached");

// --- HTTP: 200 for a real page, 404 for a missing one, POST carries a body ---
const httpTopo = buildDefaultTopology();
const okSteps = sendHttpRequest(httpTopo, "PC-1", "SRV-1", "GET", "/", undefined);
const okResponse = okSteps.find((s) => s.packet.layers[0]?.fields.status);
assert(okResponse.packet.layers[0].fields.status === 200, "GET / responds 200");

const missSteps = sendHttpRequest(httpTopo, "PC-1", "SRV-1", "GET", "/missing", undefined);
const missResponse = missSteps.find((s) => s.packet.layers[0]?.fields.status);
assert(missResponse.packet.layers[0].fields.status === 404, "GET /missing responds 404");

const postSteps = sendHttpRequest(httpTopo, "PC-1", "SRV-1", "POST", "/", "name=visitor");
const postRequest = postSteps.find((s) => s.packet.layers[0]?.fields.method === "POST");
assert(postRequest.packet.layers[0].fields.body === "name=visitor", "POST request carries the body");

// --- TLS: handshake reaches ESTABLISHED, encrypted HTTP hides the method/path/host ---
const tlsSteps = tlsHandshake(httpTopo, "PC-1", "SRV-1");
assert(tlsSteps[tlsSteps.length - 1].sessionState === "ESTABLISHED", "TLS handshake ends with the session ESTABLISHED");
assert(tlsSteps.some((s) => s.packet.layers.some((l) => l.fields.message === "Certificate")), "A Certificate message is exchanged");

const encryptedSteps = sendEncryptedHttp(httpTopo, "PC-1", "SRV-1");
const encryptedHttpLayer = encryptedSteps[0].packet.layers.find((l) => l.protocol.startsWith("HTTP"));
assert(encryptedHttpLayer.fields.method !== "GET" && String(encryptedHttpLayer.fields.method).includes("hidden"), "The encrypted HTTP layer doesn't expose the real method in the clear");

const comparison = visibilityComparison();
assert(comparison.plaintext[0].fields.method === "GET", "The plaintext comparison shows the real method");
assert(comparison.encrypted.some((l) => l.protocol === "TLS"), "The encrypted comparison is wrapped in a TLS layer");
assert(comparison.encrypted.find((l) => l.protocol.startsWith("HTTP")).fields.host !== "example.com", "The encrypted comparison's HTTP layer doesn't expose the real host");

console.log("\nAll Phase 5 logic checks passed.");
