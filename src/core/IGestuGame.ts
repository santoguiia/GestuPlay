import type { NormalizedLandmarkList } from "@mediapipe/hands";

/**
 * Interface that every GestuPlay game must implement.
 * Follows a simple game-loop contract compatible with requestAnimationFrame.
 */
export interface IGestuGame {
  /** Called once when the game is mounted. Receives the canvas element. */
  init(canvas: HTMLCanvasElement): void;

  /**
   * Called every frame with the latest hand landmarks (or null when no hand
   * is detected).  Coordinates are normalised to [0, 1].
   */
  update(landmarks: NormalizedLandmarkList | null): void;

  /** Called every frame to render the game state onto the canvas context. */
  draw(ctx: CanvasRenderingContext2D): void;

  /** Called when the game is unmounted – clean up timers, listeners, etc. */
  destroy(): void;
}
