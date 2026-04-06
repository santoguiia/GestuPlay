/**
 * useWindowSize – returns the current window dimensions and updates on resize.
 */
import { useEffect, useState } from "react";

interface Size {
  width: number;
  height: number;
}

export function useWindowSize(): Size {
  const [size, setSize] = useState<Size>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}
