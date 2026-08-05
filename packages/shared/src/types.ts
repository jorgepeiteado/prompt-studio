/** Run lifecycle states persisted in the history store. */
export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Aspect ratio presets sized by a 1024px long side (proposal resolution). */
export type AspectRatio = "1:1" | "4:5" | "3:2" | "16:9" | "9:16";

/** Generation parameters persisted with a run. */
export interface RunParams {
  seed: number;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  width: number;
  height: number;
  aspect?: AspectRatio;
  denoise?: number;
  /** HD/4K upscale branch requested; off by default. */
  upscale?: boolean;
}

/** A persisted generation run (images live on disk; rows carry metadata only). */
export interface Run {
  id: string;
  createdAt: string;
  status: RunStatus;
  prompt: string;
  negativePrompt: string | null;
  params: RunParams;
  /** One seed per variation: seed = baseSeed + i. */
  seeds: number[];
  /** ComfyUI prompt_id per variation, aligned with seeds. */
  promptIds: string[];
  /** Snapshot of the interview chat at generate time. */
  chatJson: unknown[];
  error: string | null;
}

/** An image row: base (SaveImage 11) or hd (SaveImage 15). */
export interface ImageRow {
  id: string;
  runId: string;
  variationIndex: number;
  seed: number;
  comfyuiPromptId: string | null;
  kind: "base" | "hd";
  /** Relative to DATA_DIR. */
  localPath: string;
  /** Relative to DATA_DIR; null until the 320px preview is generated. */
  thumbnailPath: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** A single chat turn of the interview assistant. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isFinalPrompt?: boolean;
}
