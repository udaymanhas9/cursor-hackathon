import type { Request, Response } from "express";
import { ConversionEvent } from "../domain/types.js";
import { Queue } from "../queue/queue.js";

// Path B: ack fast (202), then enqueue for the background worker (Path C).
export function conversionWebhookHandler(queue: Queue<ConversionEvent>) {
  return (req: Request, res: Response): void => {
    const body = req.body ?? {};
    const clickId = body.clickId;
    const revenue = body.revenue;

    if (typeof clickId !== "string" || typeof revenue !== "number") {
      res.status(400).json({
        error: "clickId (string) and revenue (number) are required",
      });
      return;
    }

    res.status(202).send("Accepted");

    const event: ConversionEvent = {
      clickId,
      revenue,
      ts: new Date().toISOString(),
    };
    void queue.add("process-conversion", event);
  };
}
