/**
 * VisionManager – Singleton that owns the webcam stream and MediaPipe Hands.
 *
 * Architecture
 * ─────────────
 *  Webcam → requestAnimationFrame capture → MediaPipe Hands (main thread)
 *                                                  ↓
 *                                      LANDMARKS result
 *                                                  ↓
 *                           Observer callbacks (registered via `subscribe`)
 *
 * MediaPipe Hands is loaded via a CDN <script> tag in index.html (the npm
 * package is used only for TypeScript type definitions). This avoids bundler
 * compatibility issues with the closure-compiled, globals-based hands.js.
 *
 * The capture loop runs via requestAnimationFrame so it is paused when the
 * tab is backgrounded, saving CPU automatically.
 */

import type { Hands as HandsType, Results, NormalizedLandmarkList } from "@mediapipe/hands";
import { EMAFilter } from "./EMAFilter";

export type LandmarkObserver = (
  landmarks: NormalizedLandmarkList | null
) => void;

// EMA-smoothed tip of index finger (landmark 8) in normalised [0,1] space
export type CursorPosition = { x: number; y: number } | null;
export type CursorObserver = (pos: CursorPosition) => void;

const INDEX_TIP = 8; // MediaPipe landmark index for index-finger tip

// @mediapipe/hands exposes its classes via globalThis when loaded from CDN
const HandsClass = (globalThis as unknown as { Hands: typeof HandsType }).Hands;

export class VisionManager {
  // ── Singleton ──────────────────────────────────────────────────────────────
  private static instance: VisionManager | null = null;

  static getInstance(): VisionManager {
    if (!VisionManager.instance) {
      VisionManager.instance = new VisionManager();
    }
    return VisionManager.instance;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  private hands: HandsType | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId: number | null = null;

  private landmarkObservers = new Set<LandmarkObserver>();
  private cursorObservers = new Set<CursorObserver>();

  private emaFilter = new EMAFilter(0.25);
  private frameInFlight = false;
  private handsReady = false;

  private constructor() {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start webcam capture and initialise MediaPipe Hands. */
  async start(): Promise<void> {
    if (this.stream) return; // already running

    if (!HandsClass) {
      throw new Error(
        "MediaPipe Hands is not loaded. Ensure the CDN <script> tag is present in index.html."
      );
    }

    // 1. Acquire webcam
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });

    // 2. Attach to hidden <video>
    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();

    // 3. Initialise MediaPipe Hands
    // locateFile points to the CDN for WASM/model files.
    this.hands = new HandsClass({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results: Results) => {
      this.frameInFlight = false;
      const landmarks: NormalizedLandmarkList | null =
        results.multiHandLandmarks && results.multiHandLandmarks.length > 0
          ? results.multiHandLandmarks[0]
          : null;

      // Notify raw-landmark observers (games, etc.)
      this.landmarkObservers.forEach((fn) => fn(landmarks));

      // Derive + smooth cursor position from index-finger tip
      if (landmarks) {
        const tip = landmarks[INDEX_TIP];
        const smooth = this.emaFilter.filter(tip.x, tip.y);
        this.cursorObservers.forEach((fn) => fn(smooth));
      } else {
        this.emaFilter.reset();
        this.cursorObservers.forEach((fn) => fn(null));
      }
    });

    await this.hands.initialize();
    this.handsReady = true;
    this.startCaptureLoop();
  }

  /** Stop everything and release resources. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.hands?.close();
    this.hands = null;
    this.handsReady = false;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.emaFilter.reset();
    this.frameInFlight = false;
  }

  /** Subscribe to raw landmark updates. */
  subscribe(observer: LandmarkObserver): () => void {
    this.landmarkObservers.add(observer);
    return () => this.landmarkObservers.delete(observer);
  }

  /** Subscribe to the smoothed cursor position (index-finger tip). */
  subscribeCursor(observer: CursorObserver): () => void {
    this.cursorObservers.add(observer);
    return () => this.cursorObservers.delete(observer);
  }

  /** Returns the live <video> element (useful for debug overlays). */
  getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private startCaptureLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.captureFrame();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private captureFrame(): void {
    if (!this.handsReady || this.frameInFlight) return;
    if (!this.video || this.video.readyState < 2) return;

    this.frameInFlight = true;
    this.hands!.send({ image: this.video }).catch(() => {
      this.frameInFlight = false;
    });
  }
}

