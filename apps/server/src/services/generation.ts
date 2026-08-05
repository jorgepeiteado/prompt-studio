/**
 * Generation orchestrator (design "Async execution flow", comfyui-integration
 * spec "Submit and Poll" + "Progress Streaming", generation-options spec).
 *
 * POST /api/generate → one HTTP submission per variation (batch_size 1,
 * seed = baseSeed + i); a second concurrent run returns BusyError (409).
 * Progress/executed messages from the shared ComfyUI WS relay are mapped into
 * image rows (image fetched via /view, written to disk, thumbnailed) and into
 * SSE frames. runCompletion drives the terminal state transition.
 */
import type { ApiWorkflow } from "./converter";
import type { ComfyImageOutput } from "./comfy";

export class BusyError extends Error {
  readonly code = 409;
  constructor() {
    super("Another generation run is already active.");
    this.name = "BusyError";
  }
}

export interface GenerateInput {
  prompt: string;
  negativePrompt?: string;
  variations: number;
  seed: number;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  upscale?: boolean;
  chatJson?: unknown[];
}

export interface ComfyClientLike {
  submitPrompt(workflow: ApiWorkflow): Promise<string>;
  getHistory(
    promptId: string,
  ): Promise<{
    status: { status_str: string; completed: boolean; messages?: Array<{ type: string; data?: Record<string, unknown> }> };
  } | null>;
  getImage(filename: string, subfolder: string, type: string): Promise<Buffer>;
}

export interface MappedSseLike {
  event: string;
  data: { node?: string | number; images?: ComfyImageOutput[] };
}

export interface RelayLike {
  subscribe(
    promptIds: string[],
    handler: (promptId: string, sse: MappedSseLike) => void | Promise<void>,
  ): void;
}

export interface GenerationStore {
  createRun(run: Record<string, unknown>): Promise<void>;
  markRunning(runId: string, promptIds: unknown): Promise<void>;
  setStatus(runId: string, status: string, error?: string | undefined): Promise<void>;
  addImage(image: Record<string, unknown>): Promise<void>;
  getRun(runId: string): Promise<Record<string, unknown> | null>;
}

export interface ImageWriter {
  writeImage(opts: Record<string, unknown>): Promise<{ localPath: string; width: number; height: number }>;
}

/** Returns the served thumbnail relative path, or null when none is produced. */
export type Thumbnailer = (
  srcPath: string,
  runId: string,
  variationIndex: number,
) => Promise<string | null>;

export interface GenerationDeps {
  comfy: ComfyClientLike;
  relay: RelayLike;
  store: GenerationStore;
  writer: ImageWriter;
  thumb: Thumbnailer;
  /** convert(template, opts) — the deterministic converter. */
  convert: (template: ApiWorkflow, opts: Record<string, unknown>) => ApiWorkflow;
  template: ApiWorkflow;
}

export interface GenerationService {
  start(input: GenerateInput): Promise<{ runId: string; promptIds: string[] }>;
  runCompletion(runId: string, promptIds: string[]): Promise<void>;
  cancel(runId: string): Promise<void>;
  isActive(runId: string): boolean;
}

export function createGenerationService(deps: GenerationDeps): GenerationService {
  let activeRunId: string | null = null;
  const cancelled = new Set<string>();

  async function start(input: GenerateInput): Promise<{ runId: string; promptIds: string[] }> {
    if (activeRunId) throw new BusyError();
    const { randomUUID } = await import("node:crypto");
    const runId = randomUUID();
    const seeds = Array.from({ length: input.variations }, (_, i) => input.seed + i);

    const params = {
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      seed: input.seed,
      steps: input.steps,
      cfg: input.cfg,
      samplerName: input.samplerName,
      scheduler: input.scheduler,
      denoise: input.denoise,
      batchSize: 1,
      upscale: input.upscale,
    };

    await deps.store.createRun({
      runId,
      params,
      seeds,
      negativePrompt: input.negativePrompt,
      chatJson: input.chatJson ?? [],
    });

    const promptIds: string[] = [];
    for (let i = 0; i < input.variations; i++) {
      const workflow = deps.convert(deps.template, { ...params, seed: seeds[i] });
      promptIds.push(await deps.comfy.submitPrompt(workflow));
    }

    await deps.store.markRunning(runId, promptIds);
    activeRunId = runId;

    const variationOf = (promptId: string): number => {
      const idx = promptIds.indexOf(promptId);
      return idx === -1 ? 0 : idx;
    };

    deps.relay.subscribe(promptIds, async (promptId, sse) => {
      if (cancelled.has(runId)) return; // post-cancel WS events ignored
      if (sse.event !== "executed") return;
      const kind = String(sse.data.node) === "15" ? "hd" : "base";
      await handleExecuted(runId, promptId, variationOf(promptId), kind, sse.data.images);
    });

    return { runId, promptIds };
  }

  async function handleExecuted(
    runId: string,
    promptId: string,
    variationIndex: number,
    kind: "base" | "hd",
    images: ComfyImageOutput[] | undefined,
  ): Promise<void> {
    if (!images || images.length === 0) return;
    for (const img of images) {
      const data = await deps.comfy.getImage(img.filename, img.subfolder, img.type);
      const written = await deps.writer.writeImage({ runId, variationIndex, filename: img.filename, data });
      const thumbnail = await deps.thumb(written.localPath, runId, variationIndex).catch(() => null);
      await deps.store.addImage({
        runId,
        promptId,
        variationIndex,
        kind,
        filename: img.filename,
        localPath: written.localPath,
        thumbnailPath: thumbnail,
        width: written.width,
        height: written.height,
      });
    }
  }

  async function runCompletion(runId: string, promptIds: string[]): Promise<void> {
    if (cancelled.has(runId)) {
      await deps.store.setStatus(runId, "cancelled");
      activeRunId = null;
      return;
    }
    let firstError: string | undefined;
    for (const promptId of promptIds) {
      try {
        const entry = await deps.comfy.getHistory(promptId);
        if (!entry) continue;
        if (entry.status.status_str === "error") {
          const execErr = entry.status.messages?.find((m) => m.type === "execution_error");
          const data = (execErr?.data ?? {}) as {
            node_type?: string;
            exception_message?: string;
          };
          firstError = firstError ?? `Node ${data.node_type ?? "?"} failed: ${data.exception_message ?? "unknown error"}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError = firstError ?? msg;
      }
    }
    if (firstError) {
      await deps.store.setStatus(runId, "failed", firstError);
    } else {
      await deps.store.setStatus(runId, "completed", undefined);
    }
    activeRunId = null;
  }

  async function cancel(runId: string): Promise<void> {
    cancelled.add(runId);
    await deps.store.setStatus(runId, "cancelled");
    if (activeRunId === runId) activeRunId = null;
  }

  return {
    start,
    runCompletion,
    cancel,
    isActive: (runId: string) => activeRunId === runId,
  };
}