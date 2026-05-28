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
