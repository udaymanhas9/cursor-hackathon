import { Queue } from "./queue.js";

// Fire-and-forget in-process queue. `add` registers work on the microtask
// queue and returns immediately, so callers (e.g. the webhook) can ack first.
// Swap point: implement this same interface with BullMQ/Redis for production.
export class MemoryQueue<T> implements Queue<T> {
  private handlers = new Map<string, (data: T) => Promise<void>>();

  async add(job: string, data: T): Promise<void> {
    const handler = this.handlers.get(job);
    if (!handler) {
      console.warn(`[queue] no handler registered for job "${job}"`);
      return;
    }
    queueMicrotask(() => {
      handler(data).catch((err) => {
        console.error(`[queue] job "${job}" failed:`, err);
      });
    });
  }

  process(job: string, handler: (data: T) => Promise<void>): void {
    this.handlers.set(job, handler);
  }
}
