/**
 * Hono app factory (design "API contract" + "Async execution flow"). All
 * services are injected so tests drive the app against mocks with
 * `app.request()` — no real network. Wires: unified error envelope
 * {error:{code,message}} (400/404/409/422/502/503/500), health, llm
 * chat/status/session-restore, generate start/completion/SSE/cancel/regenerate,
 * history list/detail/image(guard)/delete, comfy passthrough, upload.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateGenerationInput } from "@promptstudio/shared";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { ConversionError } from "./services/converter";
import { ComfyUnreachableError } from "./services/comfy";
import { BusyError } from "./services/generation";
import { encodeSse, SSE_HEADERS } from "./lib/sse";
import type { RunEventHub } from "./lib/run-events";
import type { HistoryRepo } from "./db/history";
import type { ChatService } from "./services/chat";
import type { LlmLifecycle } from "./services/llm";
import type { GenerationService, GenerateInput } from "./services/generation";
import type { ComfyClient } from "./services/comfy";
import { createThumbnailer } from "./services/thumbs";

export interface ImageWriterLike {
  writeImage(opts: {
    runId: string;
    variationIndex: number;
    filename: string;
    data: Buffer;
  }): Promise<{ localPath: string; width: number; height: number }>;
}

export interface AppServices {
  comfy: ComfyClient;
  comfyUrl: string;
  llm: LlmLifecycle;
  chat: ChatService;
  generation: GenerationService;
  history: HistoryRepo;
  dataDir: string;
  convertTemplate: typeof import("./services/converter").convert;
  imageUrl?: (runId: string, filename: string) => string;
  /** Per-run event hub; the SSE endpoint subscribes to stream gen frames. */
  events?: RunEventHub;
}

function errorBody(code: number, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function createApp(services: AppServices): Hono {
  const app = new Hono();
  app.use("*", cors());

  // ---- error envelope ----
  app.onError((err, c) => {
    if (err instanceof BusyError) {
      return c.json(errorBody(409, err.message), 409);
    }
    if (err instanceof ConversionError) {
      return c.json(errorBody(422, err.message, { detail: String(err.message) }), 422);
    }
    if (err instanceof ComfyUnreachableError) {
      return c.json(errorBody(502, err.message), 502);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(errorBody(500, msg), 500);
  });

  app.notFound((c) => c.json(errorBody(404, "Not found."), 404));

  // ---- health ----
  app.get("/api/health", async (c) => {
    const llmStatus = services.llm.status();
    let comfyReachable = false;
    let comfyVersion: string | undefined;
    try {
      const stats = await services.comfy.getSystemStats();
      comfyReachable = true;
      comfyVersion = stats.system?.comfyui_version;
    } catch {
      comfyReachable = false;
    }
    return c.json({
      status: "ok",
      comfy: { reachable: comfyReachable, version: comfyVersion },
      llm: { status: llmStatus.ready ? "ready" : "starting", port: llmStatus.port, adopted: llmStatus.adopted },
    });
  });

  // ---- llm ----
  app.get("/api/llm/status", (c) => c.json(services.llm.status()));

  app.post("/api/llm/chat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { sessionId?: string; message?: string };
    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return c.json(errorBody(400, "message is required."), 400);
    }
    const sessionId = body.sessionId ?? "default";
    const llmStatus = services.llm.status();
    if (!llmStatus.ready) {
      return c.json(errorBody(503, "The AI engine is still starting. Try again in a moment."), 503);
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (frame: string): void => {
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            /* stream already closed */
          }
        };
        void (async () => {
          try {
            await services.chat.stream(sessionId, body.message!, (ev) => {
              const frame =
                ev.type === "token"
                  ? encodeSse("token", { type: "token", text: ev.text })
                  : ev.type === "done"
                    ? encodeSse("done", { type: "done", full: ev.full, isFinalPrompt: ev.isFinalPrompt })
                    : encodeSse("error", { type: "error", message: ev.message });
              send(frame);
            });
          } catch {
            send(encodeSse("error", { type: "error", message: "LLM stream failed." }));
          }
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        })();
      },
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  });

  app.get("/api/llm/chat/:sessionId", (c) =>
    c.json(services.chat.getSession(c.req.param("sessionId"))),
  );

  // ---- generate ----
  app.post("/api/generate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const b = body as {
      prompt?: string;
      negativePrompt?: string;
      seed?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      scheduler?: string;
      width?: number;
      height?: number;
      aspect?: string;
      variations?: number;
      img2img?: { enabled?: boolean; filename?: string };
      upscale?: boolean;
    };
    const issues = validateGenerationInput({
      prompt: b.prompt ?? "",
      variations: b.variations ?? 4,
      width: b.width,
      height: b.height,
      seed: b.seed,
      steps: b.steps,
      cfg: b.cfg,
    });
    if (issues.length > 0) {
      return c.json(errorBody(400, issues[0]!.message, issues), 400);
    }
    const input: GenerateInput = {
      prompt: b.prompt!,
      negativePrompt: b.negativePrompt,
      variations: b.variations ?? 4,
      seed: b.seed ?? Math.floor(Math.random() * 1_000_000),
      width: b.width ?? 1024,
      height: b.height ?? 1024,
      steps: b.steps ?? 20,
      cfg: b.cfg ?? 2.5,
      samplerName: b.sampler,
      scheduler: b.scheduler,
      denoise: undefined,
      upscale: b.upscale,
    };
    try {
      const result = await services.generation.start(input);
      return c.json({ runId: result.runId, promptIds: result.promptIds }, 202);
    } catch (err) {
      if (err instanceof BusyError) return c.json(errorBody(409, err.message), 409);
      if (err instanceof ComfyUnreachableError) return c.json(errorBody(502, err.message), 502);
      throw err;
    }
  });

  app.get("/api/generate/:runId", async (c) => {
    const runId = c.req.param("runId");
    const detail = services.history.detailByRunId(runId);
    if (!detail) return c.json(errorBody(404, "Run not found."), 404);
    return c.json({
      status: detail.status,
      images: detail.images.map((img) => ({
        variationIndex: img.variationIndex,
        kind: img.kind,
        url: services.imageUrl?.(runId, img.filename) ?? `/api/history/${runId}/images/${img.filename}`,
      })),
      error: detail.error,
    });
  });

  app.get("/api/generate/:runId/events", (c) => {
    const runId = c.req.param("runId");
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(encodeSse("queued", { type: "queued", runId })),
        );
        // Progress/image/complete/failed/cancelled frames emitted by the
        // generation orchestrator (via the boot RunEventHub) are streamed now.
        const unsubscribe = services.events?.subscribe(runId, (frame) => {
          try {
            controller.enqueue(encoder.encode(encodeSse(frame.type, frame)));
          } catch {
            /* stream already closed */
          }
        });
        services.generation.isActive(runId);
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(keepalive);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  });

  app.delete("/api/generate/:runId", async (c) => {
    const runId = c.req.param("runId");
    const detail = services.history.detailByRunId(runId);
    if (!detail) return c.json(errorBody(404, "Run not found."), 404);
    await services.generation.cancel(runId);
    return c.json({ status: "cancelling" }, 202);
  });

  app.post("/api/regenerate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      fromRunId?: string;
      prompt?: string;
      params?: Partial<GenerateInput>;
      keepSeed?: boolean;
    };
    const from = body.fromRunId;
    if (!from) return c.json(errorBody(400, "fromRunId is required."), 400);
    const original = services.history.detailByRunId(from);
    if (!original) return c.json(errorBody(404, "Source run not found."), 404);
    const seed = body.keepSeed ? original.seeds[0] ?? 0 : Math.floor(Math.random() * 1_000_000);
    try {
      const result = await services.generation.start({
        prompt: body.prompt ?? original.prompt,
        negativePrompt: original.negativePrompt ?? undefined,
        variations: original.seeds.length,
        seed,
        width: original.params.width ?? 1024,
        height: original.params.height ?? 1024,
        steps: original.params.steps ?? 20,
        cfg: original.params.cfg ?? 2.5,
        samplerName: original.params.samplerName,
        scheduler: original.params.scheduler,
        denoise: original.params.denoise,
        chatJson: original.chat,
      });
      return c.json({ runId: result.runId, promptIds: result.promptIds }, 202);
    } catch (err) {
      if (err instanceof BusyError) return c.json(errorBody(409, err.message), 409);
      if (err instanceof ComfyUnreachableError) return c.json(errorBody(502, err.message), 502);
      throw err;
    }
  });

  // ---- history ----
  app.get("/api/history", (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const all = services.history.list();
    return c.json(all.slice(offset, offset + limit));
  });

  app.get("/api/history/:runId", (c) => {
    const detail = services.history.detailByRunId(c.req.param("runId"));
    if (!detail) return c.json(errorBody(404, "Run not found."), 404);
    return c.json(detail);
  });

  app.delete("/api/history/:runId", async (c) => {
    const deleted = services.history.deleteByRunId(c.req.param("runId"));
    if (!deleted) return c.json(errorBody(404, "Run not found."), 404);
    return c.body(null, 204);
  });

  // ---- image serving (traversal-guarded) ----
  app.get("/api/history/:runId/images/:file", async (c) => {
    const runId = c.req.param("runId");
    const file = c.req.param("file");
    const detail = services.history.detailByRunId(runId);
    if (!detail) return c.json(errorBody(404, "Run not found."), 404);

    // Hardening: relative-only paths; reject absolute + .. segments.
    if (file.includes("\\") || file.includes("/") || file === ".." || file.startsWith(".")) {
      return c.json(errorBody(400, "Invalid image path."), 400);
    }
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    const ext = "." + file.split(".").pop()?.toLowerCase();
    if (!allowed.has(ext)) return c.json(errorBody(400, "Unsupported image type."), 400);

    const { createReadStream } = await import("node:fs");
    const { join, resolve, sep } = await import("node:path");
    const rel = join("images", runId, file);
    const abs = resolve(services.dataDir, rel);
    const root = resolve(services.dataDir) + sep;
    if (!abs.startsWith(root)) return c.json(errorBody(400, "Invalid image path."), 400);

    const { existsSync } = await import("node:fs");
    if (!existsSync(abs)) return c.json(errorBody(404, "Image not found."), 404);

    const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
    const stream = createReadStream(abs);
    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `inline; filename="${file}"`);
    c.header("X-Content-Type-Options", "nosniff");
    return new Response(stream as unknown as WebReadableStream<Uint8Array>, { status: 200 });
  });
  app.get("/api/comfy/system_stats", async (c) => {
    try {
      return c.json(await services.comfy.getSystemStats());
    } catch (err) {
      if (err instanceof ComfyUnreachableError) return c.json(errorBody(502, err.message), 502);
      throw err;
    }
  });
  app.get("/api/comfy/object_info", async (c) => {
    try {
      return c.json(await services.comfy.getObjectInfo());
    } catch (err) {
      if (err instanceof ComfyUnreachableError) return c.json(errorBody(502, err.message), 502);
      throw err;
    }
  });

  // ---- upload passthrough (img2img) ----
  app.post("/api/images/upload", async (c) => {
    const form = await c.req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return c.json(errorBody(400, "image file is required."), 400);
    try {
      const res = await fetch(`${services.comfyUrl}/upload/image`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) return c.json(errorBody(502, `ComfyUI answered ${res.status}.`), 502);
      const json = (await res.json()) as { name?: string };
      return c.json({ filename: json.name ?? file.name });
    } catch {
      return c.json(errorBody(502, "ComfyUI upload failed."), 502);
    }
  });

  return app;
}

export const makeThumbnailer = createThumbnailer;