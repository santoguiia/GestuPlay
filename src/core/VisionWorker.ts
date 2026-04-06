/**
 * VisionWorker – stub for off-main-thread frame relay.
 *
 * NOTE: Due to the @mediapipe/hands package using closure-compiled globals
 * (incompatible with strict ESM bundlers), MediaPipe processing runs on the
 * main thread via VisionManager. This file is retained as an architectural
 * placeholder for future off-main-thread migration when a proper ESM
 * MediaPipe build becomes available.
 *
 * Message protocol (reserved for future use)
 * ───────────────────────────────────────────
 * Main → Worker  { type: 'FRAME', bitmap: ImageBitmap }
 * Worker → Main  { type: 'LANDMARKS', landmarks: NormalizedLandmarkList | null }
 */

self.onmessage = (): void => {
  // Frame relay stub – processing is currently handled in VisionManager
};

export {};
