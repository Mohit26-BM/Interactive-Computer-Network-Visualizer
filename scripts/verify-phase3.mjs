// Logic smoke test for Phase 3 engines — run with:
//   npx tsx scripts/verify-phase3.mjs
import { buildDefaultTopology, buildRoutingTopology, buildIcmpTopology } from "../lib/topology-engine.ts";
import { sendIPv4Packet } from "../lib/ipv4-engine.ts";
import { calculateSubnet } from "../lib/subnetting-engine.ts";
import { dijkstra, shortestPathTo } from "../lib/routing-engine.ts";
import { ping, traceroute } from "../lib/icmp-engine.ts";

function assert(cond, msg) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("ok  - " + msg);
}

// --- IPv4: TTL decrements once per router, Ethernet frame rebuilt per segment ---
const topo = buildDefaultTopology(); // PC-1 - SW-1 - R-1 - SRV-1
const ipSteps = sendIPv4Packet(topo, "PC-1", "SRV-1");
const last = ipSteps[ipSteps.length - 1];
assert(last.packet.fate === "delivered", "IPv4 PC-1->SRV-1 delivers across the one router");
const hasLowerLayers = last.packet.layers.some((l) => l.protocol === "IPv4" || l.protocol === "Ethernet");
assert(!hasLowerLayers, "Final delivered packet has stripped both Ethernet and IPv4 headers (payload only): " + JSON.stringify(last.packet.layers));
assert(last.packet.layers.length === 1 && last.packet.layers[0].protocol === "TCP", "Only the TCP payload layer remains after delivery");
const ttlDrops = ipSteps.filter((s) => /decrements TTL to 63/.test(s.explanation));
assert(ttlDrops.length === 1, "TTL drops from 64 to 63 exactly once (one router in the path): got " + ttlDrops.length);
const ethernetRebuilds = ipSteps.filter((s) => /fresh Ethernet frame/i.test(s.explanation));
assert(ethernetRebuilds.length === 2, "Ethernet frame is rebuilt exactly twice (once per segment): got " + ethernetRebuilds.length);

// --- Subnetting: known-answer checks ---
const r1 = calculateSubnet("192.168.1.0/24");
assert(r1.ok && r1.network === "192.168.1.0" && r1.broadcast === "192.168.1.255" && r1.usableHosts === 254, "192.168.1.0/24 -> network .0, broadcast .255, 254 usable hosts");
const r2 = calculateSubnet("10.0.0.0/8");
assert(r2.ok && r2.mask === "255.0.0.0" && r2.usableHosts === 16777214, "10.0.0.0/8 -> mask 255.0.0.0, 16,777,214 usable hosts");
const r3 = calculateSubnet("172.16.4.5/30");
assert(r3.ok && r3.network === "172.16.4.4" && r3.broadcast === "172.16.4.7" && r3.usableHosts === 2, "172.16.4.5/30 rounds down to network .4, broadcast .7, 2 usable hosts");
const r4 = calculateSubnet("not-an-ip/24");
assert(!r4.ok, "Garbage input is rejected with an error, not a crash");

// --- Routing: Dijkstra matches the known-good distances from the DSA demo graph ---
const routingTopo = buildRoutingTopology(); // R-A..R-E, same weights as the DSA app's demo
const routingSteps = dijkstra(routingTopo, "R-A");
const finalRouting = routingSteps[routingSteps.length - 1];
const distByLabel = Object.fromEntries(routingTopo.devices.map((d) => [d.label, finalRouting.distances[d.id]]));
assert(distByLabel["R-A"] === 0, "dist(R-A) = 0");
assert(distByLabel["R-C"] === 2, "dist(R-C) = 2 (direct edge)");
assert(distByLabel["R-D"] === 3, "dist(R-D) = 3 (via R-C, not the direct 5-weight edge via R-B)");
assert(distByLabel["R-E"] === 6, "dist(R-E) = 6 (via R-C -> R-D -> R-E, cheaper than the direct 6-weight edge... let's just check it's <= 6): " + distByLabel["R-E"]);
const path = shortestPathTo(finalRouting, routingTopo, "R-E");
assert(path !== null, "shortestPathTo(R-E) resolves a path");

// --- ICMP: ping round-trips, traceroute reveals both routers before the destination ---
const icmpTopo = buildIcmpTopology(); // PC-1 - SW-1 - R-1 - R-2 - SRV-1
const pingSteps = ping(icmpTopo, "PC-1", "SRV-1");
assert(pingSteps[pingSteps.length - 1].explanation.includes("Round trip complete"), "Ping completes a full round trip");
const traceSteps = traceroute(icmpTopo, "PC-1", "SRV-1");
const finalHops = traceSteps[traceSteps.length - 1].hops;
assert(finalHops.length === 3, "Traceroute reveals 3 hops (R-1, R-2, SRV-1): got " + finalHops.length);
assert(finalHops[0].startsWith("R-1") && finalHops[1].startsWith("R-2") && finalHops[2].startsWith("SRV-1"), "Hops are revealed in the correct order: " + finalHops.join(", "));

console.log("\nAll Phase 3 logic checks passed.");
