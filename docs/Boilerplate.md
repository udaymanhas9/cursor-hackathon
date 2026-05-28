Architecture: ChatGPT + TypeScript + Async
1. Integration Map
• Frontend: ChatGPT (Custom GPT). Communicates via OpenAPI Actions.
• Backend Host: Alpic (Node.js/Express). Serves MCP endpoints to ChatGPT.
• Middleware/Workers: TypeScript. Heavy use of Promise.all and background queues.
2. Async Execution Flow
• Path A: Ad Serving (Low Latency) 1. ChatGPT POSTs prompt to Alpic /serve-ad. 2. Await Overmind intent score. Block if low. 3. If high intent, run Tavily search and Ad Inventory lookup simultaneously via Promise.all. 4. Return tracking link to ChatGPT.
• Path B: Attribution (Fire & Forget) 1. Pixel/Postback hits Alpic /webhook/conversion. 2. Alpic returns HTTP 202 Accepted immediately. 3. Webhook payload pushed to async worker queue. 4. Background worker stitches session and triggers Overmind fraud audit. 5. Overmind pauses payout and alerts Human-in-the-Loop if anomaly detected.
3. Core Implementation (TypeScript)
// --- PATH A: Ad Serving (Called by ChatGPT Action) ---
app.post('/api/ads/serve', async (req: Request, res: Response) => {
  const { sessionId, prompt } = req.body;

  // 1. Gate: Await intent
  const intent = await overmind.scoreIntent(prompt);
  if (intent.score < 0.85) return res.json({ adUrl: null });

  // 2. Parallel Fetch: Search + Inventory
  const [marketData, adMatch] = await Promise.all([
    tavily.search({ query: intent.keywords }),
    db.inventory.findBestAd(intent.category)
  ]);

  // 3. Return to ChatGPT
  const trackingUrl = generateTrackedLink(adMatch.id, sessionId);
  res.json({ trackingUrl, context: marketData.summary });
});

// --- PATH B: Async Attribution Webhook ---
app.post('/api/webhooks/conversion', (req: Request, res: Response) => {
  // 1. Fast Ack
  res.status(202).send('Accepted');

  // 2. Push to background queue (e.g., Redis/BullMQ)
  attributionQueue.add('process-conversion', req.body);
});

// --- PATH C: Background Worker ---
attributionQueue.process(async (job) => {
  const { clickId, revenue } = job.data;
  
  // Stitch timeline
  const fullSession = await db.stitchTimeline(clickId);

  // Overmind HITL Audit
  const auditResult = await overmind.evaluateFraudRisk(fullSession, revenue);
  
  if (auditResult.flaggedForHuman) {
    await notifyAdmins({ traceId: auditResult.traceId, reason: auditResult.reason });
  } else {
    await db.payouts.approve(fullSession.publisherId, revenue);
  }
});

Which message broker will handle the async conversion queues in production?