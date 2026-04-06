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
import type { ComponentType } from "react";
import { VisionManager } from "./core/VisionManager";
import type { IGestuGame } from "./core/IGestuGame";
import { GameCanvas } from "./components/GameCanvas";
import { VirtualCursor } from "./components/VirtualCursor";
import { DwellButton } from "./components/DwellButton";
import GeminiSlingshot from "./games/geminiSlingshot/components/GeminiSlingshot";
import "./App.css";

type AppState = "idle" | "loading" | "playing" | "error";

type GameDefinition =
  | { id: string; label: string; engine: "canvas"; factory: () => IGestuGame }
  | { id: string; label: string; engine: "component"; component: ComponentType };

const GAMES: GameDefinition[] = [
  { id: "slingshot", label: "🎯 Gemini Slingshot", engine: "component", component: GeminiSlingshot },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const activeGameDef = useMemo(() => {
    if (!activeGameId) return null;
    return GAMES.find((g) => g.id === activeGameId) ?? null;
  }, [activeGameId]);

  const activeCanvasGame = useMemo(() => {
    if (!activeGameDef || activeGameDef.engine !== "canvas") return null;
    return activeGameDef.factory();
  }, [activeGameDef]);

  const startGame = useCallback(async (gameId: string) => {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return;

    if (game.engine === "component") {
      setActiveGameId(gameId);
      setAppState("playing");
      return;
    }

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
    if (activeGameDef?.engine === "canvas") {
      VisionManager.getInstance().stop();
    }
    setActiveGameId(null);
    setAppState("idle");
  }, [activeGameDef]);

  const ActiveComponentGame =
    activeGameDef && activeGameDef.engine === "component"
      ? activeGameDef.component
      : null;

  return (
    <div className="app">
      {/* ── Overlay: Virtual Cursor (shown while playing) ─────────────────── */}
      {appState === "playing" && activeGameDef?.engine === "canvas" && <VirtualCursor />}

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
      {appState === "playing" && activeGameDef && (
        <div className="screen screen--playing">
          {activeGameDef.engine === "canvas" && activeCanvasGame ? (
            <GameCanvas game={activeCanvasGame} />
          ) : ActiveComponentGame ? (
            <ActiveComponentGame />
          ) : null}
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
