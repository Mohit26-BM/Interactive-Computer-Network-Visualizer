import { Step } from "./types";

// Sending is always SMTP, no matter what. Retrieving is a choice: POP3
// downloads and (by default) deletes from the server; IMAP leaves mail on
// the server and keeps every device's view in sync. One engine, three
// command/response transcripts — the protocols are simple enough that a
// full packet/header model would be overkill; the command exchange itself
// is the entire teaching point.

export type EmailMode = "smtp" | "pop3" | "imap";

export interface EmailStep extends Step {
  command?: string;
  response?: string;
  mailboxState?: string; // what the server-side mailbox looks like after this step
}

function e(explanation: string, hl: number, command?: string, response?: string, mailboxState?: string, phase?: string): EmailStep {
  return { explanation, highlightLine: hl, command, response, mailboxState, phase };
}

export function simulateSmtp(): EmailStep[] {
  return [
    e("Client opens a TCP connection to the mail server on port 25 (or 587 for authenticated submission) and greets it.", 1, "EHLO mail.example.com", "250 mail.example.com Hello"),
    e("Client declares who the message is from.", 2, "MAIL FROM:<alice@example.com>", "250 OK"),
    e("Client declares who it's for — a separate command from the From address, which is why SMTP can BCC without the To address ever hinting at it.", 3, "RCPT TO:<bob@example.org>", "250 OK"),
    e("Client signals it's about to send the message body.", 4, "DATA", "354 End data with <CR><LF>.<CR><LF>"),
    e("The message headers and body are sent as plain text, terminated by a line containing only a single period.", 5, "Subject: Hello\\r\\n\\r\\nHi Bob, ...\\r\\n.", "250 OK: queued as 4A1B2C"),
    e("Server accepts and queues the message for delivery — possibly relaying through further SMTP hops before it reaches bob@example.org's actual mailbox.", 6, "QUIT", "221 Bye", undefined, "insert"),
  ];
}

export function simulatePop3(): EmailStep[] {
  return [
    e("Client connects and authenticates — two separate commands, sent as plain text unless wrapped in TLS.", 1, "USER bob", "+OK"),
    e("Password.", 2, "PASS hunter2", "+OK logged in"),
    e("Client asks what's in the mailbox.", 3, "LIST", "+OK 2 messages (1) 512 bytes (2) 1024 bytes", "2 messages on server"),
    e("Client downloads message 1 in full.", 4, "RETR 1", "+OK 512 octets\\n<message 1 content>"),
    e("Client marks message 1 for deletion — POP3's defining behavior: once downloaded, the server copy is normally removed.", 5, "DELE 1", "+OK message 1 deleted", "message 1 marked for deletion", "error"),
    e("QUIT commits the deletions. If this client checks mail from a second device later, message 1 is simply gone — it only ever lived on the first device after this point.", 6, "QUIT", "+OK POP3 server signing off", "1 message remains on server", "insert"),
  ];
}

export function simulateImap(): EmailStep[] {
  return [
    e("Client connects and authenticates.", 1, "a1 LOGIN bob hunter2", "a1 OK LOGIN completed"),
    e("Unlike POP3, IMAP organizes mail into folders/mailboxes that the client must explicitly select.", 2, "a2 SELECT INBOX", "a2 OK [READ-WRITE] 2 messages"),
    e("Client fetches message 1 — but this is a copy, not a removal.", 3, "a3 FETCH 1 BODY[]", "a3 OK <message 1 content>"),
    e("Client marks the message as read — a flag stored on the server, not a local-only fact.", 4, "a4 STORE 1 +FLAGS (\\\\Seen)", "a4 OK STORE completed", "message 1 flagged \\\\Seen, still on server"),
    e("The message is still on the server. A second device logging in later sees the exact same mailbox, including the \\\\Seen flag — that's IMAP's entire value proposition over POP3.", 5, "a5 LOGOUT", "a5 OK LOGOUT completed", "2 messages remain on server, synced", "insert"),
  ];
}

export const EMAIL_CODE: Record<EmailMode, string[]> = {
  smtp: [
    "client.connect(port=25);",
    "client.send('EHLO ' + clientDomain);",
    "client.send('MAIL FROM:<' + sender + '>');",
    "client.send('RCPT TO:<' + recipient + '>');",
    "client.send('DATA'); client.sendBody(headers, body, '.');",
    "client.send('QUIT'); // server now owns delivery/relay",
  ],
  pop3: [
    "client.send('USER ' + username); client.send('PASS ' + password);",
    "const list = client.send('LIST');",
    "for (msg of list) {",
    "  const body = client.send('RETR ' + msg.id);",
    "  client.send('DELE ' + msg.id);   // marks for deletion — the default behavior",
    "}",
    "client.send('QUIT');               // commits deletions — server copy is now gone",
  ],
  imap: [
    "client.send('LOGIN ' + username + ' ' + password);",
    "client.send('SELECT INBOX');",
    "const body = client.send('FETCH 1 BODY[]');   // a copy, nothing deleted",
    "client.send('STORE 1 +FLAGS (\\\\Seen)');       // server-side flag, visible to every client",
    "client.send('LOGOUT');                          // mailbox state unchanged, still on server",
  ],
};

export const EMAIL_ANNOTATIONS: Record<EmailMode, Record<number, string>> = {
  smtp: {
    3: "MAIL FROM and RCPT TO are independent — envelope routing is separate from whatever the message's own From/To headers say.",
    5: "The lone-period terminator is why a message body containing a line with just \".\" has to be escaped (\"dot-stuffed\") before sending.",
    6: "SMTP only guarantees delivery to the next hop's mail server — from there it may relay through several more SMTP servers before reaching an actual mailbox.",
  },
  pop3: {
    5: "This is the crux of POP3: retrieval and deletion are coupled by default. Some clients configure \"leave a copy on server,\" but that's an option layered on top, not POP3's baseline behavior.",
    6: "Because deletion already happened, a second device connecting later has no way to see message 1 — POP3 has no concept of a shared, synced mailbox state.",
  },
  imap: {
    2: "SELECT is why IMAP supports multiple folders naturally (Inbox, Sent, Archive, ...) while POP3 effectively only understands one flat inbox.",
    4: "Flags like \\Seen live on the server, which is exactly how \"read on your phone, already marked read on your laptop\" works.",
    5: "Nothing was removed from the server at any point in this whole exchange — that's the entire structural difference from POP3.",
  },
};

export const EMAIL_COMPLEXITY = {
  time: "O(1) per command — a fixed request/response protocol",
  space: "O(1) client-side (SMTP), O(mailbox size) server-side (POP3/IMAP)",
  note: "The real-world tradeoff isn't computational complexity — it's where the mailbox's authoritative state lives: nowhere after POP3 downloads it, or permanently on the server with IMAP.",
};
