/**
 * reviewHydrate — prefills the Review editor + progress total from a persisted
 * run detail (PR4 W1 "regenerate ?from= ignored": ReviewView must honor
 * /review?from=<runId> so a regenerated run shows its live progress). Pure and
 * testable: the view applies the returned fields to its zustand store.
 */
import { describe, expect, it, vi } from "vitest";
import type { RunDetailDto } from "@promptstudio/shared";
import { hydrateReviewRun } from "./reviewHydrate";

function makeRun(over: Partial<RunDetailDto> = {}): RunDetailDto {
  return {
    id: "run-1",
    createdAt: new Date().toISOString(),
    status: "running",
    prompt: "foto de estudio",
    negativePrompt: null,
    params: {
      seed: 42,
      steps: 30,
      cfg: 4,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
      width: 1024,
      height: 1024,
    },
    seeds: [42, 43, 44],
    promptIds: ["p1", "p2", "p3"],
    chat: [],
    images: [],
    error: null,
    ...over,
  };
}

function makeMutation() {
  const setPrompt = vi.fn();
  const setString = vi.fn();
  const setNumber = vi.fn();
  return { setPrompt, setString, setNumber };
}

describe("hydrateReviewRun", () => {
  it("prefills prompt, params and variations (from seeds) for the editor", () => {
    const m = makeMutation();
    const run = makeRun();
    const out = hydrateReviewRun(m, run);
    expect(out.prompt).toBe("foto de estudio");
    expect(out.variations).toBe(3);
    expect(m.setPrompt).toHaveBeenCalledWith("foto de estudio");
    expect(m.setNumber).toHaveBeenCalledWith("seed", 42);
    expect(m.setNumber).toHaveBeenCalledWith("steps", 30);
    expect(m.setNumber).toHaveBeenCalledWith("cfg", 4);
    expect(m.setString).toHaveBeenCalledWith("sampler", "dpmpp_2m");
    expect(m.setString).toHaveBeenCalledWith("scheduler", "karras");
    expect(m.setNumber).toHaveBeenCalledWith("width", 1024);
    expect(m.setNumber).toHaveBeenCalledWith("height", 1024);
    expect(m.setNumber).toHaveBeenCalledWith("variations", 3);
  });

  it("falls back to 4 variations when the run has no resolved seeds", () => {
    const m = makeMutation();
    const out = hydrateReviewRun(m, makeRun({ seeds: [] }));
    expect(out.variations).toBe(4);
    expect(m.setNumber).toHaveBeenCalledWith("variations", 4);
  });

  it("uses an empty prompt when the run carries none", () => {
    const m = makeMutation();
    const out = hydrateReviewRun(m, makeRun({ prompt: "" }));
    expect(out.prompt).toBe("");
  });

  it("does not clobber fields missing from the run params", () => {
    const m = makeMutation();
    const params = { ...makeRun().params } as Partial<RunDetailDto["params"]>;
    delete params.seed;
    const out = hydrateReviewRun(m, makeRun({ params: params as RunDetailDto["params"] }));
    expect(out.prompt).toBe("foto de estudio");
    expect(m.setNumber).not.toHaveBeenCalledWith("seed", expect.any(Number));
  });
});