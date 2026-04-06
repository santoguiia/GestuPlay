/**
 * Exponential Moving Average (EMA) filter for smoothing 2-D cursor coordinates.
 * Reduces jitter from webcam landmark noise while keeping latency low.
 *
 * Formula:  s_n = α * x_n + (1 - α) * s_{n-1}
 *
 * @param alpha  Smoothing factor in (0, 1].  Lower = smoother but laggier.
 */
export class EMAFilter {
  private alpha: number;
  private x: number | null = null;
  private y: number | null = null;

  constructor(alpha = 0.25) {
    this.alpha = Math.max(0.01, Math.min(1, alpha));
  }

  /** Feed a new raw sample and return the smoothed value. */
  filter(rawX: number, rawY: number): { x: number; y: number } {
    if (this.x === null || this.y === null) {
      this.x = rawX;
      this.y = rawY;
    } else {
      this.x = this.alpha * rawX + (1 - this.alpha) * this.x;
      this.y = this.alpha * rawY + (1 - this.alpha) * this.y;
    }
    return { x: this.x, y: this.y };
  }

  /** Reset internal state (e.g. when the hand disappears). */
  reset(): void {
    this.x = null;
    this.y = null;
  }
}
