import { randomUUID } from "node:crypto";
import { ClickRepository } from "../data/repositories.js";
import { AdMatch, Click } from "../domain/types.js";

export class TrackingLinkService {
  constructor(private clicks: ClickRepository) {}

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
}
