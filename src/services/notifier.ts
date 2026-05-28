export interface Notifier {
  notifyAdmins(input: { traceId: string; reason: string }): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async notifyAdmins(input: { traceId: string; reason: string }): Promise<void> {
    console.warn(
      `[HITL] admin alert — trace=${input.traceId} reason=${input.reason}`,
    );
  }
}
