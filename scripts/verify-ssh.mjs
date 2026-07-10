// Logic smoke test for lib/ssh-engine.ts — run with:
//   npx tsx scripts/verify-ssh.mjs
import { simulateSsh } from "../lib/ssh-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const steps = simulateSsh("publickey", true);

assert(steps[0].stage === "banner" && !steps[0].encrypted, "The version banner exchange happens before encryption starts");
const kexStep = steps.find((s) => s.stage === "kex");
assert(kexStep && kexStep.encrypted, "The channel is marked encrypted starting at key exchange");
const authSteps = steps.filter((s) => s.stage === "auth");
assert(authSteps.every((s) => s.encrypted), "Every authentication step happens inside the already-encrypted channel");
assert(steps[steps.length - 1].stage === "shell" && steps[steps.length - 1].encrypted, "The session ends with an encrypted shell channel open");

const firstConn = simulateSsh("password", true);
assert(firstConn.some((s) => s.stage === "hostkey" && s.phase === "error"), "First connection to a host triggers a Trust-On-First-Use warning");

const knownConn = simulateSsh("password", false);
assert(!knownConn.some((s) => s.stage === "hostkey" && s.phase === "error"), "A known host's key check does not trigger the TOFU warning");

const pubkeySteps = simulateSsh("publickey", false).filter((s) => s.stage === "auth");
const passwordSteps = simulateSsh("password", false).filter((s) => s.stage === "auth");
assert(pubkeySteps.length !== passwordSteps.length || pubkeySteps.some((s, i) => s.explanation !== passwordSteps[i]?.explanation), "Public-key and password authentication produce genuinely different transcripts");

console.log("\nAll SSH logic checks passed.");
