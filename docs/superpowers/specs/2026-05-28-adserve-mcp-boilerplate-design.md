# Ad-Serving MCP Boilerplate — Design Spec

Date: 2026-05-28
Status: Approved (design); pending implementation plan
Source: `docs/Boilerplate.md`

## 1. Purpose

Scaffold a runnable Node + TypeScript backend that implements the three async
paths described in `docs/Boilerplate.md`:

- **Path A — Ad Serving (low latency):** ChatGPT calls a tool; we gate on intent,
  fetch market data + ad inventory in parallel, and return a tracked link.
- **Path B — Attribution webhook (fire & forget):** a conversion pixel/postback
  hits an HTTP endpoint; we ack `202` immediately and enqueue the event.
- **Path C — Background worker:** drains the queue, stitches the session
  timeline, runs a fraud audit, and either approves payout or escalates to a
  human (HITL).

The scaffold must boot and run end-to-end with **zero external infrastructure
and no required API keys**. It is a hackathon boilerplate, optimized for speed of
demo and clean extension points, not production hardening.

## 2. Locked decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Queue/broker | In-memory queue behind a `Queue<T>` interface | Runs with zero infra; BullMQ/Redis can drop in by implementing the same interface. The boilerplate's open "which broker?" question is answered: **swappable, in-memory by default.** |
| External services | Real Tavily adapter (when `TAVILY_API_KEY` set, else mock), Overmind always mocked | Tavily has a public API; Overmind is custom/fictional. All sit behind interfaces. |
| Datastore | In-memory repositories, seeded with sample inventory + click→session data | Zero setup; resets on restart. |
| Integration surface | Real MCP server (Path A tool) **plus** an Express webhook (Path B) on the same HTTP server | ChatGPT calls tools over MCP; pixel/postback conversions arrive as plain HTTP and cannot come over MCP. |
| Language/runtime | Node 20+, TypeScript, ESM | Matches the doc. |
| MCP SDK | `@modelcontextprotocol/sdk` (stable single package): `McpServer` + `registerTool` + `StreamableHTTPServerTransport` | Stable, widely deployed; pinned at implementation time. |
| Test runner | Vitest | Fast, TS-native, ESM-friendly. |

## 3. Architecture

A single Node process runs one HTTP server exposing two surfaces, plus an
in-process worker:

1. **MCP server** — `POST /mcp` (Streamable HTTP transport). Registers a
   `serve_ad` tool. This is **Path A**.
2. **Express webhook** — `POST /api/webhooks/conversion`. Returns `202` and
   enqueues. This is **Path B**.
3. **In-process worker** — subscribes to the queue and runs the attribution job.
   This is **Path C**.

External dependencies are accessed only through typed interfaces, so the process
boots without keys or network.

### Module layout

```
src/
  index.ts                 # boot HTTP server, mount /mcp + webhook, start worker
  config.ts                # env loading + flags (TAVILY_API_KEY, INTENT_THRESHOLD, PORT)
  mcp/
    server.ts              # McpServer + registerTool('serve_ad')
    transport.ts           # StreamableHTTPServerTransport wiring
  http/
    webhook.ts             # POST /api/webhooks/conversion -> 202 + enqueue
  paths/
    serveAd.ts             # Path A orchestration
    attribution.ts         # Path C worker job
  services/
    overmind.ts            # interface + mock (scoreIntent, evaluateFraudRisk)
    tavily.ts              # interface + real adapter (@tavily/core) + mock fallback
    notifier.ts            # interface + console HITL notifier
  queue/
    queue.ts               # Queue<T> interface
    memoryQueue.ts         # in-process implementation (swappable for BullMQ)
  data/
    repositories.ts        # in-memory inventory / sessions / payouts repos
    seed.ts                # sample ad inventory + click->session seed data
  domain/
    types.ts               # shared types
  links/
    tracking.ts            # generateTrackedLink + click registry
test/                      # Vitest unit tests mirroring src structure
```

## 4. Domain types (initial)

```ts
interface Intent { score: number; keywords: string[]; category: string; }
interface AdMatch { id: string; category: string; advertiser: string; landingUrl: string; bid: number; }
interface MarketData { summary: string; results: { title: string; url: string; content: string }[]; }
interface ConversionEvent { clickId: string; revenue: number; ts: string; }
interface Click { clickId: string; sessionId: string; adId: string; ts: string; }
interface Session { sessionId: string; clicks: Click[]; prompt?: string; }
interface AuditResult { flaggedForHuman: boolean; traceId: string; reason?: string; }
```

## 5. Component contracts

### Services

```ts
interface OvermindService {
  scoreIntent(prompt: string): Promise<Intent>;
  evaluateFraudRisk(session: Session, revenue: number): Promise<AuditResult>;
}
interface SearchService { search(query: string): Promise<MarketData>; }
interface Notifier { notifyAdmins(input: { traceId: string; reason: string }): Promise<void>; }
```

- **Overmind mock:** deterministic. `scoreIntent` derives a pseudo score and
  keywords/category from the prompt (e.g. keyword heuristics) so threshold tests
  are repeatable. `evaluateFraudRisk` flags when revenue exceeds a configured
  ceiling or the session has anomalous click counts.
- **Tavily adapter:** uses `@tavily/core` `search()`; maps results to
  `MarketData`. On missing key or any failure/timeout, returns an empty
  `MarketData` (graceful degradation — never blocks the ad). A `MockSearch`
  returns canned results for tests/no-key runs.

### Queue

```ts
interface Queue<T> {
  add(job: string, data: T): Promise<void>;
  process(job: string, handler: (data: T) => Promise<void>): void;
}
```

- **MemoryQueue:** dispatches asynchronously (`setImmediate`/microtask) so
  `add` returns before the handler runs, preserving fire-and-forget semantics.

### Repositories (in-memory)

- `inventory.findBestAd(category): Promise<AdMatch | null>` — best bid in category.
- `sessions.stitchTimeline(clickId): Promise<Session>` — assemble session from clicks.
- `payouts.approve(publisherId, revenue): Promise<void>` — record an approved payout.
- `clicks.register(click)` / lookup — populated by tracking-link generation + seed.

### Tracking links

```ts
generateTrackedLink(adId: string, sessionId: string): string  // returns URL with a clickId; registers the click
```

## 6. Data flow

- **Path A (`serve_ad`):** `{ sessionId, prompt }` → `scoreIntent` →
  if `score < INTENT_THRESHOLD` (default 0.85) return `{ adUrl: null }` →
  else `Promise.all([search(keywords), inventory.findBestAd(category)])` →
  if no `adMatch` return no-ad → else `generateTrackedLink` →
  return `{ trackingUrl, context: marketData.summary }`.
- **Path B (webhook):** parse/validate body → return `202 Accepted` →
  `queue.add('process-conversion', event)`.
- **Path C (worker):** `stitchTimeline(clickId)` → `evaluateFraudRisk` →
  if `flaggedForHuman` → `notifier.notifyAdmins(...)` →
  else `payouts.approve(session.publisherId, revenue)`.

## 7. Error handling

- **MCP tool:** wrap orchestration in try/catch; return a structured tool result
  with `isError: true` and a message — never throw into the transport.
- **Webhook:** malformed/invalid payload → `400`. Otherwise always `202`;
  enqueue failures are logged (they do not change the client response).
- **Worker:** per-job try/catch; failures are logged with the job name and data.
  (Real BullMQ would retry; MemoryQueue logs and drops, with a clear message.)
- **Tavily:** timeout/error → empty `MarketData`; the ad still serves.

## 8. Configuration

Env vars (all optional; sane defaults):

- `PORT` (default 3000)
- `INTENT_THRESHOLD` (default 0.85)
- `TAVILY_API_KEY` (absent → mock search)
- `FRAUD_REVENUE_CEILING` (default for the mock fraud check)

A `.env.example` documents these.

## 9. Testing (TDD, Vitest)

Tests are written before implementation per the TDD workflow. No network in
tests (Tavily mocked). Coverage:

- **serveAd:** below-threshold → no ad; above-threshold → parallel fetch + tracked
  link; no inventory match → no ad; Tavily failure → ad still served with empty context.
- **webhook:** valid payload → `202` and one job enqueued; malformed → `400`.
- **attribution worker:** clean session → payout approved; flagged session →
  notifier called, no payout.
- **tracking:** `generateTrackedLink` produces a unique clickId and registers a
  retrievable click; `stitchTimeline` reconstructs the session.
- **memoryQueue:** `add` returns before handler runs; handler receives the data.
- **overmind mock:** deterministic score for a given prompt.

## 10. Build & run

- `npm run dev` — start server (tsx/ts-node watch).
- `npm run build` — `tsc` to `dist/`.
- `npm test` — Vitest.
- `package.json`, `tsconfig.json` (ESM, strict), `.gitignore`, `.env.example`,
  and a short top-level `README.md` with run + ChatGPT-connection notes.

## 11. Out of scope (YAGNI)

- Real Redis/BullMQ wiring (interface only; documented as the swap point).
- Persistent database / migrations.
- Auth on the webhook or MCP endpoint.
- Real Overmind service.
- Deployment to Alpic (documented, not automated).

## 12. Open questions

None blocking. Broker question from the source doc is resolved (in-memory,
swappable). Deployment specifics (Alpic) are deferred.
