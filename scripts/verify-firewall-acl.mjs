// Logic smoke test for lib/firewall-engine.ts — run with:
//   npx tsx scripts/verify-firewall-acl.mjs
import { checkPacket, ACL_RULES, PRESET_PACKETS } from "../lib/firewall-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const https = checkPacket(ACL_RULES, PRESET_PACKETS.find((p) => p.label === "HTTPS request"));
assert(https[https.length - 1].outcome === "permit", "HTTPS (tcp/443) is permitted by rule 1");

const ping = checkPacket(ACL_RULES, PRESET_PACKETS.find((p) => p.label === "Ping (ICMP)"));
assert(ping[ping.length - 1].outcome === "deny", "ICMP ping is denied by rule 3");

const dns = checkPacket(ACL_RULES, PRESET_PACKETS.find((p) => p.label === "DNS query (UDP 53)"));
assert(dns[dns.length - 1].outcome === "deny", "UDP/53 matches no rule and falls through to the implicit deny");
assert(dns[dns.length - 1].ruleIndex === null, "The implicit deny outcome isn't attributed to any specific rule index");

// First-match-wins: reordering so deny-icmp comes before permit-https must not change the HTTPS outcome.
const reordered = [ACL_RULES[2], ACL_RULES[0], ACL_RULES[1], ACL_RULES[3]];
const httpsReordered = checkPacket(reordered, PRESET_PACKETS.find((p) => p.label === "HTTPS request"));
assert(httpsReordered[httpsReordered.length - 1].outcome === "permit", "Reordering rules that don't match HTTPS doesn't change its outcome");

// A packet matching two rules only ever sees the first one apply.
const shadowRules = [
  { id: 1, action: "deny", protocol: "tcp", port: 80, description: "deny tcp any host SRV-1 eq 80" },
  { id: 2, action: "permit", protocol: "tcp", port: 80, description: "permit tcp any host SRV-1 eq 80" },
];
const shadowed = checkPacket(shadowRules, { label: "HTTP request", protocol: "tcp", port: 80 });
assert(shadowed[shadowed.length - 1].outcome === "deny", "When two rules both match, only the first one (by list order) determines the outcome");
assert(shadowed[shadowed.length - 1].ruleIndex === 0, "The matching rule is correctly identified as rule index 0, not the later shadowed one");

console.log("\nAll Firewall & ACL logic checks passed.");
