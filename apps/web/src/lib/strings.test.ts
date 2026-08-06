import { describe, expect, it } from "vitest";
import { strings, STRING_KEYS } from "./strings";

/** Walks a dotted path ("chat.title") through the nested strings object. */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

describe("strings.ts — Spanish (AR) copy (RED first)", () => {
  it("contains every key the UI references (no missing keys)", () => {
    expect(STRING_KEYS.length).toBeGreaterThan(50); // the registry is real, not empty
    for (const key of STRING_KEYS) {
      const value = getPath(strings, key);
      expect(value, `missing key: ${key}`).toBeDefined();
    }
  });

  it("stores user-facing values as non-empty strings", () => {
    for (const key of STRING_KEYS) {
      const value = getPath(strings, key);
      if (typeof value === "string") {
        expect(value.trim().length, `empty string: ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps UI copy in Spanish (Argentina register)", () => {
    expect(strings.chat.title).toBe("Entrevista");
    expect(strings.nav.gallery).toBe("Galería");
    expect(strings.nav.studio).toBe("Estudio");
  });

  it("provides the four quick-reply axes with rioplatense suggestions", () => {
    const axes = ["subject", "clothing", "lighting", "style"] as const;
    for (const axis of axes) {
      expect(strings.chips.axes[axis].options.length, `${axis} chips`).toBeGreaterThanOrEqual(2);
    }
    // rioplatense markers: voseo ("tirá", "dale") present somewhere in the copy
    const allCopy = STRING_KEYS.map((k) => getPath(strings, k))
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    expect(allCopy).toMatch(/tirá|vos|dale|andá|poné|decí|dejá|arrancá|intentá/i);
  });

  it("has designed error copy for the key API codes", () => {
    expect(strings.errors["409"]).toContain("generación");
    expect(strings.errors["502"]).toContain("ComfyUI");
    expect(strings.errors["503"]).toContain("arrancando");
  });
});