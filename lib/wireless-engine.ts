import { Step } from "./types";

// Wi-Fi basics: two things wired Ethernet never has to deal with — an
// explicit join handshake before any data flows (Ethernet just plugs in),
// and the hidden node problem (a collision the sender never even senses,
// because "carrier sense" only covers what's in radio range of the sender
// itself, not of the receiver).

// ─── Association: Scan → Authenticate → Associate ─────────────────────────

export interface WirelessStep extends Step {
  stage: "beacon" | "auth" | "assoc" | "data" | null;
}

function ws(explanation: string, hl: number, stage: WirelessStep["stage"], phase?: string): WirelessStep {
  return { explanation, highlightLine: hl, stage, phase };
}

export function simulateAssociation(ssid: string): WirelessStep[] {
  return [
    ws(`The Access Point continuously broadcasts Beacon frames advertising its SSID ("${ssid}") and capabilities — even with no client nearby yet.`, 1, "beacon"),
    ws(`The client scans, hears the beacon, and decides to join "${ssid}".`, 2, "beacon"),
    ws(`Client → AP: Authentication Request. AP → Client: Authentication Response. (Open System here — just a formality; WPA2/3 add a real key exchange on top of this step.)`, 3, "auth"),
    ws(`Client → AP: Association Request. AP → Client: Association Response. The client is now a member of the AP's BSS (Basic Service Set) — it has an over-the-air "port" the same way a switch port exists on Ethernet.`, 4, "assoc", "insert"),
    ws(`From here, IP configuration (DHCP) and everything above it work exactly as they do over a wired link — only the frames between the client and the AP travel over radio instead of copper.`, 5, "data"),
  ];
}

// ─── Hidden node problem: RTS/CTS ──────────────────────────────────────────
// Station A and Station C are both in range of the AP, but not of each
// other — a wall or distance separates them. Each senses an idle channel
// (correctly, from where it's standing) and transmits, but both arrive at
// the AP simultaneously and collide there. RTS/CTS fixes this because the
// AP's CTS reply reaches both stations, even though they can't hear each
// other directly.

export interface HiddenNodeStep extends Step {
  aSending: boolean;
  cSending: boolean;
  ctsIssued: boolean;
  outcome: "collision" | "success" | null;
}

function hn(explanation: string, hl: number, aSending: boolean, cSending: boolean, ctsIssued: boolean, outcome: HiddenNodeStep["outcome"] = null, phase?: string): HiddenNodeStep {
  return { explanation, highlightLine: hl, aSending, cSending, ctsIssued, outcome, phase };
}

export function simulateHiddenNode(rtsCtsEnabled: boolean): HiddenNodeStep[] {
  const steps: HiddenNodeStep[] = [];
  steps.push(hn(
    "Station A and Station C are both associated to the same AP, but they're out of radio range of each other — a wall or distance separates them. Neither can hear the other transmit.",
    1, false, false, false
  ));

  if (!rtsCtsEnabled) {
    steps.push(hn("Station A senses the channel — silent from where it's standing — and starts sending to the AP.", 2, true, false, false));
    steps.push(hn("At the same moment, Station C also senses silence (correctly — it can't hear A) and starts sending to the AP too.", 3, true, true, false));
    steps.push(hn("Both frames arrive at the AP at once and collide there. Neither station has any way to know this happened just from carrier sensing — this is the hidden node problem.", 4, true, true, false, "collision", "error"));
    return steps;
  }

  steps.push(hn("With RTS/CTS enabled, Station A first sends a short Request To Send (RTS) to the AP instead of the full frame.", 2, true, false, false));
  steps.push(hn("The AP replies with Clear To Send (CTS) — broadcast at a power level that reaches every associated station, including Station C, even though C never heard A's original RTS.", 3, false, false, true));
  steps.push(hn("Station C hears the CTS, learns the medium is reserved for A, and defers its own transmission even though it still can't hear A directly.", 4, false, false, true));
  steps.push(hn("Station A's full data frame reaches the AP with no collision. The hidden node problem is solved without either station ever needing to hear the other.", 5, true, false, true, "success", "insert"));
  return steps;
}

export const WIRELESS_CODE: string[] = [
  "function join(ap, client, ssid) {",
  "  ap.broadcastBeacon(ssid);                 // continuous, whether anyone's listening or not",
  "  client.scan();  client.authenticate(ap);   // Open System, or a real key exchange (WPA2/3)",
  "  client.associate(ap);                      // client now has an over-the-air \"port\"",
  "}",
  "",
  "function sendWithRtsCts(station, ap) {",
  "  station.send(RTS);                          // short reservation request",
  "  ap.reply(CTS);                               // reaches every station in the BSS,",
  "  station.send(DATA);                          // even ones the sender can't hear",
  "}",
];

export const WIRELESS_ANNOTATIONS: Record<number, string> = {
  1: "A beacon is unsolicited — it's how a client discovers an AP exists at all, the wireless equivalent of a switch port just being physically present.",
  2: "Authentication here is a legacy formality from the original 802.11 spec; real security is layered on top by WPA2/WPA3 during a separate 4-way handshake.",
  3: "RTS is deliberately short — the whole point is to risk a small collision instead of a full-length one if two stations happen to RTS at the same instant.",
  4: "A CTS is heard by everyone in range of the AP, not just the station that sent the RTS — that's the entire mechanism that solves hidden-node collisions.",
  5: "This is strictly overhead when there's no hidden node problem, which is why RTS/CTS is usually only enabled above a configured frame-size threshold.",
};

export const WIRELESS_COMPLEXITY = {
  time: "O(1) per station per attempt",
  space: "O(1)",
  note: "RTS/CTS trades a small fixed overhead on every transmission for eliminating a class of collisions that carrier sensing alone structurally cannot detect.",
};
