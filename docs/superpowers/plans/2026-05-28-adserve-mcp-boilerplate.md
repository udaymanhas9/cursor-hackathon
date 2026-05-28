# Ad-Serving MCP Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a runnable Node + TypeScript backend implementing the three async paths from `docs/Boilerplate.md` (ad serving via an MCP tool, an attribution webhook, and a background worker), runnable with zero infra and no required API keys.

**Architecture:** One Node process runs an Express HTTP server exposing two surfaces — a Streamable-HTTP MCP server at `POST /mcp` (the `serve_ad` tool = Path A) and a `POST /api/webhooks/conversion` endpoint (Path B) — plus an in-process queue worker (Path C). All external dependencies (Overmind, Tavily search, notifier, queue, datastore) sit behind typed interfaces with in-memory/mock implementations.

**Tech Stack:** TypeScript (ESM, NodeNext), Express 5, `@modelcontextprotocol/sdk`, `@tavily/core`, zod, dotenv, tsx. **No automated tests** (project owner decision) — verification is `tsc --noEmit` per task plus a manual run at the end.

**Spec:** `docs/superpowers/specs/2026-05-28-adserve-mcp-boilerplate-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `.gitignore`, `.env.example` | Project config, scripts, deps |
| `src/index.ts` | Boot: wire deps, mount routes, start worker |
| `src/config.ts` | Env loading + defaults |
| `src/domain/types.ts` | Shared domain types |
| `src/queue/queue.ts` | `Queue<T>` interface |
| `src/queue/memoryQueue.ts` | In-process queue (fire-and-forget) |
| `src/data/repositories.ts` | In-memory inventory / clicks / sessions / payouts |
| `src/data/seed.ts` | Sample inventory + a seed click/session |
| `src/links/tracking.ts` | `generateTrackedLink` + click registration |
| `src/services/overmind.ts` | Intent + fraud (mock) behind interface |
| `src/services/tavily.ts` | Real Tavily adapter + mock fallback behind interface |
| `src/services/notifier.ts` | HITL console notifier behind interface |
| `src/paths/serveAd.ts` | Path A orchestration |
| `src/paths/attribution.ts` | Path C worker job |
| `src/mcp/server.ts` | `McpServer` + `serve_ad` tool registration |
| `src/mcp/transport.ts` | Per-request Streamable-HTTP express handler |
| `src/http/webhook.ts` | Conversion webhook express handler |
| `README.md` | Run + ChatGPT-connection notes |

---

## Task 1: Project scaffold + dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/index.ts` (temporary stub, replaced in Task 16)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "adserve-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@tavily/core": "^0.5.0",
    "dotenv": "^16.4.5",
    "express": "^5.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 4: Create `.env.example`**

```dotenv
# Server
PORT=3000

# Path A intent gate (0..1). Prompts scoring below this get no ad.
INTENT_THRESHOLD=0.85

# Tavily search. If unset, a deterministic mock search is used.
TAVILY_API_KEY=

# Mock Overmind fraud check: revenue above this is flagged for a human.
FRAUD_REVENUE_CEILING=1000
```

- [ ] **Step 5: Create `src/index.ts` (temporary stub)**

```ts
console.log("adserve-mcp scaffold — replaced in Task 16");
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 7: Verify typecheck + run**

Run: `npm run typecheck`
Expected: exits 0, no errors.

Run: `npm run dev` (then Ctrl-C)
Expected: prints `adserve-mcp scaffold — replaced in Task 16`.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example src/index.ts package-lock.json
git commit -m "chore: scaffold TypeScript MCP boilerplate project"
```

---

## Task 2: Domain types

**Files:**
- Create: `src/domain/types.ts`

- [ ] **Step 1: Create `src/domain/types.ts`**

```ts
export interface Intent {
  score: number;
  keywords: string[];
  category: string;
}

export interface AdMatch {
  id: string;
  category: string;
  advertiser: string;
  publisherId: string;
  landingUrl: string;
  bid: number;
}

export interface MarketData {
  summary: string;
  results: { title: string; url: string; content: string }[];
}

export interface ConversionEvent {
  clickId: string;
  revenue: number;
  ts: string;
}

export interface Click {
  clickId: string;
  sessionId: string;
  adId: string;
  publisherId: string;
  ts: string;
}

export interface Session {
  sessionId: string;
  publisherId: string;
  clicks: Click[];
  prompt?: string;
}

export interface AuditResult {
  flaggedForHuman: boolean;
  traceId: string;
  reason?: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: add shared domain types"
```

---

## Task 3: Config loader

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create `src/config.ts`**

```ts
export interface Config {
  port: number;
  intentThreshold: number;
  tavilyApiKey?: string;
  fraudRevenueCeiling: number;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): Config {
  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
  return {
    port: numberFromEnv(process.env.PORT, 3000),
    intentThreshold: numberFromEnv(process.env.INTENT_THRESHOLD, 0.85),
    tavilyApiKey: tavilyApiKey ? tavilyApiKey : undefined,
    fraudRevenueCeiling: numberFromEnv(process.env.FRAUD_REVENUE_CEILING, 1000),
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add env-driven config loader"
```

---

## Task 4: Queue interface + in-memory implementation

**Files:**
- Create: `src/queue/queue.ts`
- Create: `src/queue/memoryQueue.ts`

- [ ] **Step 1: Create `src/queue/queue.ts`**

```ts
export interface Queue<T> {
  add(job: string, data: T): Promise<void>;
  process(job: string, handler: (data: T) => Promise<void>): void;
}
```

- [ ] **Step 2: Create `src/queue/memoryQueue.ts`**

```ts
import { Queue } from "./queue.js";

// Fire-and-forget in-process queue. `add` registers work on the microtask
// queue and returns immediately, so callers (e.g. the webhook) can ack first.
// Swap point: implement this same interface with BullMQ/Redis for production.
export class MemoryQueue<T> implements Queue<T> {
  private handlers = new Map<string, (data: T) => Promise<void>>();

  async add(job: string, data: T): Promise<void> {
    const handler = this.handlers.get(job);
    if (!handler) {
      console.warn(`[queue] no handler registered for job "${job}"`);
      return;
    }
    queueMicrotask(() => {
      handler(data).catch((err) => {
        console.error(`[queue] job "${job}" failed:`, err);
      });
    });
  }

  process(job: string, handler: (data: T) => Promise<void>): void {
    this.handlers.set(job, handler);
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/queue/queue.ts src/queue/memoryQueue.ts
git commit -m "feat: add swappable Queue interface with in-memory impl"
```

---

## Task 5: In-memory repositories

**Files:**
- Create: `src/data/repositories.ts`

- [ ] **Step 1: Create `src/data/repositories.ts`**

```ts
import { AdMatch, Click, Session } from "../domain/types.js";

export class InventoryRepository {
  constructor(private ads: AdMatch[]) {}

  async findBestAd(category: string): Promise<AdMatch | null> {
    const matches = this.ads.filter((a) => a.category === category);
    if (matches.length === 0) return null;
    return matches.reduce((best, a) => (a.bid > best.bid ? a : best));
  }

  getById(id: string): AdMatch | undefined {
    return this.ads.find((a) => a.id === id);
  }
}

export class ClickRepository {
  private clicks = new Map<string, Click>();

  register(click: Click): void {
    this.clicks.set(click.clickId, click);
  }

  getById(clickId: string): Click | undefined {
    return this.clicks.get(clickId);
  }

  bySession(sessionId: string): Click[] {
    return [...this.clicks.values()].filter((c) => c.sessionId === sessionId);
  }
}

export class SessionRepository {
  constructor(private clicks: ClickRepository) {}

  async stitchTimeline(clickId: string): Promise<Session> {
    const click = this.clicks.getById(clickId);
    if (!click) throw new Error(`unknown clickId: ${clickId}`);
    const sessionClicks = this.clicks.bySession(click.sessionId);
    return {
      sessionId: click.sessionId,
      publisherId: click.publisherId,
      clicks: sessionClicks,
    };
  }
}

export interface Payout {
  publisherId: string;
  revenue: number;
  approvedAt: string;
}

export class PayoutRepository {
  private payouts: Payout[] = [];

  async approve(publisherId: string, revenue: number): Promise<void> {
    this.payouts.push({
      publisherId,
      revenue,
      approvedAt: new Date().toISOString(),
    });
    console.log(`[payout] approved ${revenue} for publisher ${publisherId}`);
  }

  all(): Payout[] {
    return this.payouts;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/data/repositories.ts
git commit -m "feat: add in-memory inventory/click/session/payout repositories"
```

---

## Task 6: Seed data

**Files:**
- Create: `src/data/seed.ts`

- [ ] **Step 1: Create `src/data/seed.ts`**

```ts
import { AdMatch, Click } from "../domain/types.js";

export const seedInventory: AdMatch[] = [
  {
    id: "ad_running_01",
    category: "running",
    advertiser: "Velocity Shoes",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/velocity-running",
    bid: 4.5,
  },
  {
    id: "ad_running_02",
    category: "running",
    advertiser: "TrailBlaze Gear",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/trailblaze",
    bid: 3.2,
  },
  {
    id: "ad_travel_01",
    category: "travel",
    advertiser: "SkyHigh Flights",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/skyhigh",
    bid: 6.1,
  },
  {
    id: "ad_finance_01",
    category: "finance",
    advertiser: "NestEgg Invest",
    publisherId: "pub_gamma",
    landingUrl: "https://example.com/nestegg",
    bid: 8.0,
  },
  {
    id: "ad_tech_01",
    category: "tech",
    advertiser: "PixelForge Laptops",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/pixelforge",
    bid: 5.4,
  },
];

// A pre-registered click so the conversion webhook can be demoed immediately
// with clickId "seed_click_001".
export const seedClicks: Click[] = [
  {
    clickId: "seed_click_001",
    sessionId: "seed_session_001",
    adId: "ad_running_01",
    publisherId: "pub_alpha",
    ts: new Date().toISOString(),
  },
];
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/data/seed.ts
git commit -m "feat: add seed inventory and demo click"
```

---

## Task 7: Tracking links

**Files:**
- Create: `src/links/tracking.ts`

Note: refines the spec's `generateTrackedLink(adId, sessionId)` to take the full `AdMatch` (the caller in Path A already holds it), so the service can read `landingUrl`/`publisherId` without a repo lookup.

- [ ] **Step 1: Create `src/links/tracking.ts`**

```ts
import { randomUUID } from "node:crypto";
import { ClickRepository } from "../data/repositories.js";
import { AdMatch, Click } from "../domain/types.js";

export class TrackingLinkService {
  constructor(private clicks: ClickRepository) {}

  // Generates a unique clickId, registers the click, and returns the ad's
  // landing URL with the clickId appended for later attribution.
  generateTrackedLink(ad: AdMatch, sessionId: string): string {
    const clickId = randomUUID();
    const click: Click = {
      clickId,
      sessionId,
      adId: ad.id,
      publisherId: ad.publisherId,
      ts: new Date().toISOString(),
    };
    this.clicks.register(click);

    const url = new URL(ad.landingUrl);
    url.searchParams.set("clickId", clickId);
    return url.toString();
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/links/tracking.ts
git commit -m "feat: add tracking link service with click registration"
```

---

## Task 8: Overmind service (mock)

**Files:**
- Create: `src/services/overmind.ts`

- [ ] **Step 1: Create `src/services/overmind.ts`**

```ts
import { AuditResult, Intent, Session } from "../domain/types.js";

export interface OvermindService {
  scoreIntent(prompt: string): Promise<Intent>;
  evaluateFraudRisk(session: Session, revenue: number): Promise<AuditResult>;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  running: ["run", "running", "marathon", "shoe", "shoes", "jog"],
  travel: ["flight", "hotel", "trip", "travel", "vacation", "holiday"],
  finance: ["invest", "stock", "crypto", "loan", "mortgage", "savings"],
  tech: ["laptop", "phone", "gpu", "software", "ai", "computer"],
};

const BUY_SIGNALS = [
  "buy",
  "best",
  "recommend",
  "looking for",
  "need",
  "purchase",
  "deal",
  "cheap",
];

// Deterministic mock so behavior is repeatable across runs. Swap with a real
// Overmind client by implementing OvermindService.
export class MockOvermind implements OvermindService {
  constructor(private fraudRevenueCeiling: number) {}

  async scoreIntent(prompt: string): Promise<Intent> {
    const lower = prompt.toLowerCase();

    let category = "general";
    let bestHits = 0;
    let keywords: string[] = [];
    for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
      const matched = words.filter((w) => lower.includes(w));
      if (matched.length > bestHits) {
        bestHits = matched.length;
        category = cat;
        keywords = matched;
      }
    }

    const buyHits = BUY_SIGNALS.filter((s) => lower.includes(s)).length;
    const score = Math.min(1, 0.5 + 0.15 * bestHits + 0.12 * buyHits);

    return {
      score,
      keywords: keywords.length > 0 ? keywords : [category],
      category,
    };
  }

  async evaluateFraudRisk(
    session: Session,
    revenue: number,
  ): Promise<AuditResult> {
    const traceId = `trace_${session.sessionId}`;
    if (revenue > this.fraudRevenueCeiling) {
      return {
        flaggedForHuman: true,
        traceId,
        reason: `revenue ${revenue} exceeds ceiling ${this.fraudRevenueCeiling}`,
      };
    }
    if (session.clicks.length > 10) {
      return {
        flaggedForHuman: true,
        traceId,
        reason: `anomalous click count ${session.clicks.length}`,
      };
    }
    return { flaggedForHuman: false, traceId };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/overmind.ts
git commit -m "feat: add mock Overmind intent + fraud service"
```

---

## Task 9: Tavily search service (real + mock)

**Files:**
- Create: `src/services/tavily.ts`

- [ ] **Step 1: Create `src/services/tavily.ts`**

```ts
import { tavily } from "@tavily/core";
import { MarketData } from "../domain/types.js";

export interface SearchService {
  search(query: string): Promise<MarketData>;
}

export class TavilySearch implements SearchService {
  private client: ReturnType<typeof tavily>;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async search(query: string): Promise<MarketData> {
    try {
      const res = await this.client.search(query, {
        maxResults: 3,
        includeAnswer: true,
      });
      return {
        summary: res.answer ?? "",
        results: (res.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      };
    } catch (err) {
      // Graceful degradation: never block the ad on search failure.
      console.error("[tavily] search failed, returning empty market data:", err);
      return { summary: "", results: [] };
    }
  }
}

export class MockSearch implements SearchService {
  async search(query: string): Promise<MarketData> {
    return {
      summary: `Mock market summary for "${query}".`,
      results: [
        {
          title: `Top result for ${query}`,
          url: "https://example.com/result-1",
          content: "Sample market content for the boilerplate demo.",
        },
      ],
    };
  }
}

export function createSearchService(apiKey?: string): SearchService {
  return apiKey ? new TavilySearch(apiKey) : new MockSearch();
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0. (If `@tavily/core` types name the answer/result fields differently, adjust the `.map` accordingly — the shape used here matches the documented response: `answer`, `results[].title/url/content`.)

- [ ] **Step 3: Commit**

```bash
git add src/services/tavily.ts
git commit -m "feat: add Tavily search adapter with mock fallback"
```

---

## Task 10: Notifier service

**Files:**
- Create: `src/services/notifier.ts`

- [ ] **Step 1: Create `src/services/notifier.ts`**

```ts
export interface Notifier {
  notifyAdmins(input: { traceId: string; reason: string }): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async notifyAdmins(input: { traceId: string; reason: string }): Promise<void> {
    console.warn(
      `[HITL] admin alert — trace=${input.traceId} reason=${input.reason}`,
    );
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/notifier.ts
git commit -m "feat: add console HITL notifier"
```

---

## Task 11: Path A — serveAd orchestration

**Files:**
- Create: `src/paths/serveAd.ts`

- [ ] **Step 1: Create `src/paths/serveAd.ts`**

```ts
import { InventoryRepository } from "../data/repositories.js";
import { TrackingLinkService } from "../links/tracking.js";
import { OvermindService } from "../services/overmind.js";
import { SearchService } from "../services/tavily.js";

export interface ServeAdDeps {
  overmind: OvermindService;
  search: SearchService;
  inventory: InventoryRepository;
  tracking: TrackingLinkService;
  intentThreshold: number;
}

export interface ServeAdInput {
  sessionId: string;
  prompt: string;
}

export interface ServeAdResult {
  adUrl: string | null;
  trackingUrl?: string;
  context?: string;
  reason?: string;
}

export async function serveAd(
  input: ServeAdInput,
  deps: ServeAdDeps,
): Promise<ServeAdResult> {
  // 1. Gate on intent.
  const intent = await deps.overmind.scoreIntent(input.prompt);
  if (intent.score < deps.intentThreshold) {
    return {
      adUrl: null,
      reason: `intent ${intent.score.toFixed(2)} below threshold ${deps.intentThreshold}`,
    };
  }

  // 2. Parallel fetch: market data + best ad.
  const [marketData, adMatch] = await Promise.all([
    deps.search.search(intent.keywords.join(" ")),
    deps.inventory.findBestAd(intent.category),
  ]);

  if (!adMatch) {
    return { adUrl: null, reason: `no inventory for category ${intent.category}` };
  }

  // 3. Return a tracked link + market context.
  const trackingUrl = deps.tracking.generateTrackedLink(adMatch, input.sessionId);
  return { adUrl: trackingUrl, trackingUrl, context: marketData.summary };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/paths/serveAd.ts
git commit -m "feat: add Path A ad-serving orchestration"
```

---

## Task 12: Path C — attribution worker job

**Files:**
- Create: `src/paths/attribution.ts`

- [ ] **Step 1: Create `src/paths/attribution.ts`**

```ts
import { PayoutRepository, SessionRepository } from "../data/repositories.js";
import { ConversionEvent } from "../domain/types.js";
import { Notifier } from "../services/notifier.js";
import { OvermindService } from "../services/overmind.js";

export interface AttributionDeps {
  sessions: SessionRepository;
  overmind: OvermindService;
  notifier: Notifier;
  payouts: PayoutRepository;
}

export async function processConversion(
  event: ConversionEvent,
  deps: AttributionDeps,
): Promise<void> {
  const session = await deps.sessions.stitchTimeline(event.clickId);
  const audit = await deps.overmind.evaluateFraudRisk(session, event.revenue);

  if (audit.flaggedForHuman) {
    await deps.notifier.notifyAdmins({
      traceId: audit.traceId,
      reason: audit.reason ?? "unspecified",
    });
  } else {
    await deps.payouts.approve(session.publisherId, event.revenue);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/paths/attribution.ts
git commit -m "feat: add Path C attribution worker job"
```

---

## Task 13: MCP server + serve_ad tool

**Files:**
- Create: `src/mcp/server.ts`

- [ ] **Step 1: Create `src/mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { serveAd, ServeAdDeps } from "../paths/serveAd.js";

export function createMcpServer(deps: ServeAdDeps): McpServer {
  const server = new McpServer({ name: "adserve-mcp", version: "0.1.0" });

  server.registerTool(
    "serve_ad",
    {
      title: "Serve Ad",
      description:
        "Score a user's prompt for purchase intent and, if it clears the threshold, return a tracked ad link with market context.",
      inputSchema: {
        sessionId: z.string(),
        prompt: z.string(),
      },
    },
    async ({ sessionId, prompt }) => {
      try {
        const result = await serveAd({ sessionId, prompt }, deps);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text", text: `serve_ad failed: ${(err as Error).message}` },
          ],
        };
      }
    },
  );

  return server;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0. (If the installed SDK version rejects the raw-shape `inputSchema`, wrap it as `z.object({ ... })` — but v1.x `registerTool` expects the raw shape shown here.)

- [ ] **Step 3: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat: add MCP server with serve_ad tool"
```

---

## Task 14: MCP Streamable-HTTP transport handler

**Files:**
- Create: `src/mcp/transport.ts`

- [ ] **Step 1: Create `src/mcp/transport.ts`**

```ts
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { ServeAdDeps } from "../paths/serveAd.js";

// Stateless Streamable HTTP: build a fresh server + transport per POST and tear
// them down when the response closes. Clients must POST JSON-RPC and send
// `Accept: application/json, text/event-stream`.
export function mcpHttpHandler(deps: ServeAdDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/transport.ts
git commit -m "feat: add stateless Streamable-HTTP MCP transport handler"
```

---

## Task 15: Conversion webhook handler

**Files:**
- Create: `src/http/webhook.ts`

- [ ] **Step 1: Create `src/http/webhook.ts`**

```ts
import type { Request, Response } from "express";
import { ConversionEvent } from "../domain/types.js";
import { Queue } from "../queue/queue.js";

// Path B: ack fast (202), then enqueue for the background worker (Path C).
export function conversionWebhookHandler(queue: Queue<ConversionEvent>) {
  return (req: Request, res: Response): void => {
    const body = req.body ?? {};
    const clickId = body.clickId;
    const revenue = body.revenue;

    if (typeof clickId !== "string" || typeof revenue !== "number") {
      res.status(400).json({
        error: "clickId (string) and revenue (number) are required",
      });
      return;
    }

    res.status(202).send("Accepted");

    const event: ConversionEvent = {
      clickId,
      revenue,
      ts: new Date().toISOString(),
    };
    void queue.add("process-conversion", event);
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/http/webhook.ts
git commit -m "feat: add conversion webhook handler"
```

---

## Task 16: Wire everything in index.ts

**Files:**
- Modify (replace stub): `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with the full wiring**

```ts
import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { ConversionEvent } from "./domain/types.js";
import {
  ClickRepository,
  InventoryRepository,
  PayoutRepository,
  SessionRepository,
} from "./data/repositories.js";
import { seedClicks, seedInventory } from "./data/seed.js";
import { TrackingLinkService } from "./links/tracking.js";
import { MockOvermind } from "./services/overmind.js";
import { createSearchService } from "./services/tavily.js";
import { ConsoleNotifier } from "./services/notifier.js";
import { MemoryQueue } from "./queue/memoryQueue.js";
import { processConversion } from "./paths/attribution.js";
import { ServeAdDeps } from "./paths/serveAd.js";
import { mcpHttpHandler } from "./mcp/transport.js";
import { conversionWebhookHandler } from "./http/webhook.js";

const config = loadConfig();

// --- Data layer (in-memory, seeded) ---
const inventory = new InventoryRepository(seedInventory);
const clicks = new ClickRepository();
seedClicks.forEach((c) => clicks.register(c));
const sessions = new SessionRepository(clicks);
const payouts = new PayoutRepository();

// --- Services ---
const overmind = new MockOvermind(config.fraudRevenueCeiling);
const search = createSearchService(config.tavilyApiKey);
const notifier = new ConsoleNotifier();
const tracking = new TrackingLinkService(clicks);

// --- Queue + worker (Path C) ---
const queue = new MemoryQueue<ConversionEvent>();
queue.process("process-conversion", (event) =>
  processConversion(event, { sessions, overmind, notifier, payouts }),
);

// --- Path A deps ---
const serveAdDeps: ServeAdDeps = {
  overmind,
  search,
  inventory,
  tracking,
  intentThreshold: config.intentThreshold,
};

// --- HTTP server: MCP + webhook ---
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Path A: MCP tool surface for ChatGPT.
app.post("/mcp", mcpHttpHandler(serveAdDeps));

// Path B: conversion webhook for ad-network pixels/postbacks.
app.post("/api/webhooks/conversion", conversionWebhookHandler(queue));

app.listen(config.port, () => {
  console.log(`adserve-mcp listening on :${config.port}`);
  console.log(`  MCP:     POST /mcp`);
  console.log(`  Webhook: POST /api/webhooks/conversion`);
  console.log(`  Health:  GET  /health`);
  console.log(`  Search:  ${config.tavilyApiKey ? "Tavily (live)" : "Mock"}`);
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Manual run — server boots**

Run: `npm run dev`
Expected: logs `adserve-mcp listening on :3000`, the route list, and `Search: Mock`.

- [ ] **Step 4: Manual run — health + webhook (in a second terminal, server still running)**

Run: `curl -s localhost:3000/health`
Expected: `{"ok":true}`

Run: `curl -s -i -X POST localhost:3000/api/webhooks/conversion -H 'content-type: application/json' -d '{"clickId":"seed_click_001","revenue":50}'`
Expected: HTTP `202 Accepted`; server console logs `[payout] approved 50 for publisher pub_alpha`.

Run: `curl -s -i -X POST localhost:3000/api/webhooks/conversion -H 'content-type: application/json' -d '{"clickId":"seed_click_001","revenue":5000}'`
Expected: HTTP `202`; server console logs a `[HITL] admin alert` instead of a payout (5000 > 1000 ceiling).

Run: `curl -s -i -X POST localhost:3000/api/webhooks/conversion -H 'content-type: application/json' -d '{"bad":"payload"}'`
Expected: HTTP `400` with the validation error JSON.

Stop the server (Ctrl-C).

- [ ] **Step 5: Manual run — MCP serve_ad tool**

With the server running, in a second terminal initialize a session and call the tool. Streamable HTTP returns Server-Sent Events, so responses are `event:`/`data:` lines.

Initialize:
```bash
curl -s -i -X POST localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```
Expected: `200`, an SSE `data:` line with a `result` containing `serverInfo.name: "adserve-mcp"`.

Call the tool with a high-intent prompt:
```bash
curl -s -X POST localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"serve_ad","arguments":{"sessionId":"s1","prompt":"I need to buy the best running shoes for a marathon"}}}'
```
Expected: an SSE `data:` line whose `result.content[0].text` is JSON with a non-null `adUrl`/`trackingUrl` (a `https://example.com/velocity-running?clickId=...` URL) and a `context` string.

Call with a low-intent prompt:
```bash
curl -s -X POST localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"serve_ad","arguments":{"sessionId":"s2","prompt":"hello there"}}}'
```
Expected: `result.content[0].text` JSON with `adUrl: null` and a `reason` mentioning the threshold.

> If the raw `tools/call` handshake is awkward, the MCP Inspector (`npx @modelcontextprotocol/inspector`) pointed at `http://localhost:3000/mcp` (Streamable HTTP) gives a UI for the same checks.

Stop the server (Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire MCP, webhook, and worker into the HTTP server"
```

---

## Task 17: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# adserve-mcp

Hackathon boilerplate for an ad-serving system on ChatGPT (MCP) + Node/TypeScript.
Implements three async paths from `docs/Boilerplate.md`:

- **Path A — Ad Serving:** an MCP `serve_ad` tool gates on intent, fetches market
  data + best ad in parallel, and returns a tracked link.
- **Path B — Attribution webhook:** `POST /api/webhooks/conversion` acks `202`
  and enqueues the conversion.
- **Path C — Background worker:** stitches the session, runs a fraud audit, and
  either approves payout or escalates to a human (HITL).

Everything runs in-memory with no required API keys.

## Setup

```bash
npm install
cp .env.example .env   # optional; defaults work out of the box
npm run dev
```

Server starts on `:3000` (configurable via `PORT`).

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `INTENT_THRESHOLD` | `0.85` | Min intent score to serve an ad |
| `TAVILY_API_KEY` | _(unset)_ | Live Tavily search; mock used if unset |
| `FRAUD_REVENUE_CEILING` | `1000` | Mock fraud flag threshold |

## Endpoints

- `POST /mcp` — MCP Streamable-HTTP (the `serve_ad` tool). Point a ChatGPT
  connector / MCP client here.
- `POST /api/webhooks/conversion` — `{ "clickId": string, "revenue": number }`.
  Try the seeded click: `clickId: "seed_click_001"`.
- `GET /health` — liveness.

## Connecting ChatGPT

Expose `/mcp` publicly (e.g. a tunnel or the Alpic host) and add it as an MCP
server / connector. ChatGPT calls `serve_ad` with `{ sessionId, prompt }`.

## Swap points (production)

- **Queue:** replace `MemoryQueue` with a BullMQ/Redis implementation of the
  `Queue<T>` interface in `src/queue/queue.ts`.
- **Datastore:** replace the in-memory repositories in `src/data/repositories.ts`.
- **Overmind:** implement `OvermindService` against the real service.

> No automated tests in this project by design — verify with `npm run typecheck`
> and the manual checks above.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with run and ChatGPT-connection notes"
```

---

## Verification Summary

After all tasks:

- `npm run typecheck` exits 0.
- `npm run dev` boots and prints the route list with `Search: Mock`.
- `serve_ad` returns a tracked link for a high-intent prompt and `adUrl: null`
  for a low-intent one.
- The conversion webhook returns `202` and the worker logs a payout (normal
  revenue) or a HITL alert (revenue over the ceiling); malformed payload → `400`.
```
