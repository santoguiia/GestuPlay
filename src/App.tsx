/**
 * App – GestuPlay hub.
 *
 * States
 * ──────
 *  "idle"     → Welcome screen, dwell buttons to start / access settings
 *  "loading"  → Requesting webcam permission, initialising VisionManager
 *  "playing"  → Game canvas is visible, VirtualCursor overlay active
 *  "error"    → Camera permission denied or other initialisation failure
 */
import { useState, useCallback, useMemo } from "react";
import { VisionManager } from "./core/VisionManager";
import { SlingshotGame } from "./games/SlingshotGame";
import type { IGestuGame } from "./core/IGestuGame";
import { GameCanvas } from "./components/GameCanvas";
import { VirtualCursor } from "./components/VirtualCursor";
import { DwellButton } from "./components/DwellButton";
import "./App.css";

type AppState = "idle" | "loading" | "playing" | "error";

const GAMES: { id: string; label: string; factory: () => IGestuGame }[] = [
  { id: "slingshot", label: "🎯 Gemini Slingshot", factory: () => new SlingshotGame() },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const activeGame = useMemo(() => {
    if (!activeGameId) return null;
    const def = GAMES.find((g) => g.id === activeGameId);
    return def ? def.factory() : null;
  }, [activeGameId]);

  const startGame = useCallback(async (gameId: string) => {
    setAppState("loading");
    try {
      const vm = VisionManager.getInstance();
      await vm.start();
      setActiveGameId(gameId);
      setAppState("playing");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to access camera."
      );
      setAppState("error");
    }
  }, []);

  const stopGame = useCallback(() => {
    VisionManager.getInstance().stop();
    setActiveGameId(null);
    setAppState("idle");
  }, []);

  return (
    <div className="app">
      {/* ── Overlay: Virtual Cursor (shown while playing) ─────────────────── */}
      {appState === "playing" && <VirtualCursor />}

      {/* ── Screen: Idle / Hub ─────────────────────────────────────────────── */}
      {appState === "idle" && (
        <div className="screen screen--hub">
          <div className="hub__bg-orb hub__bg-orb--left" aria-hidden="true" />
          <div className="hub__bg-orb hub__bg-orb--right" aria-hidden="true" />

          <div className="hub__panel">
            <header className="hub__header">
              <h1 className="hub__title">
                GestuPlay
              </h1>
              <p className="hub__subtitle">
                A low-latency gesture gaming hub inspired by modern dashboards.
              </p>
            </header>

            <div className="hub__meta">
              <span>Local Processing</span>
              <span>MediaPipe Hands</span>
              <span>Zero Server Cost</span>
            </div>

            <div className="hub__games">
              {GAMES.map((g) => (
                <DwellButton
                  key={g.id}
                  label={g.label}
                  onClick={() => startGame(g.id)}
                />
              ))}
            </div>

            <footer className="hub__footer">
              <p>Point your index finger at a button and hold to select.</p>
              <p className="hub__privacy">
                🔒 All processing happens locally — no data leaves your device.
              </p>
            </footer>
          </div>
        </div>
      )}

      {/* ── Screen: Loading ───────────────────────────────────────────────── */}
      {appState === "loading" && (
        <div className="screen screen--loading">
          <div className="spinner" aria-label="Loading…" />
          <p>Starting camera…</p>
        </div>
      )}

      {/* ── Screen: Playing ───────────────────────────────────────────────── */}
      {appState === "playing" && activeGame && (
        <div className="screen screen--playing">
          <GameCanvas game={activeGame} />
          <button className="back-btn" onClick={stopGame} title="Back to hub">
            ← Hub
          </button>
        </div>
      )}

      {/* ── Screen: Error ─────────────────────────────────────────────────── */}
      {appState === "error" && (
        <div className="screen screen--error">
          <h2>⚠️ Camera Error</h2>
          <p>{errorMsg}</p>
          <button onClick={() => setAppState("idle")}>← Back</button>
        </div>
      )}
    </div>
  );
}
