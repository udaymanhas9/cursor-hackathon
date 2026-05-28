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
