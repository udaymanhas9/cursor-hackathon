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
