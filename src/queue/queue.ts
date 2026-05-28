export interface Queue<T> {
  add(job: string, data: T): Promise<void>;
  process(job: string, handler: (data: T) => Promise<void>): void;
}
