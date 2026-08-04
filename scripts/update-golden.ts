/**
 * Regenerates assets/fixtures/fotorealista.api.golden.json from the committed
 * template using the canonical converter options.
 *
 * Guarded: only writes the fixture when run with `-u`. Without `-u` it is a
 * dry run that compares the current converter output against the committed
 * golden and exits 1 on mismatch (so a stale golden is never silently replaced).
 *
 * Usage:
 *   npx tsx scripts/update-golden.ts     # dry run — verify golden is current
 *   npx tsx scripts/update-golden.ts -u  # overwrite golden after deliberate review
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { convert } from "../apps/server/src/services/converter";
import type { ConvertOptions } from "../apps/server/src/services/converter";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE_PATH = join(REPO_ROOT, "assets", "workflows", "workflow_fotorealista_qwen.json");
const GOLDEN_PATH = join(REPO_ROOT, "assets", "fixtures", "fotorealista.api.golden.json");

/** Must stay identical to CANONICAL_OPTS in converter.test.ts. */
export const CANONICAL_OPTS: ConvertOptions = {
  prompt: "golden test prompt",
  width: 1024,
  height: 1024,
  seed: 12345,
  steps: 20,
  cfg: 2.5,
  batchSize: 1,
};

export function renderGolden(): string {
  const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf8"));
  const output = convert(template, CANONICAL_OPTS);
  return `${JSON.stringify(output, null, 2)}\n`;
}

const update = process.argv.includes("-u");
const rendered = renderGolden();
const committed = readFileSync(GOLDEN_PATH, "utf8");

if (rendered === committed) {
  console.log("Golden is up to date.");
} else if (update) {
  writeFileSync(GOLDEN_PATH, rendered, "utf8");
  console.log(`Golden updated: ${GOLDEN_PATH}`);
} else {
  console.error("Golden is OUT OF DATE. Run with -u only after deliberate review.");
  process.exitCode = 1;
}
