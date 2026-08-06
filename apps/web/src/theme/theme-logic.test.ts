import { describe, expect, it } from "vitest";
import { resolveInitialTheme, nextTheme } from "./theme-logic";

describe("theme-logic (RED first — ThemeProvider persistence contract)", () => {
  it("uses the stored theme from localStorage when present", () => {
    expect(resolveInitialTheme("dark", () => false)).toBe("dark");
    expect(resolveInitialTheme("light", () => true)).toBe("light");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, () => true)).toBe("dark");
    expect(resolveInitialTheme(null, () => false)).toBe("light");
  });

  it("defaults to light when there is no stored value and no system preference", () => {
    expect(resolveInitialTheme(undefined, () => false)).toBe("light");
  });

  it("cycles dark -> light -> dark", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});