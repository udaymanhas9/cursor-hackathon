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
