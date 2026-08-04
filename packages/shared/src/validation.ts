/** Bounds for multi-seed variations (generation-options spec: 1–8, default 4). */
export const VARIATIONS_MIN = 1;
export const VARIATIONS_MAX = 8;

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Input surface validated before a generation run is accepted. */
export interface GenerationInput {
  prompt: string;
  variations: number;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
}

/** Returns every validation issue found; an empty array means the input is valid. */
export function validateGenerationInput(input: GenerationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input.prompt.trim().length === 0) {
    issues.push({ field: "prompt", message: "The prompt is required." });
  }

  if (
    !Number.isInteger(input.variations) ||
    input.variations < VARIATIONS_MIN ||
    input.variations > VARIATIONS_MAX
  ) {
    issues.push({
      field: "variations",
      message: `Variations must be an integer between ${VARIATIONS_MIN} and ${VARIATIONS_MAX}.`,
    });
  }

  if (input.width !== undefined && (!Number.isInteger(input.width) || input.width <= 0)) {
    issues.push({ field: "width", message: "Width must be a positive integer." });
  }

  if (input.height !== undefined && (!Number.isInteger(input.height) || input.height <= 0)) {
    issues.push({ field: "height", message: "Height must be a positive integer." });
  }

  if (input.seed !== undefined && (!Number.isInteger(input.seed) || input.seed < 0)) {
    issues.push({ field: "seed", message: "Seed must be a non-negative integer." });
  }

  if (input.steps !== undefined && (!Number.isInteger(input.steps) || input.steps <= 0)) {
    issues.push({ field: "steps", message: "Steps must be a positive integer." });
  }

  if (
    input.cfg !== undefined &&
    (typeof input.cfg !== "number" || !Number.isFinite(input.cfg) || input.cfg <= 0)
  ) {
    issues.push({ field: "cfg", message: "CFG must be a positive number." });
  }

  return issues;
}

export function isValidGenerationInput(input: GenerationInput): boolean {
  return validateGenerationInput(input).length === 0;
}
