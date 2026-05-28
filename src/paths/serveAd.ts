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
