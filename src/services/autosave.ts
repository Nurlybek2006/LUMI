export class SaveQueue<T> {
  private pending: T | null = null;
  private running: Promise<void> | null = null;
  private readonly save: (value: T) => Promise<void>;

  constructor(save: (value: T) => Promise<void>) { this.save = save; }

  enqueue(value: T): Promise<void> {
    this.pending = value;
    return this.start();
  }

  async flush(): Promise<void> {
    while (this.pending !== null || this.running !== null) {
      const active = this.running ?? this.start();
      await active;
    }
  }

  private start(): Promise<void> {
    if (this.running) return this.running;
    const active = this.drain();
    this.running = active;
    // Clear the in-flight marker on both success and failure. Attaching a
    // two-branch handler avoids creating an unobserved rejected promise.
    void active.then(
      () => { if (this.running === active) this.running = null; },
      () => { if (this.running === active) this.running = null; }
    );
    return active;
  }

  private async drain(): Promise<void> {
    while (this.pending !== null) {
      const current = this.pending;
      this.pending = null;
      try {
        await this.save(current);
      } catch (error) {
        // Preserve a failed write for an explicit flush/retry, unless a newer
        // edit arrived while the failed write was in progress.
        if (this.pending === null) this.pending = current;
        throw error;
      }
    }
  }
}
