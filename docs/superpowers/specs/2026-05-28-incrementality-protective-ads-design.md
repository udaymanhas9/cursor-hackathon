# Incrementality Engine + Protective Fit-Gate — Design Spec

Date: 2026-05-28
Status: Approved (Approach A); pending implementation plan
Builds on: `docs/superpowers/specs/2026-05-28-adserve-mcp-boilerplate-design.md`
Research basis: `docs/superpowers/specs/2026-05-28-adserve-mcp-boilerplate-design.md` deep-research pass — of six proposed differentiators, native in-conversation incrementality (#1) is the genuine whitespace; protective/negative ads (#4) are unclaimed but unproven. This feature builds #1 + #4.

## 1. Purpose

Turn the existing ad-serving boilerplate into a system that **measures the causal lift of its own ads** and **bills advertisers only for incremental conversions**, while a **fit-score quality gate** can refuse to serve a poor-match ad (the "protective" posture that builds user trust).

Goal level: **demonstrate the mechanism.** The cohorts, lift arithmetic, incremental billing, and fit-gate are all real and inspectable. Statistical significance is *not* a goal — the demo shows the mechanism works end to end, not that a given lift number is significant.

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Approach | A — decision layer + in-memory experiment store, extending the existing paths/services/repos structure |
| Holdout assignment | Deterministic hash of `sessionId` → stable cohort; `HOLDOUT_RATE` default 0.1 |
| Protective behavior | Fit-score quality gate: best ad below `FIT_THRESHOLD` → withhold + honest "no strong match" reason |
| Holdout conversion attribution | Conversion webhook accepts `clickId` (treatment) OR `sessionId` (holdout/server-side signal) |
| Billing | Per-advertiser incremental conversions × CPA |
| Metrics surface | `GET /api/metrics/lift` (JSON) |
| Tests | None (project owner decision) — verify via `tsc --noEmit` + manual run |

## 3. Decision flow (rewritten `serveAd`)

Input `{ sessionId, prompt }` → `AdDecision`:

1. `intent = scoreIntent(prompt)`. If `intent.score < intentThreshold` → `{ outcome: "LOW_INTENT", adUrl: null, reason }`. No impression recorded.
2. `[marketData, ad] = Promise.all([search(intent.keywords), inventory.findBestAd(intent.category)])` (parallel fetch preserved — the Path A latency story). If `!ad` → `{ outcome: "NO_INVENTORY", adUrl: null, reason }`. No impression.
3. **Fit gate:** `fit = overmind.scoreFit(intent, ad)`. If `fit < fitThreshold` → `{ outcome: "DECLINED_FIT", adUrl: null, fitScore: fit, reason }` and `experiment.recordTrustEvent({ category, declined: true })`. No measurement impression.
4. **Cohort:** `cohort = assignCohort(sessionId, holdoutRate)`.
   - `"holdout"` → `experiment.recordImpression({ key: { sessionId }, cohort: "holdout", adId, advertiserId: ad.publisherId, category, bid: ad.bid, cpa: ad.cpa })`; return `{ outcome: "HOLDOUT", adUrl: null, fitScore: fit, reason: "holdout" }`. (In production the agent would simply serve nothing; the demo surfaces the reason for inspection.)
   - `"treatment"` → `trackingUrl = tracking.generateTrackedLink(ad, sessionId)` (returns a `clickId`); `experiment.recordImpression({ key: { clickId, sessionId }, cohort: "treatment", adId, advertiserId: ad.publisherId, category, bid: ad.bid, cpa: ad.cpa })`; return `{ outcome: "SERVED", adUrl: trackingUrl, trackingUrl, fitScore: fit, context: marketData.summary }`.

`generateTrackedLink` is extended to also return the `clickId` it generated (currently it only returns the URL) so `serveAd` can key the impression. The tracking service remains the single source of clickId generation.

## 4. Conversion attribution (the holdout crux)

A holdout serves no link, so there is no `clickId`. Real incrementality attributes control-group conversions at the user level via the advertiser's own server-side signal, not a click. The demo models this by extending the webhook:

- Body `{ clickId: string, revenue: number }` → **treatment** conversion. `experiment.recordConversion({ clickId, revenue })`.
- Body `{ sessionId: string, revenue: number, category?: string }` → **holdout/server-side** conversion. `experiment.recordConversion({ sessionId, category, revenue })`.
- Exactly one of `clickId` / `sessionId` must be present, plus a numeric `revenue`; otherwise `400`.

The existing payout/HITL worker logic (`processConversion`) is unchanged for the `clickId` path; it additionally calls `experiment.recordConversion(...)`. For `sessionId`-only conversions there is no click to stitch, so the worker records the experiment conversion and skips session-stitch/payout (logged), since holdout conversions are measurement-only.

## 5. Data model additions (`domain/types.ts`)

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
  clickId?: string;        // present for treatment only
  adId: string;
  advertiserId: string;    // publisherId of the served/would-be ad
  category: string;
  bid: number;
  cpa: number;
  converted: boolean;
  revenue: number;
  ts: string;
}
```

`AdMatch` gains `cpa: number` and `tags: string[]` (tags drive fit scoring).

`ConversionEvent` is widened so the queue can carry either attribution key:

```ts
export interface ConversionEvent {
  clickId?: string;    // treatment path
  sessionId?: string;  // holdout / server-side path
  category?: string;   // disambiguates holdout impression when sessionId-keyed
  revenue: number;
  ts: string;
}
```

The webhook guarantees exactly one of `clickId` / `sessionId` is set before enqueuing.

## 6. Components

| File | Responsibility |
|------|----------------|
| `src/experiment/assignment.ts` | `assignCohort(sessionId, holdoutRate): Cohort` — deterministic hash; stable per session |
| `src/experiment/store.ts` | `ExperimentStore` — `recordImpression`, `recordConversion` (by clickId or sessionId+category), `recordTrustEvent`, accessors |
| `src/experiment/lift.ts` | `LiftService.report()` — per-advertiser + aggregate lift, incremental conversions, incremental bill, trust block |
| `src/http/metrics.ts` | `GET /api/metrics/lift` handler |
| `src/services/overmind.ts` | + `scoreFit(intent, ad): number` on `OvermindService` and `MockOvermind` |
| `src/paths/serveAd.ts` | rewritten to the §3 decision flow, returns `AdDecision` |
| `src/paths/attribution.ts` | + record experiment conversion; handle sessionId-only path |
| `src/links/tracking.ts` | `generateTrackedLink` returns `{ url, clickId }` |
| `src/config.ts` | + `holdoutRate`, `fitThreshold`, `defaultCpa` |
| `src/data/seed.ts` | + `cpa` and `tags` on each ad |
| `src/index.ts` | construct `ExperimentStore` + `LiftService`; thread into serveAd/attribution deps; mount metrics route |

### `scoreFit` (mock)
Deterministic: fraction of `intent.keywords` that appear in the ad's `tags` (case-insensitive), so a marathon-specific need scores low against a generic running ad. Returns 0..1.

### Lift math (`LiftService`)
Per advertiser (and aggregate over all):
- `treatmentCR = treatmentConversions / treatmentImpressions`
- `holdoutCR = holdoutConversions / holdoutImpressions`
- `lift = treatmentCR > 0 ? (treatmentCR - holdoutCR) / treatmentCR : null`
- `incrementalConversions = treatmentConversions - treatmentImpressions * holdoutCR`
- `incrementalBill = max(0, incrementalConversions) * cpa`
- If either arm has 0 impressions → that advertiser's stats are `{ status: "insufficient_data" }` (no NaN).

### Trust block
Per category + aggregate: `served`, `declinedFit`, `declineRate = declinedFit / (served + declinedFit)`.

## 7. Error handling

- `serveAd` never throws to the MCP transport; the tool handler in `mcp/server.ts` keeps its try/catch and returns the `AdDecision` JSON.
- Webhook: valid = (`clickId` XOR `sessionId`) + numeric `revenue` → `202`; else `400`.
- `LiftService`: divide-by-zero guarded via `insufficient_data`.
- `assignCohort`: pure function; hash of sessionId mod a fixed denominator compared to `holdoutRate`.

## 8. Configuration additions

| Env var | Default | Purpose |
|---------|---------|---------|
| `HOLDOUT_RATE` | `0.1` | Fraction of sessions assigned to holdout |
| `FIT_THRESHOLD` | `0.5` | Min fit score to serve an ad (protective gate) |
| `DEFAULT_CPA` | `2.0` | Fallback CPA if an ad has none |

`.env.example` updated.

## 9. Verification (manual, no tests)

- `npm run typecheck` exits 0.
- `npm run dev` boots with the new route logged.
- Drive several `serve_ad` calls with session IDs that deterministically land in each arm (documented in the plan): observe `SERVED` (with trackingUrl), `HOLDOUT` (null), `DECLINED_FIT` (e.g. a marathon-specific prompt against generic inventory), `LOW_INTENT`, `NO_INVENTORY`.
- Post treatment conversions (`clickId`) and holdout conversions (`sessionId`).
- `GET /api/metrics/lift` shows non-trivial treatment vs holdout rates, an incremental-conversion count, an incremental bill, and the trust block with a non-zero decline rate.

## 10. Out of scope (YAGNI)

- Statistical significance / confidence intervals (deferred to the "statistically honest" version).
- Persistent storage; event-sourced ledger (Approach C).
- Real per-user identity resolution for holdout conversions (modeled via sessionId).
- Changing the MCP tool's external contract beyond the richer JSON result.
