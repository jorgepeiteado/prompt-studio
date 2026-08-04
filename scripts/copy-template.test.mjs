import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SOURCE, TARGET_DIR, copyTemplate, sha256Of } from "./copy-template.mjs";
import { join } from "node:path";

const TEMPLATE_NAME = "workflow_fotorealista_qwen.json";

function sourceExists() {
  return existsSync(DEFAULT_SOURCE);
}

describe("copy-template", () => {
  it("copies the template byte-identical to the committed asset", () => {
    if (!sourceExists()) return; // manual/source-machine only
    const { targetPath, sha256 } = copyTemplate();
    expect(targetPath).toBe(join(TARGET_DIR, TEMPLATE_NAME));
    expect(sha256Of(DEFAULT_SOURCE)).toBe(sha256);
    // Byte-identity: raw bytes, not parsed JSON.
    expect(readFileSync(DEFAULT_SOURCE)).toEqual(readFileSync(targetPath));
  });

  it("is idempotent: a second run produces the same bytes and hash", () => {
    if (!sourceExists()) return;
    const first = copyTemplate();
    const second = copyTemplate();
    expect(second.sha256).toBe(first.sha256);
    expect(sha256Of(join(TARGET_DIR, TEMPLATE_NAME))).toBe(first.sha256);
  });

  it("records a SHA-256 sidecar matching the asset", () => {
    if (!sourceExists()) return;
    const { sha256 } = copyTemplate();
    const sidecar = readFileSync(join(TARGET_DIR, `${TEMPLATE_NAME}.sha256`), "utf8").trim();
    expect(sidecar).toBe(sha256);
  });
});
