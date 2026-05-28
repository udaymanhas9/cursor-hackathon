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
  tags: string[];
  cpa?: number;
}

export interface MarketData {
  summary: string;
  results: { title: string; url: string; content: string }[];
}

export interface ConversionEvent {
  clickId?: string;
  sessionId?: string;
  category?: string;
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
