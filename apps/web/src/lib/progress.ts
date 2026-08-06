/**
 * Per-variation generation progress reducer (design "ProgressView — per-variation
 * SSE bars"). Maps the SSE ProgressEvent stream onto a compact per-variation map
 * so the ProgressView can render throttled bars and status text without mutable
 * bookkeeping. Pure + testable.
 */

export type VariantStatus =
  | "queued"
  | "started"
  | "progress"
  | "complete"
  | "failed"
  | "cancelled";

export interface VariantProgress {
  status: VariantStatus;
  /** 0–100 (progress events); 0 until progress is flowing. */
  progress: number;
  /** Set when the {type:"image"} frame arrives for that variant. */
  url?: string;
}

export type ProgressMap = Record<number, VariantProgress>;

export const INITIAL_VARIANTS: VariantProgress = {
  status: "queued",
  progress: 0,
};

export type ProgressEventLike = {
  type: string;
  runId?: string;
  variationIndex?: number;
  progress?: number;
  url?: string;
};

/** Number of variant slots to reserve up front (so bars render immediately). */
export function emptyProgress(total: number): ProgressMap {
  const map: ProgressMap = {};
  for (let i = 0; i < total; i++) map[i] = { ...INITIAL_VARIANTS };
  return map;
}

/** Counts variants in a final (complete/failed/cancelled) state. */
export function countDone(map: ProgressMap): number {
  return Object.values(map).filter((v) => v.status === "complete").length;
}

export function applyProgressEvent(map: ProgressMap, ev: ProgressEventLike): ProgressMap {
  const idx = ev.variationIndex;
  // Events without a variant still matter (global error / done): copy, keep same.
  if (idx === undefined) {
    const next: ProgressMap = { ...map };
    if (ev.type === "cancelled") {
      for (const k of Object.keys(next)) next[Number(k)] = { ...(next[Number(k)] as VariantProgress), status: "cancelled" };
    }
    return next;
  }
  const base: VariantProgress = map[idx] ?? { ...INITIAL_VARIANTS };
  const next: ProgressMap = { ...map, [idx]: { ...base } };
  const current = next[idx] as VariantProgress;
  // Terminal states are sticky — a late progress/started frame must not regress.
  const terminal = current.status === "complete" || current.status === "failed" || current.status === "cancelled";
  switch (ev.type) {
    case "started":
      if (!terminal) next[idx] = { ...current, status: "started" };
      break;
    case "progress": {
      const applied = {
        ...current,
        ...(terminal ? {} : { status: "progress" as const }),
        progress: terminal ? current.progress : ev.progress ?? current.progress,
      } satisfies VariantProgress;
      next[idx] = applied;
      break;
    }
    case "image":
      next[idx] = { ...current, status: "complete", progress: 100, url: ev.url };
      break;
    case "complete":
      next[idx] = { ...current, status: "complete", progress: 100 };
      break;
    case "failed":
      next[idx] = { ...current, status: "failed" };
      break;
    case "cancelled":
      next[idx] = { ...current, status: "cancelled" };
      break;
    default:
      break; // queued keeps position; unknown frames ignored
  }
  return next;
}