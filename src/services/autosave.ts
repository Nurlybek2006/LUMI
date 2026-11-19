export class SaveQueue<T> {
  private pending: T | null = null;
  private running: Promise<void> | null = null;
  private readonly save: (value: T) => Promise<void>;

  constructor(save: (value: T) => Promise<void>) { this.save = save; }

  enqueue(value: T): Promise<void> {
    this.pending = value;
    if (!this.running) this.running = this.drain();
    return this.running;
  }

  async flush(): Promise<void> {
    if (this.pending && !this.running) this.running = this.drain();
    await this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending !== null) {
        const current = this.pending;
        this.pending = null;
        await this.save(current);
      }
    } finally {
      this.running = null;
      if (this.pending !== null) this.running = this.drain();
    }
  }
}
