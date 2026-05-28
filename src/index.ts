import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { ConversionEvent } from "./domain/types.js";
import {
  ClickRepository,
  InventoryRepository,
  PayoutRepository,
  SessionRepository,
} from "./data/repositories.js";
import { seedClicks, seedInventory } from "./data/seed.js";
import { TrackingLinkService } from "./links/tracking.js";
import { MockOvermind } from "./services/overmind.js";
import { createSearchService } from "./services/tavily.js";
import { ConsoleNotifier } from "./services/notifier.js";
import { MemoryQueue } from "./queue/memoryQueue.js";
import { processConversion } from "./paths/attribution.js";
import { ServeAdDeps } from "./paths/serveAd.js";
import { mcpHttpHandler } from "./mcp/transport.js";
import { conversionWebhookHandler } from "./http/webhook.js";
import { ExperimentStore } from "./experiment/store.js";
import { LiftService } from "./experiment/lift.js";
import { liftMetricsHandler } from "./http/metrics.js";

const config = loadConfig();

// --- Data layer (in-memory, seeded) ---
const inventory = new InventoryRepository(seedInventory);
const clicks = new ClickRepository();
seedClicks.forEach((c) => clicks.register(c));
const sessions = new SessionRepository(clicks);
const payouts = new PayoutRepository();

// --- Services ---
const overmind = new MockOvermind(config.fraudRevenueCeiling);
const search = createSearchService(config.tavilyApiKey);
const notifier = new ConsoleNotifier();
const tracking = new TrackingLinkService(clicks);

// --- Experiment store + lift reporting ---
const experiment = new ExperimentStore();
const lift = new LiftService(experiment);

// --- Queue + worker (Path C) ---
const queue = new MemoryQueue<ConversionEvent>();
queue.process("process-conversion", (event) =>
  processConversion(event, { sessions, overmind, notifier, payouts, experiment }),
);

// --- Path A deps ---
const serveAdDeps: ServeAdDeps = {
  overmind,
  search,
  inventory,
  tracking,
  experiment,
  intentThreshold: config.intentThreshold,
  fitThreshold: config.fitThreshold,
  holdoutRate: config.holdoutRate,
  defaultCpa: config.defaultCpa,
};

// --- HTTP server: MCP + webhook ---
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Path A: MCP tool surface for ChatGPT.
app.post("/mcp", mcpHttpHandler(serveAdDeps));

// Path B: conversion webhook for ad-network pixels/postbacks.
app.post("/api/webhooks/conversion", conversionWebhookHandler(queue));

// Lift / incremental-billing report.
app.get("/api/metrics/lift", liftMetricsHandler(lift));

app.listen(config.port, () => {
  console.log(`adserve-mcp listening on :${config.port}`);
  console.log(`  MCP:     POST /mcp`);
  console.log(`  Webhook: POST /api/webhooks/conversion`);
  console.log(`  Metrics: GET  /api/metrics/lift`);
  console.log(`  Health:  GET  /health`);
  console.log(`  Search:  ${config.tavilyApiKey ? "Tavily (live)" : "Mock"}`);
  console.log(`  Holdout: ${config.holdoutRate}  Fit floor: ${config.fitThreshold}`);
});
