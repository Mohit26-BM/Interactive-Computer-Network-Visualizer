// Logic smoke test for Phase 4 engines — run with:
//   npx tsx scripts/verify-phase4.mjs
import { buildDefaultTopology } from "../lib/topology-engine.ts";
import { classifyPort, lookupPort, socketTuple } from "../lib/ports-engine.ts";
import { sendUdpDatagram } from "../lib/udp-engine.ts";
import { tcpHandshake } from "../lib/tcp-handshake-engine.ts";
import { sendTcpData } from "../lib/tcp-data-transfer-engine.ts";
import { simulateSlidingWindow } from "../lib/tcp-window-engine.ts";
import { simulateFlowControl } from "../lib/tcp-flow-control-engine.ts";
import { simulateCongestionControl } from "../lib/tcp-congestion-engine.ts";
import { tcpTerminate } from "../lib/tcp-termination-engine.ts";
import { TCP_VS_UDP_COMPARISON, SCENARIOS } from "../lib/tcp-vs-udp-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- Ports: classification and lookup ---
assert(classifyPort(80) === "well-known", "Port 80 classifies as well-known");
assert(classifyPort(3306) === "registered", "Port 3306 classifies as registered");
assert(classifyPort(52341) === "ephemeral", "Port 52341 classifies as ephemeral");
assert(classifyPort(70000) === "invalid", "Port 70000 is invalid (out of range)");
assert(lookupPort(443)?.service === "HTTPS", "Port 443 looks up to HTTPS");
assert(lookupPort(52341) === undefined, "An ephemeral port has no well-known service entry");
assert(socketTuple("TCP", "10.0.0.1", 52341, "10.0.0.2", 443).includes("52341") , "Socket tuple string includes the client port");

// --- UDP: delivers with no ACK, or vanishes silently on simulated loss ---
const topo = buildDefaultTopology(); // PC-1 - SW-1 - R-1 - SRV-1
const udpSteps = sendUdpDatagram(topo, "PC-1", "SRV-1", 52341, 53, "DNS query", false);
const lastUdp = udpSteps[udpSteps.length - 1];
assert(lastUdp.packet.fate === "delivered", "UDP datagram delivers when loss isn't simulated");
assert(/No acknowledgment/.test(lastUdp.explanation), "Delivery step notes no acknowledgment is sent");

const lostSteps = sendUdpDatagram(topo, "PC-1", "SRV-1", 52341, 53, "DNS query", true);
const lastLost = lostSteps[lostSteps.length - 1];
assert(lastLost.packet.fate === "dropped", "UDP datagram is dropped when loss is simulated");
assert(lastLost === lostSteps.at(-1) && lostSteps.filter((s) => s.packet.fate === "dropped").length === 1, "The trace ends immediately at the drop — no further steps, no resend attempt follows");

// --- TCP handshake: three legs, correct seq/ack numbers, correct final states ---
const tcpSteps = tcpHandshake(topo, "PC-1", "SRV-1", 52341, 80);
const synStep = tcpSteps.find((s) => s.packet.layers[0]?.fields.flags === "SYN");
const synAckStep = tcpSteps.find((s) => s.packet.layers[0]?.fields.flags === "SYN,ACK");
const ackStep = tcpSteps.find((s) => s.packet.layers[0]?.fields.flags === "ACK");
assert(!!synStep && !!synAckStep && !!ackStep, "All three handshake segments (SYN, SYN-ACK, ACK) appear in the trace");

const clientIsn = synStep.packet.layers[0].fields.seq;
const serverIsn = synAckStep.packet.layers[0].fields.seq;
assert(synAckStep.packet.layers[0].fields.ack === clientIsn + 1, "SYN-ACK acknowledges the client's ISN + 1");
assert(ackStep.packet.layers[0].fields.ack === serverIsn + 1, "Final ACK acknowledges the server's ISN + 1");

const final = tcpSteps[tcpSteps.length - 1];
assert(final.clientState === "ESTABLISHED" && final.serverState === "ESTABLISHED", "Both sides end in ESTABLISHED");
const clientEstablishedEarly = tcpSteps.find((s) => s.clientState === "ESTABLISHED");
const serverStillSynRcvdThen = tcpSteps[tcpSteps.indexOf(clientEstablishedEarly)].serverState;
assert(serverStillSynRcvdThen === "SYN_RCVD", "Client reaches ESTABLISHED one full step before the server does");

// --- TCP Data Transfer: cumulative ACKs advance seq, retransmit reuses the same seq ---
const segments = ["Hello ", "World", "!"];
const dataSteps = sendTcpData(topo, "PC-1", "SRV-1", 52341, 80, segments, -1);
const sendSteps = dataSteps.filter((s) => /^PC-1 sends segment/.test(s.explanation));
assert(sendSteps.length === 3, "All 3 segments are sent when nothing is lost: got " + sendSteps.length);
const ackSteps = dataSteps.filter((s) => /^SRV-1 acknowledges: ACK/.test(s.explanation));
assert(ackSteps.length === 3, "All 3 segments are acknowledged: got " + ackSteps.length);
const seq0 = sendSteps[0].packet.layers[0].fields.seq;
assert(ackSteps[0].packet.layers[0].fields.ack === seq0 + segments[0].length, "First ACK equals seq + segment length (next expected byte)");
assert(sendSteps[1].packet.layers[0].fields.seq === seq0 + segments[0].length, "Second segment's seq continues from the first ACK's number");

const lossyDataSteps = sendTcpData(topo, "PC-1", "SRV-1", 52341, 80, segments, 0);
const droppedStep = lossyDataSteps.find((s) => s.packet.fate === "dropped");
const retransmitStep = lossyDataSteps.find((s) => /retransmits segment 1/.test(s.explanation));
assert(!!droppedStep && !!retransmitStep, "Losing segment 1 produces both a drop and a retransmit step");
const originalSendSeq = lossyDataSteps.find((s) => /sends segment 1/.test(s.explanation)).packet.layers[0].fields.seq;
assert(droppedStep.packet.layers[0].fields.seq === originalSendSeq, "The retransmitted segment carries the exact same sequence number as the original");

// --- Sliding Window: never more than windowSize segments in flight, everything eventually acked ---
const windowSteps = simulateSlidingWindow(8, 3);
const maxInFlight = Math.max(...windowSteps.map((s) => s.segments.filter((seg) => seg.status === "in-flight").length));
assert(maxInFlight <= 3, "At no point are more than windowSize (3) segments in flight at once: max was " + maxInFlight);
const lastWindowStep = windowSteps[windowSteps.length - 1];
assert(lastWindowStep.segments.every((s) => s.status === "acked"), "Every segment ends up acknowledged");

// --- Flow Control: rwnd hits zero at least once, and progress always resumes afterward ---
const flowSteps = simulateFlowControl(3, 8, 1, 3);
assert(flowSteps.some((s) => s.event === "zero-window"), "A zero window occurs at least once with a slow-enough reader");
assert(flowSteps.some((s) => s.event === "window-update"), "A window update follows the zero window, allowing the sender to resume");
assert(flowSteps[flowSteps.length - 1].segmentsSent === 8, "All 8 segments eventually get sent despite the pause");
assert(flowSteps.every((s) => s.advertisedWindow >= 0 && s.advertisedWindow <= s.bufferCapacity), "Advertised window never goes negative or exceeds buffer capacity");

// --- Congestion Control: doubles below ssthresh, +1 above, resets correctly on both event types ---
const congestionSteps = simulateCongestionControl(20, 16, [9], [16]);
const round8 = congestionSteps.find((s) => s.round === 8);
const round9 = congestionSteps.find((s) => s.round === 9);
assert(round9.event === "timeout" && round9.cwnd === 1, "Round 9 (scheduled timeout) collapses cwnd to 1");
assert(round9.ssthresh === Math.floor(round8.cwnd / 2), "Timeout halves ssthresh based on cwnd right before the loss");
const round16 = congestionSteps.find((s) => s.round === 16);
assert(round16.event === "fast-retransmit" && round16.cwnd === round16.ssthresh, "Fast retransmit drops cwnd to the new ssthresh, not to 1");
assert(round16.cwnd > 1, "Fast retransmit's reset is milder than a timeout's — cwnd doesn't collapse all the way");
const earlyRound = congestionSteps.find((s) => s.round === 2);
assert(earlyRound.cwnd === 4, "Slow start doubles cwnd each round while below ssthresh (round 2 -> cwnd 4)");

// --- Termination: four segments, both sides reach CLOSED, initiator passes through TIME_WAIT ---
const termSteps = tcpTerminate(topo, "PC-1", "SRV-1", 52341, 80);
// Layers (and the packet id) persist unchanged across every hop-travel sub-step,
// so dedupe by packet id to count distinct segments, not distinct steps.
const finIds = new Set(termSteps.filter((s) => s.packet.layers[0]?.fields.flags === "FIN,ACK").map((s) => s.packet.id));
const ackIds = new Set(termSteps.filter((s) => s.packet.layers[0]?.fields.flags === "ACK").map((s) => s.packet.id));
assert(finIds.size === 2, "Both FINs are sent (one from each side): got " + finIds.size);
assert(ackIds.size === 2, "Both ACKs are sent (one for each FIN): got " + ackIds.size);
assert(termSteps.some((s) => s.initiatorState === "TIME_WAIT"), "Initiator passes through TIME_WAIT");
const lastTerm = termSteps[termSteps.length - 1];
assert(lastTerm.initiatorState === "CLOSED" && lastTerm.responderState === "CLOSED", "Both sides end up CLOSED");

// --- TCP vs UDP: reference data is well-formed ---
assert(TCP_VS_UDP_COMPARISON.length === 7, "Comparison table has all 7 dimensions");
assert(TCP_VS_UDP_COMPARISON.every((r) => r.tcp && r.udp), "Every comparison row has both a TCP and a UDP description");
assert(Object.keys(SCENARIOS).length === 3 && Object.values(SCENARIOS).every((s) => s.tcp.length > 0 && s.udp.length > 0), "All 3 scenarios have both a TCP and a UDP outcome");

console.log("\nAll Phase 4 logic checks passed.");
