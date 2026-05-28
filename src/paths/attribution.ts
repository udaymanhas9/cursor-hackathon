import { PayoutRepository, SessionRepository } from "../data/repositories.js";
import { ConversionEvent } from "../domain/types.js";
import { Notifier } from "../services/notifier.js";
import { OvermindService } from "../services/overmind.js";

export interface AttributionDeps {
  sessions: SessionRepository;
  overmind: OvermindService;
  notifier: Notifier;
  payouts: PayoutRepository;
}

export async function processConversion(
  event: ConversionEvent,
  deps: AttributionDeps,
): Promise<void> {
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
}
