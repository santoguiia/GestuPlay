/**
 * VirtualCursor – follows the user's index-finger tip around the screen.
 *
 * The cursor position (normalised [0,1]) is mapped to window pixel coordinates
 * on every render, so it responds correctly to window resizing.
 */
import { useWindowSize } from "../hooks/useWindowSize";
import { useVisionCursor } from "../hooks/useVisionCursor";
import "./VirtualCursor.css";

export function VirtualCursor() {
  const cursor = useVisionCursor();
  const { width, height } = useWindowSize();

  if (!cursor) return null;

  // Mirror X so the cursor feels like a reflection (natural)
  const px = (1 - cursor.x) * width;
  const py = cursor.y * height;

  return (
    <div
      className="virtual-cursor"
      style={{ transform: `translate(${px}px, ${py}px)` }}
      aria-hidden="true"
    />
  );
}
