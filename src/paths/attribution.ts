import { PayoutRepository, SessionRepository } from "../data/repositories.js";
import { ConversionEvent } from "../domain/types.js";
import { Notifier } from "../services/notifier.js";
import { OvermindService } from "../services/overmind.js";
import { ExperimentStore } from "../experiment/store.js";

export interface AttributionDeps {
  sessions: SessionRepository;
  overmind: OvermindService;
  notifier: Notifier;
  payouts: PayoutRepository;
  experiment: ExperimentStore;
}

export async function processConversion(
  event: ConversionEvent,
  deps: AttributionDeps,
): Promise<void> {
  // Treatment conversion: record for lift, then stitch + fraud audit + payout.
  if (event.clickId) {
    deps.experiment.recordConversion({
      clickId: event.clickId,
      revenue: event.revenue,
    });
    const session = await deps.sessions.stitchTimeline(event.clickId);
    const audit = await deps.overmind.evaluateFraudRisk(session, event.revenue);
    if (audit.flaggedForHuman) {
      await deps.notifier.notifyAdmins({
        traceId: audit.traceId,
        reason: audit.reason ?? "unspecified",
      });
    } else {
      await deps.payouts.approve(session.publisherId, event.revenue);
    }
    return;
  }

  // Holdout / server-side conversion: measurement only, no click to stitch.
  if (event.sessionId) {
    const matched = deps.experiment.recordConversion({
      sessionId: event.sessionId,
      category: event.category,
      revenue: event.revenue,
    });
    console.log(
      `[attribution] holdout conversion for session ${event.sessionId} ${matched ? "recorded" : "(no matching impression)"}`,
    );
    return;
  }

  console.warn("[attribution] conversion event missing clickId and sessionId");
}
