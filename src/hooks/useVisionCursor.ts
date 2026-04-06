/**
 * useVisionCursor – React hook that subscribes to the VisionManager's
 * smoothed cursor position and returns it as React state.
 */
import { useEffect, useState } from "react";
import { VisionManager, type CursorPosition } from "../core/VisionManager";

export function useVisionCursor(): CursorPosition {
  const [pos, setPos] = useState<CursorPosition>(null);

  useEffect(() => {
    const vm = VisionManager.getInstance();
    const unsubscribe = vm.subscribeCursor(setPos);
    return unsubscribe;
  }, []);

  return pos;
}
