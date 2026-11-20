# Network Visualizer

An interactive, in-browser computer networking course. Every topic — from a
single packet moving across a wire, up through Ethernet, IP, TCP, DNS, HTTP,
TLS, VLANs, routing protocols, wireless, and load balancing — gets its own
page with a hand-built, step-by-step simulation you can play, pause, rewind,
and scrub through, plus pseudocode, complexity notes, and an AI explanation
of whatever's on screen.

Nothing here is decorative. Every diagram is driven by a real (small, pure)
implementation of the protocol or algorithm it's teaching — not a canned
animation. If a page shows a TCP handshake, ARP cache, or Dijkstra run, that's
an actual implementation of it producing the trace you're watching.

## What this project actually is

- **A learning tool, not a production networking library.** Engines favor
  clarity over performance and completeness — see [Content scope](#content-scope).
- **Self-contained.** No backend beyond one optional AI-explanation API route;
  everything else runs and computes entirely in the browser.
- **Organized like a course**, not a reference manual: Foundation → Layer 2 →
  Layer 3 → Layer 4 → Application → Network Algorithms → Enterprise Networking
  → Experiments, each building on the last.

## Tech stack

- **Next.js 16** (App Router, Turbopack) — every simulator page is statically
  generated (`○`) at build time; there is exactly one dynamic server route
  (the AI explainer).
- **React 19**, **TypeScript** (strict), **Tailwind CSS v4**.
- **Groq SDK** (`openai/gpt-oss-120b`) for the optional "Explain this step" AI
  panel.
- No state management library, no client-side router beyond Next's own, no
  charting library (the one chart on the site is a ~40-line inline SVG
  component) — the project deliberately stays light on dependencies.

## The core pattern: engines + Step[] + a shared shell

Almost every page in this project is built from three pieces:

1. **An engine** (`lib/<topic>-engine.ts`) — a pure function (or small set of
   them) that takes some input (two device labels, a CIDR block, an
   algorithm choice, a slider value) and returns an ordered array of `Step`
   objects:

   ```ts
   interface Step {
     explanation: string;   // what's happening, in plain language, this step
     highlightLine: number; // which pseudocode line this step corresponds to
     phase?: string;        // "insert" | "found" | "delete" | "error" | ...
     // + whatever state that topic's step needs to render:
     // a packet, a topology snapshot, a cache, a routing table, ...
   }
   ```

   The whole simulation is computed up front, not stepped live — this is
   what makes scrubbing backward and forward, and changing playback speed,
   completely free: there's no simulation *state* to rewind, just an array
   to index into.

2. **A page** (`app/<route>/page.tsx`) — a thin shell around that engine:
   a "Send"/"Run" tab that collects input and calls the engine, a canvas
   that renders `steps[currentStep]`, and a shared `<Controls>` timeline
   (play / pause / step / speed / scrub) driven by a small `usePlayer` hook
   that just tracks an index into the array.

3. **A verify script** (`scripts/verify-<topic>.mjs`) — a plain Node script
   (no test framework) that calls the engine directly and asserts on
   *properties* of the output (round-trip correctness, structural
   invariants, known closed-form values) rather than hard-coded expected
   traces wherever that's feasible. All of them run via `npm run verify`.

This is why adding a new topic never requires touching the playback
machinery, the layout, or any other page — it's always: write an engine,
write a page that feeds it into the shared shell, write a verify script,
register the topic (see below).

## How routes are implemented

This project uses Next's **App Router**, so the file system under `app/` *is*
the route table. A few conventions on top of that:

### 1. One route per topic, almost all fully static

Every simulator lives at its own top-level route —
`app/arp/page.tsx` → `/arp`, `app/vlan/page.tsx` → `/vlan`,
`app/tcp/handshake/page.tsx` → `/tcp/handshake`, and so on. `next build`
prerenders essentially all of them (`○ (Static)` in the build output) since
every page's content is generated client-side from its engine at runtime —
there's no per-request server data to fetch.

Routes are grouped by folder only where a topic has genuinely nested
sub-pages (`app/tcp/*` for the eight TCP-specific pages,
`app/experiments/*` for the Experiments section) — otherwise everything is
flat at the top level.

### 2. One dynamic route: the group hub pages

```text
app/learn/[slug]/page.tsx
```

is the single dynamic segment in the whole app. It reads `slug`, looks up a
`Stage` from `lib/topics.tsx`, and renders that stage's topic grid. Because
the full list of valid slugs is known at build time, it exports
`generateStaticParams()` returning every stage's slug — so despite being a
"dynamic route" in source, it's still fully prerendered per slug
(`● (SSG)` — Next calls this pattern static params generation) with no
server-side lookup at request time. An unknown slug calls `notFound()`.

### 3. `lib/topics.tsx` is the single source of truth for navigation

Every topic's card metadata (title, subtitle, description, preview icon,
built/not-built flag) and every group's metadata (slug, phase label, blurb)
lives in one `STAGES` array. Three consumers read from it instead of
duplicating this data:

- **`app/page.tsx`** (home) — renders one `GroupCard` per stage, linking to
  `/learn/<slug>`.
- **`app/learn/[slug]/page.tsx`** — renders the full topic grid for one stage.
- **`components/shared/SimulatorShell.tsx`** — the left-hand nav rail every
  simulator page shares, grouped the same way (`NAV_GROUPS`, kept in the
  same order as `STAGES`).

Adding a new topic to the site means: build the engine + page as above, add
one entry to the right stage in `STAGES`, and add one line to `NAV_GROUPS` —
the home page card, the hub page, and the sidebar all pick it up
automatically, nothing else to wire.

### 4. One real server route

```text
app/api/explain/route.ts
```

is the only route that actually runs server-side per request (`ƒ (Dynamic)`
in the build output) — it proxies a step's explanation text to the Groq API
for the "AI Explain" tab that appears on every simulator page. Everything
else on the site works with this route entirely absent (each page falls
back to just showing its own hand-written explanation text).

### 5. Cross-cutting pages that intentionally break the "engine + page" mold

A few pages are deliberately *not* built the same way, on purpose:

- **`/osi`, `/network-devices`, `/ipv6`** — reference pages (a map, not a
  simulation): plain data arrays in `lib/`, no `Step[]`, no playback.
- **`/browser-journey`** — the capstone. It has no engine of its own; it's a
  curated, ordered list of stages (`lib/browser-journey.ts`) that link out to
  the real per-protocol pages, tying the whole site into one story.
- **`/experiments/diagnostic`** — reuses `browser-journey.ts`'s stage list as
  data but adds its own branching-failure engine on top, as a sibling file
  rather than an edit to the capstone page.
- **`/topology`** (Network Lab) — the one page with continuous
  place/connect/rename/delete interaction instead of a single Send → scrub
  flow, so it has no `<Controls>` timeline; each action still goes through
  an engine, applied immediately rather than scrubbed.

### Realism

The simulations stay small on purpose, but they follow real behaviour where it matters:

- **TLS 1.3 handshake** — key shares in the Hello messages (ECDHE), then an encrypted
  certificate, CertificateVerify and Finished; one round trip.
- **Routing Tables** — longest-prefix match, administrative distance and metric
  tie-breaks, default gateway, per-hop Ethernet rewrite, TTL, unreachable/black-hole cases.
- **Link, Queue and Loss lab** — bandwidth, propagation delay and a drop-tail queue;
  TCP Reno and CUBIC filling the same bottleneck.
- **TCP** — SYN options (MSS, SACK, window scale, timestamps), SYN retransmission with
  exponential backoff and the 127-second connect timeout; CUBIC next to Reno.
- **Ethernet** — 64-byte minimum frame with padding, a real CRC-32, 1500-byte MTU.
- **HTTP** — keep-alive versus a new connection per request, `Cache-Control` and
  `ETag` revalidation (`304 Not Modified`).
- **Routed addressing** — topologies with routers now use one subnet per segment, a
  router interface (IP and MAC) per subnet, default gateways on hosts and per-router
  routing tables. The IPv4 and ICMP pages narrate real lookups and traceroute shows the
  interface each probe arrived on.
- **Capture Import** — open a real `.pcap`, `.pcapng` or Wireshark JSON export and step
  through it with explanations of handshakes, retransmissions, DNS and TLS. Everything is
  decoded in the browser; nothing is uploaded.
- Every page's **?** panel ends with an **In real networks** note on what production
  systems do beyond the simulation.

## Content scope

Organized as: **Foundation** (topology, packets, OSI, encapsulation, devices)
→ **Layer 2** (Ethernet, MAC learning, ARP) → **Layer 3** (IPv4, fragmentation,
subnetting, routing, routing tables with longest-prefix match, NAT, ICMP) → **Layer 4** (ports, UDP, TCP in full) →
**Application** (DHCP, DNS, HTTP, HTTPS, load balancing, the Browser Journey
capstone) → **Network Algorithms** (error detection, ARQ, medium access
control) → **Enterprise Networking** (VLANs, STP, routing protocols, IPv6,
wireless, WebSocket, email, SSH, firewalls/ACLs) → **Experiments** (parameter
labs, an analytical lab, a diagnostic lab, and a link/queue/loss lab).

Deliberately out of scope: BGP/MPLS/VXLAN/SDN/GRE/QoS/data-center fabrics and
similar carrier- or vendor-specific topics — the project draws its boundary
at what a solid undergraduate networking course plus practical infrastructure
literacy covers, not certification-exam or ISP-operator depth.

## Theme: Switchboard

The look is a telephone exchange: amber light pulses on graphite-blue panels, with Space Grotesk for headings, Geist for text and Geist Mono for addresses, ports and hex. The colours mean the same thing on every page:

| Colour | Meaning |
|---|---|
| Amber `#ffb347` | the packet, the active step, the brand |
| Periwinkle `#8b9cff` | structure: links, devices, lower layers |
| Teal `#2dd4bf` | delivered, ACK, success |
| Coral `#ff5d73` | dropped, error, bad checksum |
| Lemon `#e6e25a` | warning (kept apart from the amber brand colour) |
| Violet `#b48cff` | secure (TLS, SSH) or a further series |

Everything is defined in `app/globals.css` with Tailwind v4 `@theme`. Tailwind's own colour scales are re-pointed to this palette (indigo is now amber, violet is periwinkle, neutral is graphite-blue ink, emerald and green are teal, red and rose are coral, amber and yellow are lemon), so a class such as `text-indigo-400` or `bg-neutral-900` anywhere in the app already uses the Switchboard colours. `bg-indigo-600` is a burnt amber so white button text stays readable. Hard-coded hex colours in the SVG diagrams were mapped to the same palette.

### Home page hero

A carousel of five photographs of real network hardware (switches with ethernet cables plugged in, a patch panel, a rack, a field engineer) in an amber duotone sits behind the headline. It cross-fades every 6.5 seconds, pauses while the tab is hidden, and the dots at the bottom right let you pick a photo. With reduced motion switched on it shows one still photo and no dots. The first photo loads immediately and the other four a moment later, so they never delay the page. The photos live in `public/images`, so the site never calls Pexels when it runs. There is nothing else animated in the hero.

### Footer

The browsing pages (home, learn, learning path, OSI, IPv6, network devices) share one footer (`components/shared/SiteFooter.tsx`) with the photo credits. The simulator pages use a fixed full-height shell and deliberately have no footer, so the canvas keeps every pixel.

### Motion

Buttons, links and cards ease between states, pressed buttons dip slightly, and every page fades in (`app/template.tsx`). All of it respects the operating-system "reduce motion" setting.

## Image credits

The Home page carousel uses photographs from [Pexels](https://www.pexels.com) (free licence): Brett Sayles, Vladimir Srajber, cottonbro studio and Field Engineer. Each photographer is credited and linked in the footer. They are stored as WebP files in `public/images`, and no Pexels key is needed to run or deploy the site.

## Local development

```bash
npm install
cp .env.example .env.local
# then edit .env.local and paste your key: GROQ_API_KEY=<your_key>
# get a free key at https://console.groq.com/keys
npm run dev      # http://localhost:3000
npm run build    # production build — should emit only static + one dynamic route
```

`.env.local` is a plain text file in the project root — Next.js loads it
automatically and it's already excluded from git via `.env*` in
`.gitignore`. Without a key, every page still works; only the "Explain in
detail" panel shows a short "not configured" message instead.

### Optional settings

| Variable | Purpose | Default |
|---|---|---|
| `GROQ_API_KEY` | Enables the AI explanation panel (server-side only) | unset |
| `GROQ_MODEL` | Model used for explanations | `openai/gpt-oss-120b` |
| `EXPLAIN_RATE_PER_MIN` | AI requests allowed per visitor per minute | `12` |
| `EXPLAIN_GLOBAL_PER_MIN` | AI requests allowed for the whole site per minute | `120` |
| `TRUSTED_PROXY_HOPS` | Reverse proxies in front of the app (Vercel/nginx = 1) | `0` |

### Notes

- The AI route checks its input, allows same-origin calls only, and is rate limited; the key never reaches the browser.
- The engine check scripts described above are kept with the author's local files and are not part of this repository.

