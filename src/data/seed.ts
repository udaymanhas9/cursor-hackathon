import { AdMatch, Click } from "../domain/types.js";

export const seedInventory: AdMatch[] = [
  {
    id: "ad_running_01",
    category: "running",
    advertiser: "Velocity Shoes",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/velocity-running",
    bid: 4.5,
  },
  {
    id: "ad_running_02",
    category: "running",
    advertiser: "TrailBlaze Gear",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/trailblaze",
    bid: 3.2,
  },
  {
    id: "ad_travel_01",
    category: "travel",
    advertiser: "SkyHigh Flights",
    publisherId: "pub_alpha",
    landingUrl: "https://example.com/skyhigh",
    bid: 6.1,
  },
  {
    id: "ad_finance_01",
    category: "finance",
    advertiser: "NestEgg Invest",
    publisherId: "pub_gamma",
    landingUrl: "https://example.com/nestegg",
    bid: 8.0,
  },
  {
    id: "ad_tech_01",
    category: "tech",
    advertiser: "PixelForge Laptops",
    publisherId: "pub_beta",
    landingUrl: "https://example.com/pixelforge",
    bid: 5.4,
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
