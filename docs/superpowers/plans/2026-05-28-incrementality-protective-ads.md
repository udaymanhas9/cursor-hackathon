# Incrementality Engine + Protective Fit-Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the ad-serving boilerplate so it measures the causal lift of its own ads via holdout cohorts, bills advertisers for incremental conversions, and applies a fit-score quality gate that can refuse to serve a poor-match ad.

**Architecture:** Approach A — a decision layer in `serveAd` produces a structured `AdDecision` (SERVED/HOLDOUT/DECLINED_FIT/NO_INVENTORY/LOW_INTENT), an in-memory `ExperimentStore` records treatment/holdout impressions and conversions, and a `LiftService` exposes per-advertiser lift + incremental billing at `GET /api/metrics/lift`. Builds on the existing paths/services/repos structure.

**Tech Stack:** TypeScript (ESM, NodeNext), Express 5, `@modelcontextprotocol/sdk`, zod. **No automated tests** (project owner decision) — verification is `tsc --noEmit` per task plus a manual run in the final task.

**Spec:** `docs/superpowers/specs/2026-05-28-incrementality-protective-ads-design.md`

**Decomposition note:** Tasks 1–6 are additive (new files or additive type/config/seed changes) and keep `npm run typecheck` green. Task 7 is the integration: it changes the interlocking signatures (`serveAd`, tracking, `ConversionEvent`, webhook, attribution) and updates `index.ts` wiring together, so the build stays green at the commit boundary.

---

## File Structure

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `AdOutcome`, `Cohort`, `AdDecision`, `Impression`; add `tags`/`cpa` to `AdMatch`; widen `ConversionEvent` |
| `src/config.ts` | Add `holdoutRate`, `fitThreshold`, `defaultCpa` |
| `.env.example` | Document new env vars |
| `src/data/seed.ts` | Add `tags` + `cpa` to each ad |
| `src/services/overmind.ts` | Add `scoreFit` to interface + mock |
| `src/experiment/assignment.ts` | New: deterministic cohort assignment |
| `src/experiment/store.ts` | New: in-memory impression/conversion/trust store |
| `src/experiment/lift.ts` | New: lift + incremental-billing report |
| `src/http/metrics.ts` | New: `GET /api/metrics/lift` handler |
| `src/links/tracking.ts` | `generateTrackedLink` returns `{ url, clickId }` |
| `src/paths/serveAd.ts` | Rewrite to decision flow returning `AdDecision` |
| `src/http/webhook.ts` | Accept `clickId` XOR `sessionId` |
| `src/paths/attribution.ts` | Record experiment conversion; handle sessionId path |
| `src/index.ts` | Construct store + lift service; thread deps; mount metrics route |

---

## Task 1: Additive types, config, env, seed

Additive changes only. `ConversionEvent` is widened in Task 7 (it would break attribution otherwise); here we only add new exports and the required `AdMatch.tags`/optional `cpa`, plus the matching seed fields so the build stays green.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/config.ts`
- Modify: `.env.example`
- Modify: `src/data/seed.ts`

- [ ] **Step 1: Add new types and extend `AdMatch` in `src/domain/types.ts`**

Add `tags: string[];` and `cpa?: number;` to the existing `AdMatch` interface, and append these new exports at the end of the file:

```ts
export type AdOutcome =
  | "SERVED"
  | "HOLDOUT"
  | "DECLINED_FIT"
  | "NO_INVENTORY"
  | "LOW_INTENT";

export type Cohort = "treatment" | "holdout";

export interface AdDecision {
  outcome: AdOutcome;
  adUrl: string | null;
  trackingUrl?: string;
  context?: string;
  fitScore?: number;
  reason?: string;
}

export interface Impression {
  cohort: Cohort;
  sessionId: string;
  clickId?: string;
  adId: string;
  advertiserId: string;
  category: string;
  bid: number;
  cpa: number;
  converted: boolean;
  revenue: number;
  ts: string;
}
```

The resulting `AdMatch` must read:

```ts
export interface AdMatch {
  id: string;
  category: string;
  advertiser: string;
  publisherId: string;
  landingUrl: string;
  bid: number;
  tags: string[];
  cpa?: number;
}
```

- [ ] **Step 2: Extend `Config` in `src/config.ts`**

Add three fields to the `Config` interface (`holdoutRate: number; fitThreshold: number; defaultCpa: number;`) and to the returned object in `loadConfig`:

```ts
export interface Config {
  port: number;
  intentThreshold: number;
  tavilyApiKey?: string;
  fraudRevenueCeiling: number;
  holdoutRate: number;
  fitThreshold: number;
  defaultCpa: number;
}
```

In `loadConfig`'s returned object, add after `fraudRevenueCeiling`:

```ts
    holdoutRate: numberFromEnv(process.env.HOLDOUT_RATE, 0.1),
    fitThreshold: numberFromEnv(process.env.FIT_THRESHOLD, 0.5),
    defaultCpa: numberFromEnv(process.env.DEFAULT_CPA, 2.0),
```

- [ ] **Step 3: Document env vars in `.env.example`**

Append:

```dotenv

# Fraction of sessions assigned to the holdout (no-ad) control arm (0..1).
HOLDOUT_RATE=0.1

# Minimum fit score (0..1) to serve an ad; below this the ad is withheld.
FIT_THRESHOLD=0.5

# Fallback cost-per-action used for billing when an ad has no cpa.
DEFAULT_CPA=2.0
```

- [ ] **Step 4: Add `tags` + `cpa` to every ad in `src/data/seed.ts`**

Replace the `seedInventory` array with (note: the best-bid running ad `Velocity Shoes` deliberately lacks a `marathon` tag so a marathon-specific prompt triggers `DECLINED_FIT`):

```ts
export const seedInventory: AdMatch[] = [
  {
    id: "ad_running_01",
    category: "running",
    advertiser: "Velocity Shoes",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/velocity-running",
    bid: 4.5,
    cpa: 3.0,
    tags: ["running", "shoes", "everyday", "gym"],
  },
  {
    id: "ad_running_02",
    category: "running",
    advertiser: "TrailBlaze Gear",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/trailblaze",
    bid: 3.2,
    cpa: 2.5,
    tags: ["running", "trail", "hiking", "outdoor"],
  },
  {
    id: "ad_travel_01",
    category: "travel",
    advertiser: "SkyHigh Flights",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/skyhigh",
    bid: 6.1,
    cpa: 5.0,
    tags: ["flight", "travel", "trip", "vacation", "holiday", "hotel"],
  },
  {
    id: "ad_finance_01",
    category: "finance",
    advertiser: "NestEgg Invest",
    publisherId: "pub_gamma",
    landingUrl: "https://example.com/nestegg",
    bid: 8.0,
    cpa: 7.0,
    tags: ["invest", "stock", "savings", "mortgage", "loan", "crypto"],
  },
  {
    id: "ad_tech_01",
    category: "tech",
    advertiser: "PixelForge Laptops",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/pixelforge",
    bid: 5.4,
    cpa: 4.0,
    tags: ["laptop", "computer", "software", "gpu"],
  },
];
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/config.ts .env.example src/data/seed.ts
git commit -m "feat: add incrementality/fit types, config, and ad tags+cpa"
```

---

## Task 2: Fit scoring on Overmind

**Files:**
- Modify: `src/services/overmind.ts`

- [ ] **Step 1: Add `scoreFit` to the interface and import `AdMatch`**

Change the import line to include `AdMatch`:

```ts
import { AdMatch, AuditResult, Intent, Session } from "../domain/types.js";
```

Add to the `OvermindService` interface (after `scoreIntent`):

```ts
  scoreFit(intent: Intent, ad: AdMatch): Promise<number>;
```

- [ ] **Step 2: Implement `scoreFit` in `MockOvermind`**

Add this method to the `MockOvermind` class (e.g. after `scoreIntent`):

```ts
  // Deterministic fit: fraction of the intent's keywords present in the ad's
  // tags. A marathon-specific need scores low against a generic running ad.
  async scoreFit(intent: Intent, ad: AdMatch): Promise<number> {
    if (intent.keywords.length === 0) return 0;
    const tagSet = new Set(ad.tags.map((t) => t.toLowerCase()));
    const matched = intent.keywords.filter((k) => tagSet.has(k.toLowerCase()));
    return matched.length / intent.keywords.length;
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/services/overmind.ts
git commit -m "feat: add deterministic scoreFit to Overmind service"
```

---

## Task 3: Cohort assignment

**Files:**
- Create: `src/experiment/assignment.ts`

- [ ] **Step 1: Create `src/experiment/assignment.ts`**

```ts
import { Cohort } from "../domain/types.js";

// Deterministic FNV-1a hash → fraction in [0,1). The same sessionId always maps
// to the same cohort, so experiments are reproducible (no RNG, no Date).
export function hashFraction(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function assignCohort(sessionId: string, holdoutRate: number): Cohort {
  return hashFraction(sessionId) < holdoutRate ? "holdout" : "treatment";
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/experiment/assignment.ts
git commit -m "feat: add deterministic cohort assignment"
```

---

## Task 4: Experiment store

**Files:**
- Create: `src/experiment/store.ts`

- [ ] **Step 1: Create `src/experiment/store.ts`**

```ts
import { Cohort, Impression } from "../domain/types.js";

export interface ImpressionInput {
  cohort: Cohort;
  sessionId: string;
  clickId?: string;
  adId: string;
  advertiserId: string;
  category: string;
  bid: number;
  cpa: number;
}

export type TrustEventType = "served" | "declined";

// In-memory record of every ad decision that produced a measurement impression
// (treatment or holdout) plus trust events (served vs declined-for-fit).
export class ExperimentStore {
  private impressions: Impression[] = [];
  private byClickId = new Map<string, Impression>();
  private bySessionCategory = new Map<string, Impression>();
  private trust = new Map<string, { served: number; declined: number }>();

  private sessionCategoryKey(sessionId: string, category: string): string {
    return `${sessionId}::${category}`;
  }

  recordImpression(input: ImpressionInput): void {
    const impression: Impression = {
      ...input,
      converted: false,
      revenue: 0,
      ts: new Date().toISOString(),
    };
    this.impressions.push(impression);
    if (input.clickId) this.byClickId.set(input.clickId, impression);
    this.bySessionCategory.set(
      this.sessionCategoryKey(input.sessionId, input.category),
      impression,
    );
  }

  // Marks the matching impression converted. Treatment matches by clickId;
  // holdout/server-side matches by sessionId (+ category when provided).
  // Returns true if an impression was found.
  recordConversion(args: {
    clickId?: string;
    sessionId?: string;
    category?: string;
    revenue: number;
  }): boolean {
    let impression: Impression | undefined;
    if (args.clickId) {
      impression = this.byClickId.get(args.clickId);
    } else if (args.sessionId) {
      if (args.category) {
        impression = this.bySessionCategory.get(
          this.sessionCategoryKey(args.sessionId, args.category),
        );
      }
      if (!impression) {
        impression = this.impressions.find((i) => i.sessionId === args.sessionId);
      }
    }
    if (!impression) return false;
    impression.converted = true;
    impression.revenue += args.revenue;
    return true;
  }

  recordTrustEvent(category: string, type: TrustEventType): void {
    const entry = this.trust.get(category) ?? { served: 0, declined: 0 };
    entry[type] += 1;
    this.trust.set(category, entry);
  }

  allImpressions(): Impression[] {
    return this.impressions;
  }

  trustByCategory(): Map<string, { served: number; declined: number }> {
    return this.trust;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/experiment/store.ts
git commit -m "feat: add in-memory experiment store for impressions and conversions"
```

---

## Task 5: Lift service

**Files:**
- Create: `src/experiment/lift.ts`

- [ ] **Step 1: Create `src/experiment/lift.ts`**

```ts
import { ExperimentStore } from "./store.js";
import { Impression } from "../domain/types.js";

export interface AdvertiserLift {
  advertiserId: string;
  treatmentImpressions: number;
  treatmentConversions: number;
  holdoutImpressions: number;
  holdoutConversions: number;
  treatmentCR: number | null;
  holdoutCR: number | null;
  lift: number | null;
  incrementalConversions: number | null;
  incrementalBill: number | null;
  status: "ok" | "insufficient_data";
}

export interface TrustReport {
  category: string;
  served: number;
  declined: number;
  declineRate: number | null;
}

export interface LiftReport {
  advertisers: AdvertiserLift[];
  aggregate: AdvertiserLift;
  totalIncrementalBill: number;
  trust: TrustReport[];
}

export class LiftService {
  constructor(private store: ExperimentStore) {}

  private computeArm(impressions: Impression[], advertiserId: string): AdvertiserLift {
    const treatment = impressions.filter((i) => i.cohort === "treatment");
    const holdout = impressions.filter((i) => i.cohort === "holdout");
    const tImp = treatment.length;
    const hImp = holdout.length;
    const tConv = treatment.filter((i) => i.converted).length;
    const hConv = holdout.filter((i) => i.converted).length;

    if (tImp === 0 || hImp === 0) {
      return {
        advertiserId,
        treatmentImpressions: tImp,
        treatmentConversions: tConv,
        holdoutImpressions: hImp,
        holdoutConversions: hConv,
        treatmentCR: tImp ? tConv / tImp : null,
        holdoutCR: hImp ? hConv / hImp : null,
        lift: null,
        incrementalConversions: null,
        incrementalBill: null,
        status: "insufficient_data",
      };
    }

    const treatmentCR = tConv / tImp;
    const holdoutCR = hConv / hImp;
    const lift = treatmentCR > 0 ? (treatmentCR - holdoutCR) / treatmentCR : null;
    const incrementalConversions = tConv - tImp * holdoutCR;
    const cpa = treatment[0]?.cpa ?? 0;
    const incrementalBill = Math.max(0, incrementalConversions) * cpa;

    return {
      advertiserId,
      treatmentImpressions: tImp,
      treatmentConversions: tConv,
      holdoutImpressions: hImp,
      holdoutConversions: hConv,
      treatmentCR,
      holdoutCR,
      lift,
      incrementalConversions,
      incrementalBill,
      status: "ok",
    };
  }

  report(): LiftReport {
    const all = this.store.allImpressions();
    const advertiserIds = [...new Set(all.map((i) => i.advertiserId))];
    const advertisers = advertiserIds.map((id) =>
      this.computeArm(all.filter((i) => i.advertiserId === id), id),
    );
    const aggregate = this.computeArm(all, "ALL");
    const totalIncrementalBill = advertisers.reduce(
      (sum, a) => sum + (a.incrementalBill ?? 0),
      0,
    );

    const trust: TrustReport[] = [...this.store.trustByCategory().entries()].map(
      ([category, t]) => {
        const total = t.served + t.declined;
        return {
          category,
          served: t.served,
          declined: t.declined,
          declineRate: total ? t.declined / total : null,
        };
      },
    );

    return { advertisers, aggregate, totalIncrementalBill, trust };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/experiment/lift.ts
git commit -m "feat: add lift service with per-advertiser incremental billing"
```

---

## Task 6: Metrics HTTP handler

**Files:**
- Create: `src/http/metrics.ts`

- [ ] **Step 1: Create `src/http/metrics.ts`**

```ts
import type { Request, Response } from "express";
import { LiftService } from "../experiment/lift.js";

// GET /api/metrics/lift — returns the per-advertiser lift + trust report.
export function liftMetricsHandler(lift: LiftService) {
  return (_req: Request, res: Response): void => {
    res.json(lift.report());
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/http/metrics.ts
git commit -m "feat: add lift metrics endpoint handler"
```

---

## Task 7: Integration — decision flow, tracking, webhook, attribution, wiring

This task changes the interlocking signatures together and updates `index.ts`, so `npm run typecheck` is green at the commit boundary. Includes the manual run.

**Files:**
- Modify: `src/links/tracking.ts`
- Modify: `src/domain/types.ts` (widen `ConversionEvent`)
- Modify: `src/paths/serveAd.ts`
- Modify: `src/http/webhook.ts`
- Modify: `src/paths/attribution.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: `generateTrackedLink` returns `{ url, clickId }` in `src/links/tracking.ts`**

Replace the `generateTrackedLink` method body's return section so the whole method reads:

```ts
  // Generates a unique clickId, registers the click, and returns the ad's
  // landing URL (with the clickId appended) plus the clickId itself.
  generateTrackedLink(ad: AdMatch, sessionId: string): { url: string; clickId: string } {
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
    return { url: url.toString(), clickId };
  }
```

- [ ] **Step 2: Widen `ConversionEvent` in `src/domain/types.ts`**

Replace the existing `ConversionEvent` interface with:

```ts
export interface ConversionEvent {
  clickId?: string;
  sessionId?: string;
  category?: string;
  revenue: number;
  ts: string;
}
```

- [ ] **Step 3: Rewrite `src/paths/serveAd.ts`**

Replace the entire file with:

```ts
import { InventoryRepository } from "../data/repositories.js";
import { TrackingLinkService } from "../links/tracking.js";
import { OvermindService } from "../services/overmind.js";
import { SearchService } from "../services/tavily.js";
import { ExperimentStore } from "../experiment/store.js";
import { assignCohort } from "../experiment/assignment.js";
import { AdDecision } from "../domain/types.js";

export interface ServeAdDeps {
  overmind: OvermindService;
  search: SearchService;
  inventory: InventoryRepository;
  tracking: TrackingLinkService;
  experiment: ExperimentStore;
  intentThreshold: number;
  fitThreshold: number;
  holdoutRate: number;
  defaultCpa: number;
}

export interface ServeAdInput {
  sessionId: string;
  prompt: string;
}

export async function serveAd(
  input: ServeAdInput,
  deps: ServeAdDeps,
): Promise<AdDecision> {
  // 1. Gate on intent.
  const intent = await deps.overmind.scoreIntent(input.prompt);
  if (intent.score < deps.intentThreshold) {
    return {
      outcome: "LOW_INTENT",
      adUrl: null,
      reason: `intent ${intent.score.toFixed(2)} below threshold ${deps.intentThreshold}`,
    };
  }

  // 2. Parallel fetch: market data + best ad (preserves the Path A latency story).
  const [marketData, ad] = await Promise.all([
    deps.search.search(intent.keywords.join(" ")),
    deps.inventory.findBestAd(intent.category),
  ]);

  if (!ad) {
    return {
      outcome: "NO_INVENTORY",
      adUrl: null,
      reason: `no inventory for category ${intent.category}`,
    };
  }

  // 3. Protective fit gate: refuse to serve a poor-match ad.
  const fitScore = await deps.overmind.scoreFit(intent, ad);
  if (fitScore < deps.fitThreshold) {
    deps.experiment.recordTrustEvent(intent.category, "declined");
    return {
      outcome: "DECLINED_FIT",
      adUrl: null,
      fitScore,
      reason: `best match "${ad.advertiser}" scored ${fitScore.toFixed(2)} below fit threshold ${deps.fitThreshold}; no strong match for your need`,
    };
  }

  const cpa = ad.cpa ?? deps.defaultCpa;
  const cohort = assignCohort(input.sessionId, deps.holdoutRate);

  // 4a. Holdout: record the would-be impression, serve nothing.
  if (cohort === "holdout") {
    deps.experiment.recordImpression({
      cohort: "holdout",
      sessionId: input.sessionId,
      adId: ad.id,
      advertiserId: ad.publisherId,
      category: intent.category,
      bid: ad.bid,
      cpa,
    });
    return { outcome: "HOLDOUT", adUrl: null, fitScore, reason: "holdout" };
  }

  // 4b. Treatment: serve a tracked link, record the impression.
  const { url, clickId } = deps.tracking.generateTrackedLink(ad, input.sessionId);
  deps.experiment.recordImpression({
    cohort: "treatment",
    sessionId: input.sessionId,
    clickId,
    adId: ad.id,
    advertiserId: ad.publisherId,
    category: intent.category,
    bid: ad.bid,
    cpa,
  });
  deps.experiment.recordTrustEvent(intent.category, "served");
  return {
    outcome: "SERVED",
    adUrl: url,
    trackingUrl: url,
    fitScore,
    context: marketData.summary,
  };
}
```

(The MCP tool in `src/mcp/server.ts` calls `serveAd` and `JSON.stringify`s the result; the richer `AdDecision` serializes the same way, so no change is needed there.)

- [ ] **Step 4: Update `src/http/webhook.ts` to accept clickId XOR sessionId**

Replace the entire file with:

```ts
import type { Request, Response } from "express";
import { ConversionEvent } from "../domain/types.js";
import { Queue } from "../queue/queue.js";

// Path B: ack fast (202), then enqueue for the background worker (Path C).
// Accepts a treatment conversion (clickId) OR a holdout/server-side conversion
// (sessionId, optionally a category). Exactly one key must be present.
export function conversionWebhookHandler(queue: Queue<ConversionEvent>) {
  return (req: Request, res: Response): void => {
    const body = req.body ?? {};
    const clickId = body.clickId;
    const sessionId = body.sessionId;
    const revenue = body.revenue;
    const category = body.category;

    const hasClick = typeof clickId === "string";
    const hasSession = typeof sessionId === "string";
    if (typeof revenue !== "number" || hasClick === hasSession) {
      res.status(400).json({
        error:
          "revenue (number) and exactly one of clickId | sessionId (string) are required",
      });
      return;
    }

    res.status(202).send("Accepted");

    const event: ConversionEvent = {
      revenue,
      ts: new Date().toISOString(),
      ...(hasClick ? { clickId } : {}),
      ...(hasSession ? { sessionId } : {}),
      ...(typeof category === "string" ? { category } : {}),
    };
    void queue.add("process-conversion", event);
  };
}
```

- [ ] **Step 5: Update `src/paths/attribution.ts`**

Replace the entire file with:

```ts
import { PayoutRepository, SessionRepository } from "../data/repositories.js";
import { ConversionEvent } from "../domain/types.js";
import { Notifier } from "../services/notifier.js";
import { OvermindService } from "../services/overmind.js";
import { ExperimentStore } from "../experiment/store.js";

export interface AttributionDeps {
  sessions: SessionRepository;
  overmind: OvermindService;
  notifier: Notifier;
  payouts: PayoutRepository;
  experiment: ExperimentStore;
}

export async function processConversion(
  event: ConversionEvent,
  deps: AttributionDeps,
): Promise<void> {
  // Treatment conversion: record for lift, then stitch + fraud audit + payout.
  if (event.clickId) {
    deps.experiment.recordConversion({
      clickId: event.clickId,
      revenue: event.revenue,
    });
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
    return;
  }

  // Holdout / server-side conversion: measurement only, no click to stitch.
  if (event.sessionId) {
    const matched = deps.experiment.recordConversion({
      sessionId: event.sessionId,
      category: event.category,
      revenue: event.revenue,
    });
    console.log(
      `[attribution] holdout conversion for session ${event.sessionId} ${matched ? "recorded" : "(no matching impression)"}`,
    );
    return;
  }

  console.warn("[attribution] conversion event missing clickId and sessionId");
}
```

- [ ] **Step 6: Wire everything in `src/index.ts`**

Add these imports alongside the existing ones:

```ts
import { ExperimentStore } from "./experiment/store.js";
import { LiftService } from "./experiment/lift.js";
import { liftMetricsHandler } from "./http/metrics.js";
```

After the `// --- Services ---` block (where `tracking` is constructed), add:

```ts
// --- Experiment store + lift reporting ---
const experiment = new ExperimentStore();
const lift = new LiftService(experiment);
```

Update the queue worker registration to pass `experiment`:

```ts
queue.process("process-conversion", (event) =>
  processConversion(event, { sessions, overmind, notifier, payouts, experiment }),
);
```

Replace the `serveAdDeps` object with:

```ts
const serveAdDeps: ServeAdDeps = {
  overmind,
  search,
  inventory,
  tracking,
  experiment,
  intentThreshold: config.intentThreshold,
  fitThreshold: config.fitThreshold,
  holdoutRate: config.holdoutRate,
  defaultCpa: config.defaultCpa,
};
```

Add the metrics route after the webhook route:

```ts
// Lift / incremental-billing report.
app.get("/api/metrics/lift", liftMetricsHandler(lift));
```

Update the startup log block to add (after the webhook line):

```ts
  console.log(`  Metrics: GET  /api/metrics/lift`);
  console.log(`  Holdout: ${config.holdoutRate}  Fit floor: ${config.fitThreshold}`);
```

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 8: Manual run — boot with a demo holdout rate**

Start the server with a 50% holdout so both arms populate across varied session IDs:

Run: `HOLDOUT_RATE=0.5 npm run dev`
Expected: logs the route list including `Metrics: GET /api/metrics/lift` and `Holdout: 0.5  Fit floor: 0.5`.

- [ ] **Step 9: Manual run — exercise the decision outcomes via MCP**

In a second terminal. Each call uses `accept: application/json, text/event-stream` and reads the SSE `data:` line's `result.content[0].text` (a JSON `AdDecision`).

DECLINED_FIT (marathon-specific need vs generic running inventory):
```bash
curl -s -X POST localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"serve_ad","arguments":{"sessionId":"d1","prompt":"I need the best running shoes for a marathon"}}}'
```
Expected: `outcome:"DECLINED_FIT"`, `adUrl:null`, `fitScore` ~0.4, a "no strong match" reason.

LOW_INTENT:
```bash
curl -s -X POST localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"serve_ad","arguments":{"sessionId":"d2","prompt":"hello there"}}}'
```
Expected: `outcome:"LOW_INTENT"`, `adUrl:null`.

SERVED / HOLDOUT — call a high-fit finance prompt across several sessions; with `HOLDOUT_RATE=0.5` some land in each arm:
```bash
for s in s1 s2 s3 s4 s5 s6; do
  echo "== session $s =="
  curl -s -X POST localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"serve_ad\",\"arguments\":{\"sessionId\":\"$s\",\"prompt\":\"I want to buy stocks and invest in crypto\"}}}"
  echo
done
```
Expected: a mix of `outcome:"SERVED"` (with a `trackingUrl` containing `?clickId=...`) and `outcome:"HOLDOUT"` (`adUrl:null`, reason `"holdout"`).

- [ ] **Step 10: Manual run — post conversions for both arms, then read the lift report**

For at least one SERVED session, copy its `clickId` from the `trackingUrl` and post a treatment conversion:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST localhost:3000/api/webhooks/conversion \
  -H 'content-type: application/json' -d '{"clickId":"<PASTE_CLICKID>","revenue":40}'
```
Expected: `HTTP 202`; server logs a `[payout] approved 40 ...`.

For at least one HOLDOUT session (e.g. whichever of s1..s6 returned HOLDOUT), post a holdout conversion keyed by sessionId + category:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST localhost:3000/api/webhooks/conversion \
  -H 'content-type: application/json' -d '{"sessionId":"<HOLDOUT_SESSION>","category":"finance","revenue":40}'
```
Expected: `HTTP 202`; server logs `[attribution] holdout conversion for session <id> recorded`.

Malformed (both keys) → 400:
```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST localhost:3000/api/webhooks/conversion \
  -H 'content-type: application/json' -d '{"clickId":"x","sessionId":"y","revenue":1}'
```
Expected: `HTTP 400`.

Read the lift report:
```bash
curl -s localhost:3000/api/metrics/lift | python3 -m json.tool
```
Expected: an `advertisers` array including `pub_gamma` (NestEgg/finance) with treatment + holdout impressions and conversions, a numeric `lift`, `incrementalConversions`, and `incrementalBill`; a `totalIncrementalBill`; and a `trust` array where the `running` category shows `declined >= 1` and a non-zero `declineRate`. Advertisers with only one populated arm show `status:"insufficient_data"` (not NaN).

Stop the server (Ctrl-C).

- [ ] **Step 11: Commit**

```bash
git add src/links/tracking.ts src/domain/types.ts src/paths/serveAd.ts src/http/webhook.ts src/paths/attribution.ts src/index.ts
git commit -m "feat: wire incrementality decision flow, holdout conversions, and lift endpoint"
```

---

## Verification Summary

After all tasks:

- `npm run typecheck` exits 0.
- `serve_ad` returns the five `AdDecision` outcomes; a marathon-specific prompt is `DECLINED_FIT`, varied sessions split into `SERVED`/`HOLDOUT` at the configured holdout rate.
- The webhook accepts `clickId` (treatment) and `sessionId` (holdout) conversions and rejects malformed/ambiguous payloads with `400`.
- `GET /api/metrics/lift` reports per-advertiser lift, incremental conversions, incremental billing, a total bill, and a trust block with a non-zero decline rate; one-armed advertisers report `insufficient_data`.
