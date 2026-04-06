/**
 * GameCanvas – mounts a GestuGame onto a <canvas> element and runs its
 * game-loop (update → draw) in sync with requestAnimationFrame.
 */
import { useEffect, useRef } from "react";
import type { IGestuGame } from "../core/IGestuGame";
import { VisionManager } from "../core/VisionManager";
import type { NormalizedLandmarkList } from "@mediapipe/hands";
import "./GameCanvas.css";

interface GameCanvasProps {
  game: IGestuGame;
}

export function GameCanvas({ game }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let latestLandmarks: NormalizedLandmarkList | null = null;
    let rafId: number;

    // Resize canvas to fill its CSS container
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      game.init(canvas);
    });
    resizeObserver.observe(canvas);

    // Subscribe to raw landmarks
    const unsubscribe = VisionManager.getInstance().subscribe(
      (landmarks) => (latestLandmarks = landmarks)
    );

    // Game loop
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      game.update(latestLandmarks);
      game.draw(ctx);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      unsubscribe();
      game.destroy();
    };
  }, [game]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
