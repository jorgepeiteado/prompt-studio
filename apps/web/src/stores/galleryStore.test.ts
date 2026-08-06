import { beforeEach, describe, expect, it } from "vitest";
import type { RunSummaryDto } from "@promptstudio/shared";
import { useGalleryStore } from "./galleryStore";

const RUNS: RunSummaryDto[] = [
  { id: "r2", createdAt: "2026-08-05 10:00", status: "completed", prompt: "segunda", variations: 4, thumbnail: "/t2.png", aspect: "1:1" },
  { id: "r1", createdAt: "2026-08-05 09:00", status: "completed", prompt: "primera", variations: 4, thumbnail: "/t1.png", aspect: "4:5" },
];

beforeEach(() => useGalleryStore.setState(useGalleryStore.getInitialState(), true));

describe("useGalleryStore (RED first — list/loading/detail/delete)", () => {
  it("starts empty with loading false", () => {
    const s = useGalleryStore.getState();
    expect(s.runs).toEqual([]);
    expect(s.loading).toBe(false);
  });

  it("stores the run list (newest-first from server is a server concern)", () => {
    useGalleryStore.getState().setRuns(RUNS);
    const s = useGalleryStore.getState();
    expect(s.runs).toHaveLength(2);
    expect(s.runs[0]?.id).toBe("r2");
  });

  it("tracks loading during fetch", () => {
    useGalleryStore.getState().setLoading(true);
    expect(useGalleryStore.getState().loading).toBe(true);
  });

  it("surfaces a load error message", () => {
    useGalleryStore.getState().setError("No pudimos cargar la galería.");
    expect(useGalleryStore.getState().error).toContain("galería");
  });

  it("removes a run by id after a delete (for optimistic UI)", () => {
    useGalleryStore.getState().setRuns(RUNS);
    useGalleryStore.getState().removeRun("r1");
    expect(useGalleryStore.getState().runs.map((r) => r.id)).toEqual(["r2"]);
  });

  it("resolveRun returns the run with a matching id", () => {
    useGalleryStore.getState().setRuns(RUNS);
    const found = useGalleryStore.getState().resolveRun("r1");
    expect(found?.prompt).toBe("primera");
    expect(useGalleryStore.getState().resolveRun("nope")).toBeUndefined();
  });
});