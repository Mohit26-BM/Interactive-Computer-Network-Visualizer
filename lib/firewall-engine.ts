import { Step } from "./types";

// Firewall and ACL are the same reasoning pattern: a sequential rule list,
// checked top to bottom, first match wins, implicit deny at the end if
// nothing matched. That's the entire mechanism — no path-finding, no
// forwarding decision, just permit/deny. One engine covers both framings.

export type FirewallAction = "permit" | "deny";
export type FirewallProtocol = "tcp" | "udp" | "icmp" | "any";

export interface FirewallRule {
  id: number;
  action: FirewallAction;
  protocol: FirewallProtocol;
  port?: number; // undefined = any port
  description: string;
}

export interface PacketDescriptor {
  label: string;
  protocol: "tcp" | "udp" | "icmp";
  port?: number;
}

export interface FirewallStep extends Step {
  ruleIndex: number | null; // which rule is being checked this step; null before the loop or at the final outcome
  matched: boolean | null;
  outcome: FirewallAction | null;
}

// A small, realistic ACL guarding SRV-1: HTTPS/HTTP explicitly permitted,
// ICMP explicitly denied, SSH permitted — everything else falls through to
// the implicit deny every real ACL ends with, written or not.
export const ACL_RULES: FirewallRule[] = [
  { id: 1, action: "permit", protocol: "tcp", port: 443, description: "permit tcp any host SRV-1 eq 443 (HTTPS)" },
  { id: 2, action: "permit", protocol: "tcp", port: 80, description: "permit tcp any host SRV-1 eq 80 (HTTP)" },
  { id: 3, action: "deny", protocol: "icmp", description: "deny icmp any any (block ping)" },
  { id: 4, action: "permit", protocol: "tcp", port: 22, description: "permit tcp any host SRV-1 eq 22 (SSH)" },
];

export const PRESET_PACKETS: PacketDescriptor[] = [
  { label: "HTTPS request", protocol: "tcp", port: 443 },
  { label: "HTTP request", protocol: "tcp", port: 80 },
  { label: "SSH connection", protocol: "tcp", port: 22 },
  { label: "Ping (ICMP)", protocol: "icmp" },
  { label: "DNS query (UDP 53)", protocol: "udp", port: 53 },
];

function matches(rule: FirewallRule, packet: PacketDescriptor): boolean {
  if (rule.protocol !== "any" && rule.protocol !== packet.protocol) return false;
  if (rule.port !== undefined && rule.port !== packet.port) return false;
  return true;
}

export function checkPacket(rules: FirewallRule[], packet: PacketDescriptor): FirewallStep[] {
  const steps: FirewallStep[] = [];

  steps.push({
    explanation: `A ${packet.protocol.toUpperCase()} packet from ${packet.label}${packet.port !== undefined ? ` (port ${packet.port})` : ""} arrives at the firewall. The ACL is checked top to bottom — first match wins.`,
    highlightLine: 1, ruleIndex: null, matched: null, outcome: null,
  });

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const isMatch = matches(rule, packet);
    steps.push({
      explanation: `Rule ${rule.id}: "${rule.description}". ${isMatch ? `Matches this packet.` : "Doesn't match — checking the next rule."}`,
      highlightLine: 2, ruleIndex: i, matched: isMatch, outcome: null,
      phase: isMatch ? undefined : "default",
    });

    if (isMatch) {
      steps.push({
        explanation: `Rule ${rule.id} matched first, so evaluation stops here — every rule after it is irrelevant for this packet. Result: ${rule.action === "permit" ? "PERMITTED" : "DENIED"}.`,
        highlightLine: 3, ruleIndex: i, matched: true, outcome: rule.action,
        phase: rule.action === "permit" ? "insert" : "error",
      });
      return steps;
    }
  }

  steps.push({
    explanation: `No rule matched. The implicit deny every ACL ends with — written or not — takes over: the packet is DENIED by default.`,
    highlightLine: 4, ruleIndex: null, matched: false, outcome: "deny", phase: "error",
  });
  return steps;
}

export const FIREWALL_CODE: string[] = [
  "function checkPacket(rules, packet) {",
  "  for (const rule of rules) {",
  "    if (matches(rule, packet)) return rule.action; // first match wins — stop immediately",
  "  }",
  "  return 'deny'; // implicit deny — the ACL's silent final rule",
  "}",
];

export const FIREWALL_ANNOTATIONS: Record<number, string> = {
  1: "A firewall/ACL never chooses a path the way a router does — it only ever answers permit or deny.",
  2: "Rules are checked strictly in order. A rule further down the list that would also match never gets the chance to run.",
  3: "This is the most common real-world ACL mistake: an early, overly broad rule accidentally shadowing a more specific rule listed after it.",
  4: "Every ACL ends with an implicit deny, whether you wrote one or not — silence is not permission.",
};

export const FIREWALL_COMPLEXITY = {
  time: "O(rules) worst case — one linear scan until a match or the end of the list",
  space: "O(1)",
  note: "Rule order is a correctness property, not a style choice — reordering two rules can silently change which packets get through.",
};
