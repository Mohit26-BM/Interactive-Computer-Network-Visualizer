import { Step } from "./types";

// Load balancing: an application-infrastructure decision, not a Layer 3/4
// one — a fixed illustrative sequence of requests, routed deterministically
// by whichever algorithm is selected, exactly like every other engine in
// this project. No live "requests/sec" dial or real randomness (that's a
// Simulation Lab, deliberately out of scope) — one run, one scrubbable
// trace, a metrics summary at the end.

export const SERVERS = ["Server A", "Server B", "Server C"];

export interface LbEvent {
  requestId: number;
  server: string | null; // null only if every server is unhealthy
  reason: string;
}

export interface LbStep extends Step {
  events: LbEvent[]; // cumulative — every request routed so far
  healthy: Record<string, boolean>;
  distribution: Record<string, number>; // cumulative count per server so far
}

function distributionOf(events: LbEvent[]): Record<string, number> {
  const dist: Record<string, number> = Object.fromEntries(SERVERS.map((s) => [s, 0]));
  for (const e of events) if (e.server) dist[e.server] += 1;
  return dist;
}

function st(explanation: string, hl: number, events: LbEvent[], healthy: Record<string, boolean>, phase?: string): LbStep {
  return {
    explanation, highlightLine: hl,
    events: events.map((e) => ({ ...e })),
    healthy: { ...healthy },
    distribution: distributionOf(events),
    phase,
  };
}

// ─── Round Robin — cycles through the pool in fixed order, load-blind ──────

export function simulateRoundRobin(requestCount = 9): LbStep[] {
  const steps: LbStep[] = [];
  const events: LbEvent[] = [];
  const healthy = Object.fromEntries(SERVERS.map((s) => [s, true]));

  for (let i = 0; i < requestCount; i++) {
    const server = SERVERS[i % SERVERS.length];
    events.push({ requestId: i + 1, server, reason: `Next in rotation.` });
    steps.push(st(`Request ${i + 1} -> ${server}. Round robin just cycles through the pool in fixed order — it has no idea which server is busier.`, 1, events, healthy));
  }

  steps.push(st(`Done. ${requestCount} requests split evenly across ${SERVERS.length} servers, ${Math.round(requestCount / SERVERS.length)} each — because the order never adapts to load, only to position.`, 2, events, healthy, "found"));
  return steps;
}

// ─── Weighted Round Robin — servers with more capacity get more requests ──

const WEIGHTS: Record<string, number> = { "Server A": 5, "Server B": 2, "Server C": 1 };

export function simulateWeightedRoundRobin(): LbStep[] {
  const cycle: string[] = SERVERS.flatMap((s) => Array(WEIGHTS[s]).fill(s));
  const steps: LbStep[] = [];
  const events: LbEvent[] = [];
  const healthy = Object.fromEntries(SERVERS.map((s) => [s, true]));

  steps.push(st(`Weights: ${SERVERS.map((s) => `${s}=${WEIGHTS[s]}`).join(", ")} — Server A can handle 5x the load of Server C, so it should receive 5x the requests.`, 1, events, healthy));

  cycle.forEach((server, i) => {
    events.push({ requestId: i + 1, server, reason: `Weight ${WEIGHTS[server]}.` });
    steps.push(st(`Request ${i + 1} -> ${server} (weight ${WEIGHTS[server]}).`, 2, events, healthy));
  });

  steps.push(st(`Done. Distribution: ${SERVERS.map((s) => `${s}=${distributionOf(events)[s]}`).join(", ")} — proportional to weight, not equal like plain round robin.`, 3, events, healthy, "found"));
  return steps;
}

// ─── Least Connections — route to whichever server has the fewest active ──
// requests right now, tie-broken by rotating through the tied servers so
// one doesn't monopolize every tie. Durations are ticks, hand-picked so the
// first request is long-lived and visibly gets skipped while it's busy.

const LC_DURATIONS = [6, 1, 1, 1, 6, 1, 1, 1];

export function simulateLeastConnections(): LbStep[] {
  const steps: LbStep[] = [];
  const events: LbEvent[] = [];
  const healthy = Object.fromEntries(SERVERS.map((s) => [s, true]));
  const activeEndTicks: Record<string, number[]> = Object.fromEntries(SERVERS.map((s) => [s, []]));
  let lastIndex = -1;

  steps.push(st(`Each server's "active connections" is however many requests it's still handling right now — not just how many it's received in total.`, 1, events, healthy));

  LC_DURATIONS.forEach((duration, i) => {
    const activeCounts = SERVERS.map((s) => activeEndTicks[s].filter((end) => end > i).length);
    const minCount = Math.min(...activeCounts);
    const candidates = SERVERS.map((_, idx) => idx).filter((idx) => activeCounts[idx] === minCount);
    let chosenIdx = candidates.find((idx) => idx > lastIndex);
    if (chosenIdx === undefined) chosenIdx = candidates[0];
    lastIndex = chosenIdx;
    const server = SERVERS[chosenIdx];
    activeEndTicks[server].push(i + duration);

    events.push({ requestId: i + 1, server, reason: `${minCount} active connections — the fewest right now.` });
    steps.push(st(`Request ${i + 1} -> ${server} (currently ${minCount} active connection${minCount === 1 ? "" : "s"} — the fewest of any server). This request will stay active for ${duration} tick${duration === 1 ? "" : "s"}.`, 2, events, healthy));
  });

  steps.push(st(`Done. Distribution: ${SERVERS.map((s) => `${s}=${distributionOf(events)[s]}`).join(", ")} — the long-running first request on Server A visibly cost it future requests until it finished, something Round Robin would never notice.`, 3, events, healthy, "found"));
  return steps;
}

// ─── IP Hash — the same client always lands on the same server ────────────

const HASH_CLIENTS = ["203.0.113.10", "203.0.113.11", "203.0.113.12", "203.0.113.13"];

function hashIp(ip: string): number {
  let sum = 0;
  for (const ch of ip) sum += ch.charCodeAt(0);
  return sum % SERVERS.length;
}

export function simulateIpHash(): LbStep[] {
  const steps: LbStep[] = [];
  const events: LbEvent[] = [];
  const healthy = Object.fromEntries(SERVERS.map((s) => [s, true]));

  steps.push(st(`Each client IP hashes to a fixed server index — the same client always lands on the same server, which is exactly what "sticky sessions" need.`, 1, events, healthy));

  const requestOrder = [...HASH_CLIENTS, ...HASH_CLIENTS]; // every client appears twice, in the same order, to prove stickiness
  requestOrder.forEach((ip, i) => {
    const idx = hashIp(ip);
    const server = SERVERS[idx];
    events.push({ requestId: i + 1, server, reason: `hash(${ip}) -> ${server}` });
    steps.push(st(`Request ${i + 1} from ${ip} -> ${server} (hash(${ip}) % ${SERVERS.length} = ${idx}).`, 2, events, healthy));
  });

  const allStick = HASH_CLIENTS.every((ip) => {
    const firstIdx = events.findIndex((e) => e.reason.includes(ip));
    const secondIdx = events.findIndex((e, i) => i > firstIdx && e.reason.includes(ip));
    return events[firstIdx].server === events[secondIdx].server;
  });
  steps.push(st(`Done. ${allStick ? "Every client's second request landed on the exact same server as its first" : "Something didn't stick"} — no session table needed, the IP address alone determines the server.`, 3, events, healthy, "found"));
  return steps;
}

// ─── Server Failure / Health Checks — the pool adapts when one goes down ──

export function simulateFailureScenario(): LbStep[] {
  const steps: LbStep[] = [];
  const events: LbEvent[] = [];
  const healthy: Record<string, boolean> = Object.fromEntries(SERVERS.map((s) => [s, true]));
  let cursor = 0; // rotation position among currently-healthy servers

  function routeNext(requestId: number): string {
    const pool = SERVERS.filter((s) => healthy[s]);
    const server = pool[cursor % pool.length];
    cursor++;
    events.push({ requestId, server, reason: "next healthy server in rotation" });
    return server;
  }

  for (let i = 1; i <= 4; i++) {
    const server = routeNext(i);
    steps.push(st(`Request ${i} -> ${server}. All three servers are healthy.`, 1, events, healthy));
  }

  healthy["Server B"] = false;
  steps.push(st(`Health check: Server B stops responding to pings. The load balancer marks it unhealthy and removes it from the rotation — no new requests will go there until it recovers.`, 2, events, healthy, "error"));

  for (let i = 5; i <= 8; i++) {
    const server = routeNext(i);
    steps.push(st(`Request ${i} -> ${server}. Server B is skipped entirely — traffic reroutes to the remaining healthy servers.`, 3, events, healthy));
  }

  steps.push(st(`Done. Server B never received a request after it went unhealthy — the pool adapted automatically, with no dropped requests and no client ever knowing anything failed.`, 4, events, healthy, "found"));
  return steps;
}

export const LOAD_BALANCING_CODE: Record<string, string[]> = {
  "round-robin": [
    "let next = 0;",
    "function route(request) {",
    "  const server = pool[next % pool.length];",
    "  next++;",
    "  return server;  // pure rotation — never looks at load",
    "}",
  ],
  "weighted-round-robin": [
    "const cycle = pool.flatMap(s => Array(s.weight).fill(s));",
    "let next = 0;",
    "function route(request) {",
    "  const server = cycle[next % cycle.length];",
    "  next++;",
    "  return server;  // heavier servers appear more often in the cycle",
    "}",
  ],
  "least-connections": [
    "function route(request) {",
    "  const active = pool.map(s => s.activeConnections());",
    "  const min = Math.min(...active);",
    "  const candidates = pool.filter((s, i) => active[i] === min);",
    "  return pickWithRoundRobinTiebreak(candidates); // avoids one server winning every tie",
    "}",
  ],
  "ip-hash": [
    "function route(request) {",
    "  const index = hash(request.clientIp) % pool.length;",
    "  return pool[index];  // same client IP always maps to the same index",
    "}",
  ],
  "failure": [
    "function healthCheck(server) {",
    "  if (!server.respondsToPing()) {",
    "    server.healthy = false;   // removed from rotation immediately",
    "  }",
    "}",
    "function route(request) {",
    "  const healthyPool = pool.filter(s => s.healthy);",
    "  return nextInRotation(healthyPool);",
    "}",
  ],
};

export const LOAD_BALANCING_ANNOTATIONS: Record<string, Record<number, string>> = {
  "round-robin": {
    1: "Round robin is the simplest possible algorithm — and the least aware of reality: a server mid-way through a slow request looks identical to an idle one.",
    2: "Even distribution is round robin's whole promise — and its whole limitation, since \"even\" isn't the same as \"fair\" when servers differ in capacity or requests differ in cost.",
  },
  "weighted-round-robin": {
    1: "Weights are usually set to match real capacity differences — more CPU/RAM, a higher weight.",
    3: "This is still blind to real-time load, same as plain round robin — it just encodes a static assumption about relative capacity instead of assuming all servers are equal.",
  },
  "least-connections": {
    1: "This is the first algorithm in this set that actually looks at the servers' current state, not just a fixed schedule.",
    2: "The tie-break matters: always favoring the same server on a tie would silently recreate round robin's blind spot.",
    3: "This is the algorithm's whole value proposition: a server already mid-request gets fewer new ones, automatically.",
  },
  "ip-hash": {
    1: "Sticky sessions solve a real problem: if a user's session state lives only on the server that first served them, every later request from that user must land there too.",
    2: "The hash function itself doesn't need to be cryptographically strong — it just needs to be consistent, so the same input always produces the same output.",
    3: "The tradeoff: if that one server fails, every client hashed to it needs a new place to land — IP hash and graceful failure handling have to work together in practice.",
  },
  "failure": {
    2: "This is exactly the mechanism behind \"why did my request suddenly get slower/faster\" after a deploy or an outage — the pool changed size without anyone touching the client.",
    3: "Health checks are usually just this: a periodic ping/HTTP request with a timeout, not a full diagnosis of what's wrong with the server.",
    4: "From the client's perspective, nothing happened — that invisibility is the entire point of putting a load balancer in front of the pool in the first place.",
  },
};

export const LOAD_BALANCING_COMPLEXITY: Record<string, { time: string; space: string; note: string }> = {
  "round-robin": { time: "O(1) per request", space: "O(1)", note: "Just a counter — the cheapest possible algorithm, and the least informed." },
  "weighted-round-robin": { time: "O(1) per request (O(total weight) to build the cycle once)", space: "O(total weight)", note: "The cycle is precomputed once, then indexed — no per-request recomputation." },
  "least-connections": { time: "O(servers) per request", space: "O(servers + in-flight requests)", note: "Has to check every server's current load before each decision — more informed, and slightly more expensive." },
  "ip-hash": { time: "O(1) per request", space: "O(1) — no session table needed", note: "Stickiness comes for free from the hash function itself, not from remembering past decisions." },
  "failure": { time: "O(servers) per health check", space: "O(servers)", note: "Health checks run independently of request traffic — the cost is periodic, not per-request." },
};
