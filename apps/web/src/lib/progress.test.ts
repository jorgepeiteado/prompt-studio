// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyProgressEvent,
  countDone,
  emptyProgress,
  type ProgressMap,
} from "./progress";

describe("lib/progress.ts — per-variation SSE progress reducer (RED first)", () => {
  it("reserves one queued slot per variation up front", () => {
    const map = emptyProgress(4);
    expect(Object.keys(map)).toHaveLength(4);
    expect(map[0]).toEqual({ status: "queued", progress: 0 });
    expect(map[3]?.status).toBe("queued");
  });

  it("advances a variation through started -> progress -> complete (image frame)", () => {
    let map = emptyProgress(2);
    map = applyProgressEvent(map, { type: "started", runId: "r1", variationIndex: 1 });
    expect(map[1]?.status).toBe("started");
    map = applyProgressEvent(map, { type: "progress", runId: "r1", variationIndex: 1, progress: 55 });
    expect(map[1]?.status).toBe("progress");
    expect(map[1]?.progress).toBe(55);
    map = applyProgressEvent(map, { type: "image", runId: "r1", variationIndex: 1, url: "/x/b.png" });
    expect(map[1]).toMatchObject({ status: "complete", progress: 100, url: "/x/b.png" });
  });

  it("does not let a progress frame regress an already-complete variant", () => {
    let map = emptyProgress(1);
    map = applyProgressEvent(map, { type: "image", runId: "r1", variationIndex: 0, url: "/a.png" });
    map = applyProgressEvent(map, { type: "progress", runId: "r1", variationIndex: 0, progress: 20 });
    expect(map[0]).toMatchObject({ status: "complete", progress: 100 });
  });

  it("marks every variant cancelled on a global cancelled frame", () => {
    let map = emptyProgress(3);
    map = applyProgressEvent(map, { type: "started", runId: "r1", variationIndex: 0 });
    map = applyProgressEvent(map, { type: "cancelled", runId: "r1" });
    expect(map[0]?.status).toBe("cancelled");
    expect(map[1]?.status).toBe("cancelled");
    expect(map[2]?.status).toBe("cancelled");
  });

  it("counts only complete variants as done", () => {
    let map = emptyProgress(4);
    map = applyProgressEvent(map, { type: "image", runId: "r1", variationIndex: 0, url: "/a.png" });
    map = applyProgressEvent(map, { type: "image", runId: "r1", variationIndex: 2, url: "/c.png" });
    map = applyProgressEvent(map, { type: "failed", runId: "r1", variationIndex: 3 });
    expect(countDone(map)).toBe(2);
  });

  it("is immutable — the original map is never mutated", () => {
    const before: ProgressMap = { 0: { status: "queued", progress: 0 } };
    const snapshot = JSON.stringify(before);
    applyProgressEvent(before, { type: "started", runId: "r1", variationIndex: 0 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
