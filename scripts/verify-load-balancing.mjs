// Logic smoke test for lib/load-balancing-engine.ts — run with:
//   npx tsx scripts/verify-load-balancing.mjs
import {
  simulateRoundRobin, simulateWeightedRoundRobin, simulateLeastConnections, simulateIpHash, simulateFailureScenario,
  SERVERS,
} from "../lib/load-balancing-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- Round Robin: even distribution, fixed cycle order ---
const rr = simulateRoundRobin(9);
const rrLast = rr[rr.length - 1];
assert(SERVERS.every((s) => rrLast.distribution[s] === 3), `Round Robin splits 9 requests evenly, 3 per server: got ${JSON.stringify(rrLast.distribution)}`);
assert(rrLast.events[0].server === "Server A" && rrLast.events[1].server === "Server B" && rrLast.events[2].server === "Server C", "Round Robin cycles in fixed A, B, C order");

// --- Weighted Round Robin: distribution proportional to weight (5:2:1) ---
const wrr = simulateWeightedRoundRobin();
const wrrLast = wrr[wrr.length - 1];
assert(wrrLast.distribution["Server A"] === 5, `Server A (weight 5) receives 5 of 8 requests: got ${wrrLast.distribution["Server A"]}`);
assert(wrrLast.distribution["Server B"] === 2, `Server B (weight 2) receives 2 of 8 requests: got ${wrrLast.distribution["Server B"]}`);
assert(wrrLast.distribution["Server C"] === 1, `Server C (weight 1) receives 1 of 8 requests: got ${wrrLast.distribution["Server C"]}`);

// --- Least Connections: the first (long) request's server is skipped on the very next request ---
const lc = simulateLeastConnections();
const lcLast = lc[lc.length - 1];
const lcEvents = lcLast.events;
assert(lcEvents[0].server !== lcEvents[1].server, "Least Connections never re-picks the server it just gave a long-running request to while alternatives are idle");
assert(SERVERS.every((s) => lcLast.distribution[s] > 0), "Least Connections' round-robin tiebreak means every server gets at least one request, not just the first two");
const totalLc = SERVERS.reduce((sum, s) => sum + lcLast.distribution[s], 0);
assert(totalLc === 8, `All 8 requests are accounted for across the pool: got ${totalLc}`);

// --- IP Hash: the same client IP always lands on the same server (sticky) ---
const ipHash = simulateIpHash();
const ipLast = ipHash[ipHash.length - 1];
const firstFour = ipLast.events.slice(0, 4);
const secondFour = ipLast.events.slice(4, 8);
assert(firstFour.every((e, i) => e.server === secondFour[i].server), "Every client's second request lands on the exact same server as its first (sticky sessions)");

// --- Server Failure: nothing is routed to Server B after it's marked unhealthy ---
const failure = simulateFailureScenario();
const failureLast = failure[failure.length - 1];
const healthCheckIndex = failure.findIndex((s) => s.phase === "error");
assert(healthCheckIndex > 0, "A distinct health-check step marks Server B unhealthy");
const eventsAfterHealthCheck = failureLast.events.filter((e) => e.requestId > 4);
assert(eventsAfterHealthCheck.every((e) => e.server !== "Server B"), "No request after the health check failure is ever routed to Server B");
assert(failureLast.healthy["Server B"] === false, "Server B's final health state is marked unhealthy");
assert(failureLast.healthy["Server A"] && failureLast.healthy["Server C"], "Server A and Server C remain healthy throughout");

console.log("\nAll Load Balancing logic checks passed.");
