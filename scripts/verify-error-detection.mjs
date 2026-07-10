// Logic smoke test for lib/error-detection-engine.ts — run with:
//   npx tsx scripts/verify-error-detection.mjs
//
// Rather than hardcoding an "expected" CRC/checksum value from memory (which
// risks the same self-inflicted-bug pattern seen elsewhere in this project),
// these checks validate round-trip correctness: does an uncorrupted codeword
// verify clean, and does a corrupted one get caught?
import { computeCrc, verifyCrc, computeChecksum, verifyChecksum, computeParity, checkParity } from "../lib/error-detection-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

function flipFirstOneBit(bits) {
  const arr = bits.split("");
  arr[0] = arr[0] === "1" ? "0" : "1";
  return arr.join("");
}

// --- CRC ---
const message = "1101011011";
const polynomial = "10011";
const degree = polynomial.length - 1;

const crcSteps = computeCrc(message, polynomial);
const remainder = crcSteps[crcSteps.length - 1].bits.slice(message.length);
assert(remainder.length === degree, "CRC remainder length matches the polynomial's degree: got " + remainder.length);

const codeword = message + remainder;
const { ok: cleanOk } = verifyCrc(codeword, polynomial);
assert(cleanOk, "An uncorrupted codeword (message + its own CRC) verifies clean");

const corruptedCodeword = flipFirstOneBit(codeword);
const { ok: corruptedOk } = verifyCrc(corruptedCodeword, polynomial);
assert(!corruptedOk, "A single flipped bit in the codeword is caught by CRC verification");

// --- Internet Checksum ---
const words = [0x4500, 0x003c, 0x1c46, 0x4000, 0x4006];
const checksumSteps = computeChecksum(words);
const checksum = checksumSteps[checksumSteps.length - 1].sum;
const { ok: checksumCleanOk } = verifyChecksum(words, checksum);
assert(checksumCleanOk, "Uncorrupted words + their own checksum sum to all ones (verifies clean)");

const corruptedWords = [...words];
corruptedWords[0] = corruptedWords[0] ^ 0x0001;
const { ok: checksumCorruptedOk } = verifyChecksum(corruptedWords, checksum);
assert(!checksumCorruptedOk, "A single flipped bit in one word is caught by checksum verification");

// --- Parity ---
const dataBits = "1010001";
for (const mode of ["even", "odd"]) {
  const paritySteps = computeParity(dataBits, mode);
  const parityBit = paritySteps[paritySteps.length - 1].parityBit;
  const clean = dataBits + parityBit;
  const { ok: parityCleanOk } = checkParity(clean, mode);
  assert(parityCleanOk, `${mode} parity: uncorrupted data + its own parity bit checks clean`);

  const corrupted = flipFirstOneBit(dataBits) + parityBit;
  const { ok: parityCorruptedOk } = checkParity(corrupted, mode);
  assert(!parityCorruptedOk, `${mode} parity: a single flipped data bit is caught`);
}

console.log("\nAll Error Detection logic checks passed.");
