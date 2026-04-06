/**
 * DwellButton – a button that activates after the user hovers over it for
 * DWELL_MS milliseconds without moving away (Dwell Click / Gaze Activation).
 *
 * Visual feedback: a radial SVG arc fills around the button as time passes.
 */
import { useEffect, useRef, useReducer, useCallback } from "react";
import { useVisionCursor } from "../hooks/useVisionCursor";
import { useWindowSize } from "../hooks/useWindowSize";
import "./DwellButton.css";

const DWELL_MS = 1500;
const HIT_RADIUS_PX = 60; // pixels from button centre to trigger hover

interface DwellButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface DwellState {
  hovering: boolean;
  progress: number; // 0..1
}

type DwellAction =
  | { type: "START_HOVER" }
  | { type: "PROGRESS"; value: number }
  | { type: "RESET" };

function dwellReducer(_state: DwellState, action: DwellAction): DwellState {
  switch (action.type) {
    case "START_HOVER":
      return { hovering: true, progress: 0 };
    case "PROGRESS":
      return { hovering: true, progress: action.value };
    case "RESET":
      return { hovering: false, progress: 0 };
  }
}

export function DwellButton({ label, onClick, disabled = false }: DwellButtonProps) {
  const cursor = useVisionCursor();
  const { width, height } = useWindowSize();

  const btnRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [{ hovering, progress }, dispatch] = useReducer(dwellReducer, {
    hovering: false,
    progress: 0,
  });

  const handleActivate = useCallback(() => {
    if (!disabled) onClick();
  }, [disabled, onClick]);

  useEffect(() => {
    const cancel = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    };

    if (!cursor || disabled) {
      cancel();
      dispatch({ type: "RESET" });
      return;
    }

    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Map normalised cursor to window pixels (mirrored X, same as VirtualCursor)
    const px = (1 - cursor.x) * width;
    const py = cursor.y * height;

    const dist = Math.hypot(px - cx, py - cy);

    if (dist <= HIT_RADIUS_PX) {
      if (!startRef.current) {
        startRef.current = performance.now();
        dispatch({ type: "START_HOVER" });
      }

      cancel(); // cancel any pending RAF before starting new one
      const tick = () => {
        const elapsed = performance.now() - (startRef.current ?? 0);
        const p = Math.min(elapsed / DWELL_MS, 1);
        dispatch({ type: "PROGRESS", value: p });

        if (p >= 1) {
          cancel();
          dispatch({ type: "RESET" });
          handleActivate();
        } else {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancel();
      dispatch({ type: "RESET" });
    }

    return cancel;
  }, [cursor, width, height, disabled, handleActivate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // SVG radial progress arc
  const R = 34;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - progress);

  return (
    <button
      ref={btnRef}
      className={`dwell-btn ${hovering ? "dwell-btn--hovering" : ""} ${disabled ? "dwell-btn--disabled" : ""}`}
      onClick={handleActivate}
      disabled={disabled}
    >
      <svg className="dwell-ring" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={R} className="dwell-ring__bg" />
        <circle
          cx="40"
          cy="40"
          r={R}
          className="dwell-ring__progress"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="dwell-btn__label">{label}</span>
    </button>
  );
}
