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

## Content scope

Organized as: **Foundation** (topology, packets, OSI, encapsulation, devices)
→ **Layer 2** (Ethernet, MAC learning, ARP) → **Layer 3** (IPv4, fragmentation,
subnetting, routing, NAT, ICMP) → **Layer 4** (ports, UDP, TCP in full) →
**Application** (DHCP, DNS, HTTP, HTTPS, load balancing, the Browser Journey
capstone) → **Network Algorithms** (error detection, ARQ, medium access
control) → **Enterprise Networking** (VLANs, STP, routing protocols, IPv6,
wireless, WebSocket, email, SSH, firewalls/ACLs) → **Experiments** (parameter
labs, an analytical lab, a diagnostic lab).

Deliberately out of scope: BGP/MPLS/VXLAN/SDN/GRE/QoS/data-center fabrics and
similar carrier- or vendor-specific topics — the project draws its boundary
at what a solid undergraduate networking course plus practical infrastructure
literacy covers, not certification-exam or ISP-operator depth.

## Local development

```bash
npm install
cp .env.example .env.local
# then edit .env.local and paste your key: GROQ_API_KEY=<your_key>
# get a free key at https://console.groq.com/keys
npm run dev      # http://localhost:3000
npm run verify   # runs every engine's logic-only test script
npm run build    # production build — should emit only static + one dynamic route
```

`.env.local` is a plain text file in the project root — Next.js loads it
automatically and it's already excluded from git via `.env*` in
`.gitignore`. Without a key, every page still works; only the "Explain in
detail" panel shows a "Could not reach AI" message instead.
