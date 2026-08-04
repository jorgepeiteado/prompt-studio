import type { AspectRatio } from "./types";

export interface Size {
  width: number;
  height: number;
}

/**
 * Aspect presets sized by a 1024px long side (proposal resolution, 2026-08-04):
 * 1:1 → 1024×1024 · 4:5 → 1024×1280 · 3:2 → 1024×683 · 16:9 → 1024×576 · 9:16 → 576×1024.
 */
export const ASPECT_PRESETS: Record<AspectRatio, Size> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "3:2": { width: 1024, height: 683 },
  "16:9": { width: 1024, height: 576 },
  "9:16": { width: 576, height: 1024 },
};

/** Returns a copy of the preset size so callers can never mutate the table. */
export function aspectToSize(aspect: AspectRatio): Size {
  return { ...ASPECT_PRESETS[aspect] };
}
