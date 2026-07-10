// Logic smoke test for lib/wireless-engine.ts — run with:
//   npx tsx scripts/verify-wireless.mjs
import { simulateAssociation, simulateHiddenNode } from "../lib/wireless-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const assoc = simulateAssociation("TestNet");
assert(assoc[0].stage === "beacon", "Association starts with the AP's beacon");
assert(assoc.some((s) => s.stage === "auth"), "Association includes an authentication stage");
assert(assoc[assoc.length - 2].stage === "assoc", "Association reaches the associate stage before data flows");
assert(assoc.every((s) => s.explanation.length > 0), "Every association step has a non-empty explanation");

const noRtsCts = simulateHiddenNode(false);
const lastNo = noRtsCts[noRtsCts.length - 1];
assert(lastNo.outcome === "collision", "Without RTS/CTS, two hidden stations sending simultaneously collide at the AP");
assert(lastNo.aSending && lastNo.cSending, "Both stations are shown sending at the moment of collision");

const withRtsCts = simulateHiddenNode(true);
const lastYes = withRtsCts[withRtsCts.length - 1];
assert(lastYes.outcome === "success", "With RTS/CTS enabled, the same scenario succeeds instead of colliding");
assert(withRtsCts.some((s) => s.ctsIssued), "RTS/CTS scenario actually issues a CTS at some step");
assert(!(lastYes.aSending && lastYes.cSending), "With RTS/CTS, the two stations are never shown sending simultaneously");

console.log("\nAll Wireless Networking logic checks passed.");
