import { describe, expect, it } from "vitest";
import {
  VARIATIONS_MAX,
  VARIATIONS_MIN,
  validateGenerationInput,
} from "./validation";

describe("validateGenerationInput", () => {
  it("accepts a valid input with no issues", () => {
    const issues = validateGenerationInput({
      prompt: "A portrait of a woman",
      variations: 4,
      width: 1024,
      height: 1024,
      seed: 42,
      steps: 20,
      cfg: 2.5,
    });
    expect(issues).toEqual([]);
  });

  it("rejects an empty prompt", () => {
    const issues = validateGenerationInput({ prompt: "", variations: 4 });
    expect(issues.some((i) => i.field === "prompt")).toBe(true);
  });

  it("rejects a whitespace-only prompt", () => {
    const issues = validateGenerationInput({ prompt: "   \n ", variations: 4 });
    expect(issues.some((i) => i.field === "prompt")).toBe(true);
  });

  it("accepts variation counts at both bounds (1 and 8)", () => {
    expect(validateGenerationInput({ prompt: "p", variations: VARIATIONS_MIN })).toEqual([]);
    expect(validateGenerationInput({ prompt: "p", variations: VARIATIONS_MAX })).toEqual([]);
  });

  it("rejects variation count 9 with a field message", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 9 });
    expect(issues.some((i) => i.field === "variations")).toBe(true);
  });

  it("rejects variation count 0", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 0 });
    expect(issues.some((i) => i.field === "variations")).toBe(true);
  });

  it("rejects a non-integer variation count", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 2.5 });
    expect(issues.some((i) => i.field === "variations")).toBe(true);
  });

  it("rejects non-positive width and height", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 4, width: 0, height: -1 });
    expect(issues.some((i) => i.field === "width")).toBe(true);
    expect(issues.some((i) => i.field === "height")).toBe(true);
  });

  it("rejects a negative seed", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 4, seed: -1 });
    expect(issues.some((i) => i.field === "seed")).toBe(true);
  });

  it("accepts seed 0", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 4, seed: 0 });
    expect(issues.some((i) => i.field === "seed")).toBe(false);
  });

  it("rejects non-positive steps and cfg", () => {
    const issues = validateGenerationInput({ prompt: "p", variations: 4, steps: 0, cfg: 0 });
    expect(issues.some((i) => i.field === "steps")).toBe(true);
    expect(issues.some((i) => i.field === "cfg")).toBe(true);
  });

  it("collects multiple issues at once", () => {
    const issues = validateGenerationInput({ prompt: "", variations: 9 });
    const fields = issues.map((i) => i.field).sort();
    expect(fields).toEqual(["prompt", "variations"]);
  });
});
