/**
 * Dev-time verification: cross-checks the converter's WIDGET_NAMES table
 * against a live ComfyUI GET /object_info (manual run; ComfyUI may be offline
 * in CI). Usage:
 *
 *   npx tsx apps/server/src/scripts/verifyAgainstObjectInfo.ts [baseUrl]
 *
 * baseUrl defaults to $COMFYUI_URL or http://127.0.0.1:8188.
 * Exit codes: 0 = table matches live object_info · 1 = drift found · 2 = fetch failed.
 */
import { pathToFileURL } from "node:url";
import { WIDGET_NAMES } from "../services/converter";

export interface ObjectInfoEntry {
  input: {
    required: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
}

export interface VerificationReport {
  ok: boolean;
  missingClasses: string[];
  /** Input names that appear in neither `required` nor `optional`. */
  missingInputs: Record<string, string[]>;
}

/**
 * Pure check: every class in the table must be registered, and every table
 * input name must be accepted by the class's API schema (`input.required` OR
 * `input.optional` — e.g. CLIPLoader.device is optional in current ComfyUI).
 */
export function verifyWidgetNames(
  objectInfo: Record<string, ObjectInfoEntry>,
  table: Record<string, string[]>,
): VerificationReport {
  const missingClasses: string[] = [];
  const missingInputs: Record<string, string[]> = {};

  for (const [className, inputs] of Object.entries(table)) {
    const entry = objectInfo[className];
    if (!entry) {
      missingClasses.push(className);
      continue;
    }
    const accepted = new Set([
      ...Object.keys(entry.input.required ?? {}),
      ...Object.keys(entry.input.optional ?? {}),
    ]);
    const absent = inputs.filter((name) => !accepted.has(name));
    if (absent.length > 0) missingInputs[className] = absent;
  }

  return {
    ok: missingClasses.length === 0 && Object.keys(missingInputs).length === 0,
    missingClasses,
    missingInputs,
  };
}

async function main(): Promise<number> {
  const baseUrl = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
  console.log(`Verifying WIDGET_NAMES against ${baseUrl}/object_info ...`);

  let objectInfo: Record<string, ObjectInfoEntry>;
  try {
    const response = await fetch(`${baseUrl}/object_info`);
    if (!response.ok) {
      console.error(`object_info returned HTTP ${response.status}.`);
      return 2;
    }
    objectInfo = (await response.json()) as Record<string, ObjectInfoEntry>;
  } catch (error) {
    console.error(`Cannot reach ComfyUI at ${baseUrl} (is it running?): ${(error as Error).message}`);
    return 2;
  }

  const report = verifyWidgetNames(objectInfo, WIDGET_NAMES);
  const covered = Object.keys(WIDGET_NAMES).length;
  console.log(`Checked ${covered} classes / required-input entries.`);

  if (report.ok) {
    console.log("OK — WIDGET_NAMES matches live /object_info for all covered classes.");
    return 0;
  }

  for (const className of report.missingClasses) {
    console.error(`MISSING class in live object_info: ${className}`);
  }
  for (const [className, inputs] of Object.entries(report.missingInputs)) {
    console.error(
      `${className}: inputs not accepted by live object_info: ${inputs.join(", ")}`,
    );
  }
  console.error("WIDGET_NAMES drifted from live ComfyUI — review before freezing the golden.");
  return 1;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  });
}
