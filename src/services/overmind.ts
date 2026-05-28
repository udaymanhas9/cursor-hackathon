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
