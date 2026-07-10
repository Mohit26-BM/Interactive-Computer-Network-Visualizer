import { Step } from "./types";

// ─── Error Detection: CRC, Internet Checksum, Parity ────────────────────────
// Every page in this project has been showing a `checksum: 0x...` or `crc:
// ...` field as decoration — this is where those fields finally become
// something you can compute by hand instead of an opaque hex string.
// One unified Step envelope covers all three algorithms so the page can
// share a single usePlayer/timeline regardless of which mode is running.

export type ErrorDetectionMode = "crc" | "checksum" | "parity";

export interface ErrorDetectionStep extends Step {
  mode: ErrorDetectionMode;
  bits?: string;       // CRC: the full working register at this step
  position?: number;   // CRC: index of the leading bit being examined
  words?: number[];     // Checksum: the words summed so far (for display)
  sum?: number;         // Checksum: running sum (before end-around carry is folded in, shown post-fold)
  wordIndex?: number;   // Checksum: which word this step just added
  dataBits?: string;    // Parity: the original data bits
  parityBit?: 0 | 1;    // Parity: the computed/appended bit
}

function st(mode: ErrorDetectionMode, explanation: string, hl: number, phase: string | undefined, extra: Partial<ErrorDetectionStep>): ErrorDetectionStep {
  return { mode, explanation, highlightLine: hl, phase, ...extra };
}

// ─── CRC — mod-2 binary long division ───────────────────────────────────────
// The classic manual algorithm: append (degree) zero bits, then repeatedly
// XOR the polynomial into the working register wherever the leading bit is
// 1. What's left after processing every bit is the CRC.

export function computeCrc(message: string, polynomial: string): ErrorDetectionStep[] {
  const steps: ErrorDetectionStep[] = [];
  const degree = polynomial.length - 1;

  if (!/^[01]+$/.test(message) || !/^1[01]*$/.test(polynomial)) {
    steps.push(st("crc", "Message and polynomial must be binary (0/1), and the polynomial must start with 1.", 1, "error", {}));
    return steps;
  }

  const bits = (message + "0".repeat(degree)).split("");
  steps.push(st("crc", `Append ${degree} zero bits (the polynomial's degree) to the message: ${bits.join("")}`, 1, undefined, { bits: bits.join(""), position: 0 }));

  for (let i = 0; i < message.length; i++) {
    if (bits[i] === "1") {
      for (let j = 0; j <= degree; j++) {
        bits[i + j] = String(Number(bits[i + j]) ^ Number(polynomial[j]));
      }
      steps.push(st("crc", `Position ${i}: leading bit is 1 — XOR the polynomial ${polynomial} into the register.`, 2, "insert", { bits: bits.join(""), position: i }));
    } else {
      steps.push(st("crc", `Position ${i}: leading bit is 0 — bring down the next bit, no XOR needed.`, 3, undefined, { bits: bits.join(""), position: i }));
    }
  }

  const remainder = bits.slice(message.length).join("");
  steps.push(st("crc", `Done. The final ${degree} bits are the CRC remainder: ${remainder}. This gets appended to the original message before it's sent.`, 4, "found", { bits: bits.join(""), position: message.length }));

  return steps;
}

// Receiver-side check: does (received message + CRC) divide evenly (remainder
// all zero) by the same polynomial? If not, at least one bit was corrupted.
export function verifyCrc(receivedWithCrc: string, polynomial: string): { steps: ErrorDetectionStep[]; ok: boolean } {
  const steps = computeCrc(receivedWithCrc, polynomial);
  const last = steps[steps.length - 1];
  const remainder = last?.bits?.slice(receivedWithCrc.length) ?? "";
  const ok = /^0*$/.test(remainder);
  steps.push(st("crc", ok ? `Remainder is all zero — no error detected.` : `Remainder is ${remainder}, not zero — the received data is corrupted.`, 5, ok ? "found" : "error", {}));
  return { steps, ok };
}

// ─── Internet Checksum — one's complement sum with end-around carry ───────
// The exact algorithm IPv4, UDP, and TCP all use for their own checksum
// field: sum 16-bit words, fold any overflow back in (end-around carry),
// then take the one's complement of the result.

export function computeChecksum(words: number[]): ErrorDetectionStep[] {
  const steps: ErrorDetectionStep[] = [];
  let sum = 0;
  const seen: number[] = [];

  steps.push(st("checksum", `Summing ${words.length} sixteen-bit words: ${words.map((w) => "0x" + w.toString(16).toUpperCase()).join(", ")}`, 1, undefined, { words: [], sum: 0 }));

  words.forEach((w, i) => {
    sum += w;
    if (sum > 0xffff) {
      const carry = sum >> 16;
      sum = (sum & 0xffff) + carry;
      seen.push(w);
      steps.push(st("checksum", `Add word ${i + 1} (0x${w.toString(16).toUpperCase()}) — overflowed 16 bits, so the carry wraps back around (end-around carry). Running sum: 0x${sum.toString(16).toUpperCase()}.`, 2, "insert", { words: [...seen], sum, wordIndex: i }));
    } else {
      seen.push(w);
      steps.push(st("checksum", `Add word ${i + 1} (0x${w.toString(16).toUpperCase()}). Running sum: 0x${sum.toString(16).toUpperCase()}.`, 2, undefined, { words: [...seen], sum, wordIndex: i }));
    }
  });

  const checksum = ~sum & 0xffff;
  steps.push(st("checksum", `Final sum is 0x${sum.toString(16).toUpperCase()}. The checksum is its one's complement: 0x${checksum.toString(16).toUpperCase()}.`, 3, "found", { words: seen, sum: checksum }));

  return steps;
}

// Receiver-side check: add the checksum itself into the sum of the received
// words — if nothing was corrupted, the total is all 1s (0xFFFF).
export function verifyChecksum(receivedWords: number[], checksum: number): { steps: ErrorDetectionStep[]; ok: boolean } {
  const steps = computeChecksum([...receivedWords, checksum]);
  const last = steps[steps.length - 1];
  const finalSum = last?.sum ?? 0;
  const ok = finalSum === 0xffff || finalSum === 0; // one's-complement of 0xFFFF is 0 — both mean "all ones before complementing"
  steps.push(st("checksum", ok ? `Sum of received words + checksum is all ones (0xFFFF) — no error detected.` : `Sum of received words + checksum is 0x${finalSum.toString(16).toUpperCase()}, not all ones — the data is corrupted.`, 4, ok ? "found" : "error", {}));
  return { steps, ok };
}

// ─── Parity — the simplest possible error detection ─────────────────────────
// One extra bit, chosen so the total number of 1-bits matches the desired
// parity. Catches any single-bit flip; misses an even number of flips.

export function computeParity(dataBits: string, mode: "even" | "odd"): ErrorDetectionStep[] {
  const steps: ErrorDetectionStep[] = [];
  const ones = dataBits.split("").filter((b) => b === "1").length;
  steps.push(st("parity", `Data ${dataBits} has ${ones} one-bit${ones === 1 ? "" : "s"}.`, 1, undefined, { dataBits }));

  const needsEven = mode === "even";
  const isEven = ones % 2 === 0;
  const parityBit: 0 | 1 = (needsEven === isEven ? 0 : 1);
  steps.push(st("parity", `For ${mode} parity, the total count of 1-bits (including the parity bit) must be ${mode}. Appending ${parityBit} makes that ${ones + parityBit} ones.`, 2, "insert", { dataBits, parityBit }));

  return steps;
}

export function checkParity(receivedBits: string, mode: "even" | "odd"): { steps: ErrorDetectionStep[]; ok: boolean } {
  const ones = receivedBits.split("").filter((b) => b === "1").length;
  const isEven = ones % 2 === 0;
  const ok = mode === "even" ? isEven : !isEven;
  const steps: ErrorDetectionStep[] = [
    st("parity", `Received ${receivedBits} (including its parity bit) has ${ones} one-bit${ones === 1 ? "" : "s"} — that's ${isEven ? "even" : "odd"}.`, 3, undefined, { dataBits: receivedBits }),
    st("parity", ok ? `Matches the expected ${mode} parity — no error detected (though an even number of flipped bits would slip through undetected).` : `Doesn't match the expected ${mode} parity — at least one bit was corrupted.`, 4, ok ? "found" : "error", {}),
  ];
  return { steps, ok };
}

// ─── Pseudocode ───────────────────────────────────────────────────────────────

export const CRC_CODE: string[] = [
  "function crc(message, polynomial) {",
  "  degree = polynomial.length - 1;",
  "  bits = message + '0'.repeat(degree);",
  "  for (i = 0; i < message.length; i++) {",
  "    if (bits[i] == '1')",
  "      bits[i..i+degree] ^= polynomial;   // mod-2 XOR, not subtraction",
  "  }",
  "  return bits.slice(message.length);      // the remainder = the CRC",
  "}",
];

export const CHECKSUM_CODE: string[] = [
  "function checksum(words) {",
  "  sum = 0;",
  "  for (word of words) {",
  "    sum += word;",
  "    if (sum > 0xFFFF)",
  "      sum = (sum & 0xFFFF) + (sum >> 16);  // end-around carry",
  "  }",
  "  return ~sum & 0xFFFF;                     // one's complement",
  "}",
];

export const PARITY_CODE: string[] = [
  "function parityBit(dataBits, mode) {",
  "  ones = countOnes(dataBits);",
  "  if (mode == 'even')",
  "    return ones % 2 == 0 ? 0 : 1;",
  "  else",
  "    return ones % 2 == 0 ? 1 : 0;",
  "}",
];

export const ERROR_DETECTION_ANNOTATIONS: Record<number, string> = {
  1: "This is mod-2 (XOR) arithmetic, not real subtraction — no borrowing, which is exactly why it's cheap enough to do in hardware on every frame.",
  2: "XOR-ing the polynomial in is the entire algorithm — repeated exactly once per bit of the original message.",
  3: "A leading 0 still 'moves the window forward' — nothing changes about the bits themselves, only which position is examined next.",
  4: "This exact remainder is what real Ethernet frames carry in their CRC field — the one every earlier page in this project has been showing as an opaque hex value.",
};

export const ERROR_DETECTION_COMPLEXITY = {
  crc: { time: "O(message length)", space: "O(1)", note: "One XOR per 1-bit in the message — hardware can do this at line rate because it's just shift-and-XOR." },
  checksum: { time: "O(words)", space: "O(1)", note: "One addition per 16-bit word — cheaper than CRC, but weaker: it can't distinguish a message from certain rearrangements of the same words." },
  parity: { time: "O(bits)", space: "O(1)", note: "Cheapest of all three, and the weakest — catches exactly one class of error (an odd number of bit flips) and nothing else." },
};
