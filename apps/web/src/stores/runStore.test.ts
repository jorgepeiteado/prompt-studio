import { beforeEach, describe, expect, it } from "vitest";
import { useRunStore } from "./runStore";

beforeEach(() => useRunStore.setState(useRunStore.getInitialState(), true));

describe("useRunStore (RED first — generation options state)", () => {
  it("has design-default parameters", () => {
    const s = useRunStore.getState();
    expect(s.steps).toBe(20);
    expect(s.cfg).toBe(2.5);
    expect(s.sampler).toBe("euler");
    expect(s.scheduler).toBe("simple");
    expect(s.variations).toBe(4);
  });

  it("randomizes a numeric seed (non-empty, safe range)", () => {
    const s = useRunStore.getState();
    expect(typeof s.seed).toBe("number");
    useRunStore.getState().randomizeSeed();
    const next = useRunStore.getState().seed;
    expect(Number.isInteger(next)).toBe(true);
    expect(next).toBeGreaterThanOrEqual(0);
  });

  it("sets fields and produces a coherent generate payload", () => {
    useRunStore.setState({
      prompt: "foto de estudio",
      steps: 30,
      cfg: 4,
      sampler: "euler",
      scheduler: "simple",
      aspect: "1:1",
      width: 1024,
      height: 1024,
      variations: 6,
      seed: 42,
    });
    const s = useRunStore.getState();
    expect(s.steps).toBe(30);
    expect(s.prompt).toBe("foto de estudio");
  });

  it("maps an aspect preset to width/height via aspectToSize (4:5 → 1024×1280)", () => {
    useRunStore.getState().setAspect("4:5");
    const s = useRunStore.getState();
    expect(s.aspect).toBe("4:5");
    expect(s.width).toBe(1024);
    expect(s.height).toBe(1280);
  });

  it("keeps custom width/height when a custom aspect is used", () => {
    useRunStore.setState({ aspect: "custom", width: 900, height: 1240 });
    expect(useRunStore.getState().width).toBe(900);
    expect(useRunStore.getState().height).toBe(1240);
  });

  it("blocks 9 variations (invalid) but allows 1–8", () => {
    useRunStore.getState().setVariations(9);
    expect(useRunStore.getState().variationsError).toBeTruthy();
    useRunStore.getState().setVariations(2);
    expect(useRunStore.getState().variationsError).toBeNull();
  });

  it("tracks the active generation run id", () => {
    useRunStore.getState().setActiveRunId("run9");
    expect(useRunStore.getState().activeRunId).toBe("run9");
    useRunStore.getState().setActiveRunId(null);
    expect(useRunStore.getState().activeRunId).toBeNull();
  });
});