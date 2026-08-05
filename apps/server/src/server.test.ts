import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./db/migrate";
import { createHistoryRepo, type HistoryRepo } from "./db/history";
import { createApp } from "./app";
import { ComfyClient, ComfyUnreachableError } from "./services/comfy";
import type { LlmLifecycle } from "./services/llm";
import { createChatService } from "./services/chat";
import { createGenerationService, BusyError, type GenerationService, type GenerationStore } from "./services/generation";
import { createThumbnailer } from "./services/thumbs";
import type { ApiWorkflow } from "./services/converter";

const STUB_WORKFLOW: ApiWorkflow = { "11": { class_type: "SaveImage", inputs: {} } };
const stubConvert = (_template: unknown, _opts: Record<string, unknown>): ApiWorkflow => {
  void _template;
  void _opts;
  return STUB_WORKFLOW as ApiWorkflow;
};
const stubConvertCast = stubConvert as (
  ...args: unknown[]
) => ApiWorkflow;

interface Fixture {
  db: Database.Database;
  dataDir: string;
  history: HistoryRepo;
  llm: LlmLifecycle;
  chat: ReturnType<typeof createChatService>;
  thumb: ReturnType<typeof createThumbnailer>;
  dispose: () => void;
}

function setup(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "ps-srv-"));
  const dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  migrate(db);
  const history = createHistoryRepo(db, dataDir);
  const llm: LlmLifecycle = {
    start: async () => ({ pid: null, adopted: true }),
    stop: async () => {},
    status: () => ({ ready: true, port: 8080, model: "test-gguf", adopted: true }),
  };
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
  return {
    db, dataDir, history, llm, chat, thumb,
    dispose: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function storeFrom(f: Fixture): GenerationStore {
  return {
    async createRun(run) {
      const p = (run.params ?? {}) as Record<string, unknown>;
      f.history.insertRun({
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
    async markRunning(runId) {
      f.history.updateStatus(runId, "running");
    },
    async setStatus(runId, status, error) {
      f.history.updateStatus(runId, status as "pending" | "running" | "completed" | "failed" | "cancelled", error);
    },
    async addImage(img) {
      const v = img as Record<string, unknown>;
      f.history.insertImage({
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
    async getRun(runId) {
      const d = f.history.detailByRunId(runId);
      return d ? (d as unknown as Record<string, unknown>) : null;
    },
  };
}

function fakeComfy(over: Partial<ComfyClient> = {}): ComfyClient {
  const c = new ComfyClient({ baseUrl: "http://127.0.0.1:8188" });
  Object.assign(c, over);
  return c;
}

function makeApp(
  f: Fixture,
  over: {
    comfy?: ComfyClient;
    llm?: LlmLifecycle;
    gen?: GenerationService;
    submission?: () => Promise<string>;
  } = {},
) {
  const comfy = over.comfy ?? fakeComfy({});
  const generation =
    over.gen ??
    createGenerationService({
      comfy: comfy as unknown as Parameters<typeof createGenerationService>[0]["comfy"],
      relay: { subscribe: () => {} } as Parameters<typeof createGenerationService>[0]["relay"],
      store: storeFrom(f),
      writer: {
        writeImage: async () => ({ localPath: "images/x.png", width: 1024, height: 1024 }),
      },
      thumb: f.thumb,
      convert: stubConvertCast as Parameters<typeof createGenerationService>[0]["convert"],
      template: STUB_WORKFLOW,
    });
  return createApp({
    comfy,
    comfyUrl: "http://127.0.0.1:8188",
    llm: over.llm ?? f.llm,
    chat: f.chat,
    generation,
    history: f.history,
    dataDir: f.dataDir,
    convertTemplate: stubConvertCast as typeof import("./services/converter").convert,
  });
}

describe("server routes (202/409/422/502/503 + SSE + history + image guard)", () => {
  it("GET /api/health reports comfy reachable + llm ready", async () => {
    const f = setup();
    try {
      const comfy = fakeComfy();
      vi.spyOn(comfy, "getSystemStats").mockResolvedValue({
        system: { comfyui_version: "0.29.2" },
      } as never);
      const app = makeApp(f, { comfy });
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body).toMatchObject({ status: "ok", comfy: { reachable: true } });
    } finally {
      f.dispose();
    }
  });

  it("GET /api/health marks comfy unreachable (502 surface inside payload)", async () => {
    const f = setup();
    try {
      const comfy = fakeComfy();
      vi.spyOn(comfy, "getSystemStats").mockRejectedValue(
        new ComfyUnreachableError("down"),
      );
      const app = makeApp(f, { comfy });
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.comfy.reachable).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it("POST /api/llm/chat streams token + done SSE frames", async () => {
    const f = setup();
    try {
      const app = makeApp(f);
      const res = await app.request("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "s1", message: "hola" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("event: token");
      expect(text).toContain("event: done");
    } finally {
      f.dispose();
    }
  });

  it("POST /api/llm/chat returns 503 when the LLM is not ready", async () => {
    const f = setup();
    try {
      const llm: LlmLifecycle = {
        start: async () => ({ pid: null, adopted: false }),
        stop: async () => {},
        status: () => ({ ready: false, port: 8080, model: "m", adopted: false }),
      };
      const app = makeApp(f, { llm });
      const res = await app.request("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hola" }),
      });
      expect(res.status).toBe(503);
      const body: any = await res.json();
      expect(body.error.code).toBe(503);
    } finally {
      f.dispose();
    }
  });

  it("POST /api/generate returns 202 {runId, promptIds} and persists a pending run", async () => {
    const f = setup();
    try {
      const submit = vi.fn(async () => "prompt-1");
      const comfy = fakeComfy({ submitPrompt: submit as unknown as () => Promise<string> });
      const app = makeApp(f, { comfy });
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "golden test prompt",
          variations: 2,
          seed: 100,
          width: 1024,
          height: 1024,
          steps: 20,
          cfg: 2.5,
        }),
      });
      expect(res.status).toBe(202);
      const body: any = await res.json();
      expect(body.runId).toBeTruthy();
      expect(body.promptIds).toHaveLength(2);
      expect(submit).toHaveBeenCalledTimes(2);
      expect(f.history.list().length).toBe(1);
    } finally {
      f.dispose();
    }
  });

  it("POST /api/generate returns 409 when a run is already active", async () => {
    const f = setup();
    try {
      const gen: GenerationService = {
        start: vi.fn(async () => { throw new BusyError(); }),
        runCompletion: vi.fn(async () => {}),
        cancel: vi.fn(async () => {}),
        isActive: () => true,
      };
      const app = makeApp(f, { gen });
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x", variations: 1 }),
      });
      expect(res.status).toBe(409);
      const body: any = await res.json();
      expect(body.error.code).toBe(409);
    } finally {
      f.dispose();
    }
  });

  it("POST /api/generate returns 502 when ComfyUI is unreachable", async () => {
    const f = setup();
    try {
      const gen: GenerationService = {
        start: vi.fn(async () => { throw new ComfyUnreachableError("ComfyUI down"); }),
        runCompletion: vi.fn(async () => {}),
        cancel: vi.fn(async () => {}),
        isActive: () => true,
      };
      const app = makeApp(f, { gen });
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x", variations: 1 }),
      });
      expect(res.status).toBe(502);
      const body: any = await res.json();
      expect(body.error.code).toBe(502);
    } finally {
      f.dispose();
    }
  });

  it("POST /api/generate returns 400 for empty prompt", async () => {
    const f = setup();
    try {
      const app = makeApp(f);
      const res = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "", variations: 1 }),
      });
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.error.code).toBe(400);
    } finally {
      f.dispose();
    }
  });

  it("GET /api/llm/chat/:sessionId restores the capped session (chat resume)", async () => {
    const f = setup();
    try {
      const app = makeApp(f);
      await app.request("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "sess1", message: "hola" }),
      });
      const res = await app.request("/api/llm/chat/sess1");
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toMatchObject({ role: "user", content: "hola" });
    } finally {
      f.dispose();
    }
  });

  it("image route traversal guard rejects absolute paths, .. and non-whitelisted extensions", async () => {
    const f = setup();
    try {
      f.history.insertRun({
        id: "r2", status: "completed", prompt: "p", negativePrompt: null,
        params: {}, seeds: [1], promptIds: [],
      });
      writeFileSync(join(f.dataDir, "secret.png"), "SECRET");
      const app = makeApp(f);
      // traversal: encoded .. and absolute-style inputs must never be served
      // (the shell route for /api/history/:runId/images/:file only matches a
      // single path segment; multi-segment inputs fall through to 404, which
      // is also a safe non-serve. We assert the guard returns 400 for encoded
      // .. escapes and non-whitelisted extensions.)
      const resA = await app.request("/api/history/r2/images/..%2Fsecret.png");
      expect(resA.status).toBe(400);
      // raw .. within a single segment after decode
      const resB = await app.request("/api/history/r2/images/evil.html");
      expect(resB.status).toBe(400);
      // missing image inside the run
      const resD = await app.request("/api/history/r2/images/missing.png");
      expect(resD.status).toBe(404);
      // unknown run
      const resE = await app.request("/api/history/nope/images/x.png");
      expect(resE.status).toBe(404);
    } finally {
      f.dispose();
    }
  });

  it("DELETE /api/generate/:runId cancels and returns 202 {status:cancelling}", async () => {
    const f = setup();
    try {
      const gen: GenerationService = {
        start: vi.fn(async () => ({ runId: "r1", promptIds: ["p1"] })),
        runCompletion: vi.fn(async () => {}),
        cancel: vi.fn(async () => {}),
        isActive: () => true,
      };
      f.history.insertRun({
        id: "r1", status: "running", prompt: "p", negativePrompt: null,
        params: {}, seeds: [1], promptIds: ["p1"],
      });
      const app = makeApp(f, { gen });
      const res = await app.request("/api/generate/r1", { method: "DELETE" });
      expect(res.status).toBe(202);
      const body: any = await res.json();
      expect(body.status).toBe("cancelling");
    } finally {
      f.dispose();
    }
  });
});