/**
 * Full-journey E2E (design "Async execution flow" + proposal success criteria:
 * interview → 4 variations → gallery → regenerate). Drives every endpoint
 * through app.request() against the real generation orchestrator, real history
 * repo, a real RunEventHub (SSE bridge) and mocked ComfyUI (HTTP + WS). No
 * network, no real ComfyUI / llama.
 */
import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./db/migrate";
import { createHistoryRepo, type HistoryRepo } from "./db/history";
import { createApp } from "./app";
import { ComfyUnreachableError } from "./services/comfy";
import { ConversionError } from "./services/converter";
import type { ApiWorkflow } from "./services/converter";
import { createChatService } from "./services/chat";
import { createGenerationService, type GenerationService } from "./services/generation";
import type { ComfyClientLike, MappedSseLike, RelayLike } from "./services/generation";
import { createThumbnailer } from "./services/thumbs";
import { createRunEventHub, type RunEventHub } from "./lib/run-events";
import type { LlmLifecycle } from "./services/llm";

const STUB_WORKFLOW: ApiWorkflow = { "11": { class_type: "SaveImage", inputs: {} } };

/** Converter stub; throws ConversionError for prompts containing `failPrompt`. */
const makeStubConvert = (failPrompt?: string) =>
  ((_t: unknown, opts: Record<string, unknown>) => {
    if (failPrompt && String(opts.prompt ?? "").includes(failPrompt)) {
      throw new ConversionError("bad template wiring");
    }
    return STUB_WORKFLOW;
  }) as unknown as (template: ApiWorkflow, opts: Record<string, unknown>) => ApiWorkflow;

interface Fixture {
  db: Database.Database;
  dataDir: string;
  history: HistoryRepo;
  events: RunEventHub;
  app: ReturnType<typeof createApp>;
  /** Captured relay handler: emulate a ComfyUI WS frame by calling it. */
  relayHandler: (pid: string, sse: MappedSseLike) => void | Promise<void>;
  comfy: ComfyClientLike;
  dispose: () => void;
}

function readyLlm(): LlmLifecycle {
  return {
    start: async () => ({ pid: null, adopted: true }),
    stop: async () => {},
    status: () => ({ ready: true, port: 8080, model: "test-gguf", adopted: true }),
  };
}

function setup(over: {
  comfy?: ComfyClientLike;
  /** When set, convert() throws for prompts containing this substring → 422. */
  convertFailPrompt?: string;
} = {}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "ps-e2e-"));
  const dataDir = join(dir, "data");
  const imagesDir = join(dataDir, "images");
  mkdirSync(imagesDir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  migrate(db);
  const history = createHistoryRepo(db, dataDir);

  const chat = createChatService({
    llmUrl: "http://127.0.0.1:8080",
    systemPrompt: "You are the director.",
    model: "qwen3-4b",
    fetchFn: async () =>
      new Response(
        [JSON.stringify({ choices: [{ delta: { content: "ok" } }] })].join("\n") + "\n",
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
      ),
  });
  const thumb = createThumbnailer(dataDir);

  let seq = 0;
  const comfy: ComfyClientLike = over.comfy ?? {
    submitPrompt: vi.fn(async () => {
      seq += 1;
      return `prompt-${seq}`;
    }),
    getHistory: vi.fn(async () => ({ status: { status_str: "success", completed: true } })),
    getImage: vi.fn(async () => Buffer.from([1, 2, 3, 4])),
  };

  const store = {
    async createRun(run: Record<string, unknown>) {
      const p = (run.params ?? {}) as Record<string, unknown>;
      history.insertRun({
        id: String(run.runId),
        status: "pending",
        prompt: String(run.prompt ?? ""),
        negativePrompt: run.negativePrompt ? String(run.negativePrompt) : null,
        params: { ...p },
        seeds: (run.seeds ?? []) as number[],
        promptIds: [],
        chat: (run.chatJson ?? []) as Array<{ role: "user" | "assistant"; content: string }>,
      });
    },
    async markRunning(runId: string) {
      history.updateStatus(runId, "running");
    },
    async setStatus(runId: string, status: string, error?: string) {
      history.updateStatus(runId, status as "pending" | "running" | "completed" | "failed" | "cancelled", error);
    },
    async addImage(img: Record<string, unknown>) {
      const v = img as Record<string, unknown>;
      history.insertImage({
        id: String(v.runId) + "-" + String(v.variationIndex),
        runId: String(v.runId),
        variationIndex: Number(v.variationIndex),
        seed: Number(v.seed ?? 0),
        comfyuiPromptId: v.promptId ? String(v.promptId) : null,
        kind: v.kind === "hd" ? "hd" : "base",
        localPath: String(v.localPath),
        thumbnailPath: v.thumbnailPath ? String(v.thumbnailPath) : null,
        filename: String(v.filename),
        width: v.width ? Number(v.width) : null,
        height: v.height ? Number(v.height) : null,
      });
    },
    async getRun(runId: string) {
      const d = history.detailByRunId(runId);
      return d ? (d as unknown as Record<string, unknown>) : null;
    },
  };

  let capturedHandler: ((pid: string, sse: MappedSseLike) => void | Promise<void>) | null = null;
  const relay: RelayLike = {
    subscribe(promptIds, handler) {
      void promptIds;
      capturedHandler = handler as (pid: string, sse: MappedSseLike) => void | Promise<void>;
    },
  };

  const events = createRunEventHub();
  const convertFn = makeStubConvert(over.convertFailPrompt);
  const generation: GenerationService = createGenerationService({
    comfy: comfy as unknown as Parameters<typeof createGenerationService>[0]["comfy"],
    relay,
    store,
    writer: {
      async writeImage(opts: Record<string, unknown>) {
        const runId = String(opts.runId);
        const filename = String(opts.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
        const fdir = join(imagesDir, runId);
        mkdirSync(fdir, { recursive: true });
        const localPath = join(fdir, filename);
        writeFileSync(localPath, opts.data as Buffer);
        return { localPath, width: 1024, height: 1024 };
      },
    },
    thumb,
    convert: convertFn,
    template: STUB_WORKFLOW,
    emit: (runId, frame) => events.publish(runId, frame),
  });

  const app = createApp({
    comfy: comfy as unknown as Parameters<typeof createApp>[0]["comfy"],
    comfyUrl: "http://127.0.0.1:8188",
    llm: readyLlm(),
    chat,
    generation,
    history,
    dataDir,
    convertTemplate: convertFn as unknown as typeof import("./services/converter").convert,
    events,
  });

  return {
    db,
    dataDir,
    history,
    events,
    app,
    comfy,
    relayHandler: (pid, sse) => {
      if (!capturedHandler) throw new Error("relay handler not captured");
      return capturedHandler(pid, sse);
    },
    dispose: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
async function waitUntil(pred: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await tick();
  }
}

async function postGenerate(f: Fixture, variations: number, prompt = "e2e prompt"): Promise<{ runId: string; promptIds: string[] }> {
  const res = await f.app.request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, variations, seed: 100, width: 1024, height: 1024, steps: 20, cfg: 2.5 }),
  });
  expect(res.status).toBe(202);
  return (await res.json()) as { runId: string; promptIds: string[] };
}

/** Fires progress + executed image frames for each prompt id, then awaits completion. */
async function emitAllAndComplete(f: Fixture, runId: string, promptIds: string[]) {
  for (const pid of promptIds) {
    await f.relayHandler(pid, { event: "executed", data: { node: "11", images: [{ filename: `${pid}.png`, subfolder: "", type: "output" }] } });
  }
  await waitUntil(() => (f.history.detailByRunId(runId)?.status ?? "") === "completed");
}

describe("E2E full journey (mocked ComfyUI)", () => {
  it("chat → generate 4 variations → images → list/detail → regenerate → delete", async () => {
    const f = setup();
    try {
      // chat (interview step) streams a done frame
      const chatRes = await f.app.request("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1", message: "hola" }),
      });
      expect(chatRes.status).toBe(200);
      expect(await chatRes.text()).toContain("event: done");

      // generate 4 variations
      const { runId, promptIds } = await postGenerate(f, 4);
      expect(promptIds).toHaveLength(4);
      await emitAllAndComplete(f, runId, promptIds);

      expect(f.history.detailByRunId(runId)?.status).toBe("completed");

      // gallery list + detail expose the 4 image rows
      const listRes = await f.app.request("/api/history");
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((r) => r.id === runId)).toBe(true);

      const detailRes = await f.app.request(`/api/history/${runId}`);
      const detail = (await detailRes.json()) as { images: unknown[]; status: string };
      expect(detail.status).toBe("completed");
      expect(detail.images).toHaveLength(4);

      // one image serves (file written to disk by the real writer); consume
      // the stream so the lazy createReadStream fully opens before dispose.
      const img = detail.images[0] as { filename: string };
      const imgRes = await f.app.request(`/api/history/${runId}/images/${img.filename}`);
      expect(imgRes.status).toBe(200);
      expect((await imgRes.text()).length).toBeGreaterThan(0);

      // regenerate from that run → new run (chat copied via history detail)
      const regenRes = await f.app.request("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRunId: runId, prompt: "regenerated prompt", keepSeed: true }),
      });
      expect(regenRes.status).toBe(202);
      const regen = (await regenRes.json()) as { runId: string };
      expect(regen.runId).not.toBe(runId);
      expect(f.history.detailByRunId(regen.runId)?.prompt).toBe("regenerated prompt");

      // delete the new run → 204 then 404
      const delRes = await f.app.request(`/api/history/${regen.runId}`, { method: "DELETE" });
      expect(delRes.status).toBe(204);
      const goneRes = await f.app.request(`/api/history/${regen.runId}`);
      expect(goneRes.status).toBe(404);
    } finally {
      f.dispose();
    }
  });

  it("409 while another run is active", async () => {
    const f = setup();
    try {
      await postGenerate(f, 1);
      const res = await f.app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "second", variations: 1 }),
      });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(409);
    } finally {
      f.dispose();
    }
  });

  it("502 when ComfyUI is unreachable at submit time", async () => {
    const f = setup({
      comfy: {
        submitPrompt: async () => {
          throw new ComfyUnreachableError("ComfyUI down");
        },
        getHistory: vi.fn(async () => null),
        getImage: vi.fn(async () => Buffer.alloc(0)),
      },
    });
    try {
      const res = await f.app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x", variations: 1 }),
      });
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(502);
    } finally {
      f.dispose();
    }
  });

  it("422 surfaces conversion errors", async () => {
    const f = setup({ convertFailPrompt: "trigger-422" });
    try {
      const res = await f.app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "trigger-422 prompt", variations: 1 }),
      });
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(422);
    } finally {
      f.dispose();
    }
  });
});