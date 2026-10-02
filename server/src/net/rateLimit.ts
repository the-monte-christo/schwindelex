/** Fixed-window counter per key. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private limit: number;
  private windowMs: number;
  private now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Counts a hit; false if the key is over its limit. */
  hit(key: string): boolean {
    const w = this.current(key);
    w.count++;
    return w.count <= this.limit;
  }

  /** True if the key has used up its limit (without counting). */
  exhausted(key: string): boolean {
    return this.current(key).count >= this.limit;
  }

  private current(key: string): { start: number; count: number } {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    return w;
  }

  /** Drops expired windows so the map does not grow forever. */
  sweep(): void {
    const now = this.now();
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
