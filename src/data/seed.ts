import { AdMatch, Click } from "../domain/types.js";

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

// A pre-registered click so the conversion webhook can be demoed immediately
// with clickId "seed_click_001".
export const seedClicks: Click[] = [
  {
    clickId: "seed_click_001",
    sessionId: "seed_session_001",
    adId: "ad_running_01",
    publisherId: "pub_alpha",
    ts: new Date().toISOString(),
  },
];
