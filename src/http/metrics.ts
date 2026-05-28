import type { Request, Response } from "express";
import { LiftService } from "../experiment/lift.js";

// GET /api/metrics/lift — returns the per-advertiser lift + trust report.
export function liftMetricsHandler(lift: LiftService) {
  return (_req: Request, res: Response): void => {
    res.json(lift.report());
  };
}
