"use client";

import { useEffect } from "react";

// Warms the browser cache with the images the next screen paints above the
// fold, so they are already decoded when that screen mounts instead of
// arriving a round trip after its text. Call it from the screen before, with
// a module-level constant so the effect runs once per visit.
export function usePreloadImages(sources: readonly string[]) {
  useEffect(() => {
    for (const src of sources) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = src;
    }
  }, [sources]);
}
