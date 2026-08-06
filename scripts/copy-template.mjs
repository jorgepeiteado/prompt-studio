/**
 * Copies the reference ComfyUI workflow (UI/LiteGraph format) into
 * assets/workflows/ as a byte-identical, committed, read-only template.
 *
 * The source file is NEVER edited in place; the copy is NEVER written back.
 * On every run the copy is byte-compared to the source and a SHA-256 sidecar
 * is recorded (assets/workflows/<name>.json.sha256).
 *
 * Usage:
 *   node scripts/copy-template.mjs [sourcePath]
 * Default source: <repoRoot>/../workflow_fotorealista_qwen.json
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const DEFAULT_SOURCE = resolve(REPO_ROOT, "..", "workflow_fotorealista_qwen.json");
export const TARGET_DIR = join(REPO_ROOT, "assets", "workflows");
const TEMPLATE_NAME = "workflow_fotorealista_qwen.json";

export function sha256Of(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * Synchronous sleep (Atomics.wait on a throwaway buffer works on the main
 * thread in Node without blocking the event loop for other processes).
 */
function sleep(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

/**
 * renameSync fails with EPERM on Windows if another process (e.g. a parallel
 * vitest worker reading the template, or an antivirus scanner) briefly holds
 * the target open. Retry with backoff; the failure is transient by nature.
 */
function renameWithRetry(src, dest, attempts = 10) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      renameSync(src, dest);
      return;
    } catch (err) {
      lastErr = err;
      sleep(25 * (i + 1));
    }
  }
  throw lastErr;
}

/**
 * Copies `sourcePath` into assets/workflows/ byte-identical, records the
 * SHA-256 sidecar, and verifies the copy matches the source.
 * @returns {{ targetPath: string, sha256: string }}
 */
export function copyTemplate(sourcePath = DEFAULT_SOURCE) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Template source not found: ${sourcePath}`);
  }
  mkdirSync(TARGET_DIR, { recursive: true });
  const targetPath = join(TARGET_DIR, TEMPLATE_NAME);
  // Atomic write: copy to a temp file first, then rename into place so a
  // concurrent reader (e.g. the converter golden test in a parallel vitest
  // pool) never observes a partially-written template.
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  copyFileSync(sourcePath, tmpPath);
  renameWithRetry(tmpPath, targetPath);

  const sourceHash = sha256Of(sourcePath);
  const targetHash = sha256Of(targetPath);
  if (sourceHash !== targetHash) {
    throw new Error(`Copy mismatch: source ${sourceHash} != copy ${targetHash}`);
  }
  writeFileSync(`${targetPath}.sha256`, `${targetHash}\n`, "utf8");
  return { targetPath, sha256: targetHash };
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const source = process.argv[2] ?? DEFAULT_SOURCE;
  try {
    const { targetPath, sha256 } = copyTemplate(source);
    console.log(`Template copied byte-identical: ${targetPath}`);
    console.log(`SHA-256: ${sha256}`);
  } catch (error) {
    console.error(`copy-template: ${error.message}`);
    process.exitCode = 1;
  }
}
