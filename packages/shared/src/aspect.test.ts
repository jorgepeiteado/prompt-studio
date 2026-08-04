import { describe, expect, it } from "vitest";
import { ASPECT_PRESETS, aspectToSize } from "./aspect";
import type { AspectRatio } from "./types";

const PRESETS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "3:2": { width: 1024, height: 683 },
  "16:9": { width: 1024, height: 576 },
  "9:16": { width: 576, height: 1024 },
};

describe("aspectToSize", () => {
  it("maps every preset to its spec resolution (1024 long side)", () => {
    const ratios = Object.keys(PRESETS) as AspectRatio[];
    expect(ratios).toHaveLength(5);
    for (const ratio of ratios) {
      expect(aspectToSize(ratio)).toEqual(PRESETS[ratio]);
    }
  });

  it("keeps one side at exactly 1024 for every preset", () => {
    for (const ratio of Object.keys(PRESETS) as AspectRatio[]) {
      const { width, height } = aspectToSize(ratio);
      expect([width, height]).toContain(1024);
    }
  });

  it("returns a copy, not a reference into the preset table", () => {
    const result = aspectToSize("4:5");
    result.width = 1;
    expect(ASPECT_PRESETS["4:5"].width).toBe(1024);
  });
});
