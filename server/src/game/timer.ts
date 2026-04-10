/**
 * Server-authoritative countdown timer.
 *
 * Fires `onTick` every second with the remaining milliseconds and
 * `onExpire` exactly once when the timer reaches zero.
 */
export class GameTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;
  private duration: number = 0;
  private expired: boolean = false;
  private stopped: boolean = false;
  private onExpireCallback: (() => void) | null = null;

  /**
   * Start a countdown.
   *
   * @param durationMs  Total duration in milliseconds.
   * @param onTick      Called every ~1 000 ms with remaining ms.
   * @param onExpire    Called once when the timer reaches 0.
   */
  start(
    durationMs: number,
    onTick: (remainingMs: number) => void,
    onExpire: () => void,
  ): void {
    this.stop(); // clear any previous timer

    this.duration = durationMs;
    this.startTime = Date.now();
    this.expired = false;
    this.stopped = false;
    this.onExpireCallback = onExpire;

    // Tick every second
    this.intervalId = setInterval(() => {
      if (this.stopped) return;
      const remaining = this.getRemainingMs();
      if (remaining <= 0) {
        this.handleExpiry(onExpire);
      } else {
        onTick(remaining);
      }
    }, 1_000);

    // Hard deadline so we never overshoot
    this.timeoutId = setTimeout(() => {
      if (this.stopped) return;
      this.handleExpiry(onExpire);
    }, durationMs);

    // Fire an initial tick immediately so clients know the starting value
    onTick(durationMs);
  }

  /** Milliseconds remaining, clamped to 0. */
  getRemainingMs(): number {
    if (this.expired || this.stopped) return 0;
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.duration - elapsed);
  }

  /** Whether the timer has reached zero. */
  isExpired(): boolean {
    return this.expired;
  }

  /** Cancel the timer without firing `onExpire`. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
  }

  /** Force the timer to expire immediately, triggering `onExpire`. */
  forceExpire(): void {
    if (this.expired || this.stopped) return;
    if (this.onExpireCallback) {
      this.handleExpiry(this.onExpireCallback);
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private handleExpiry(onExpire: () => void): void {
    if (this.expired) return;
    this.expired = true;
    this.clearTimers();
    onExpire();
  }

  private clearTimers(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
