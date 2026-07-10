// Logic smoke test for lib/email-engine.ts — run with:
//   npx tsx scripts/verify-email.mjs
import { simulateSmtp, simulatePop3, simulateImap } from "../lib/email-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

const smtp = simulateSmtp();
assert(smtp.some((s) => s.command?.startsWith("MAIL FROM")), "SMTP transcript includes MAIL FROM");
assert(smtp.some((s) => s.command?.startsWith("RCPT TO")), "SMTP transcript includes RCPT TO");
assert(smtp.some((s) => s.command === "DATA"), "SMTP transcript includes the DATA command");
assert(smtp[smtp.length - 1].command === "QUIT", "SMTP transcript ends with QUIT");

const pop3 = simulatePop3();
assert(pop3.some((s) => s.command?.startsWith("DELE")), "POP3 transcript deletes the message after retrieving it");
const pop3Final = pop3[pop3.length - 1];
assert(pop3Final.mailboxState?.includes("1 message"), "POP3's final mailbox state reflects one message removed");

const imap = simulateImap();
assert(!imap.some((s) => s.command?.startsWith("DELE") || s.command?.includes("EXPUNGE")), "IMAP transcript never deletes anything from the server");
assert(imap.some((s) => s.command?.includes("STORE") && s.command.includes("Seen")), "IMAP transcript flags a message as Seen instead of removing it");
const imapFinal = imap[imap.length - 1];
assert(imapFinal.mailboxState?.includes("2 messages"), "IMAP's final mailbox state still shows both messages present on the server");

console.log("\nAll Email Protocols logic checks passed.");
