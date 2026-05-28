import type { Request, Response } from "express";
import { ConversionEvent } from "../domain/types.js";
import { Queue } from "../queue/queue.js";

// Path B: ack fast (202), then enqueue for the background worker (Path C).
// Accepts a treatment conversion (clickId) OR a holdout/server-side conversion
// (sessionId, optionally a category). Exactly one key must be present.
export function conversionWebhookHandler(queue: Queue<ConversionEvent>) {
  return (req: Request, res: Response): void => {
    const body = req.body ?? {};
    const clickId = body.clickId;
    const sessionId = body.sessionId;
    const revenue = body.revenue;
    const category = body.category;

    const hasClick = typeof clickId === "string";
    const hasSession = typeof sessionId === "string";
    if (typeof revenue !== "number" || hasClick === hasSession) {
      res.status(400).json({
        error:
          "revenue (number) and exactly one of clickId | sessionId (string) are required",
      });
      return;
    }

    res.status(202).send("Accepted");

    const event: ConversionEvent = {
      revenue,
      ts: new Date().toISOString(),
      ...(hasClick ? { clickId } : {}),
      ...(hasSession ? { sessionId } : {}),
      ...(typeof category === "string" ? { category } : {}),
    };
    void queue.add("process-conversion", event);
  };
}
