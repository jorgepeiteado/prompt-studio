/**
 * reviewHydrate — prefills the Review editor + progress total from a persisted
 * run detail (PR4 W1 "regenerate ?from= ignored"). ReviewView reads /review?from
 * =<runId>, fetches the run, and applies these fields so a just-regenerated run
 * shows its live ProgressView (and, if the user later cancels to the editor,
 * the source prompt/params are already in place).
 */
import type { RunDetailDto } from "@promptstudio/shared";

export interface ReviewMutation {
  setPrompt(v: string): void;
  setString(k: "sampler" | "scheduler", v: string): void;
  setNumber(k: "steps" | "cfg" | "seed" | "width" | "height" | "variations", v: number): void;
}

export interface HydratedReview {
  /** Prompt the editor/ProgressView should present. */
  prompt: string;
  /** Number of variations — drives the ProgressView bar count. */
  variations: number;
}

/** Applies a persisted run's params onto the Review store; returns the edits. */
export function hydrateReviewRun(m: ReviewMutation, run: RunDetailDto): HydratedReview {
  const p = run.params;
  const seeds = (run.seeds ?? []).filter((s): s is number => typeof s === "number");
  // One seed per variation (seed = baseSeed + i); fall back to the default 4.
  const variations = seeds.length > 0 ? seeds.length : 4;

  m.setPrompt(run.prompt ?? "");
  if (typeof p?.seed === "number") m.setNumber("seed", p.seed);
  if (typeof p?.steps === "number") m.setNumber("steps", p.steps);
  if (typeof p?.cfg === "number") m.setNumber("cfg", p.cfg);
  if (typeof p?.samplerName === "string") m.setString("sampler", p.samplerName);
  if (typeof p?.scheduler === "string") m.setString("scheduler", p.scheduler);
  if (typeof p?.width === "number") m.setNumber("width", p.width);
  if (typeof p?.height === "number") m.setNumber("height", p.height);
  m.setNumber("variations", variations);

  return { prompt: run.prompt ?? "", variations };
}