/**
 * Server boot (design "index.ts — Hono app, bind 127.0.0.1, llm boot,
 * shutdown hooks). Entry is split: build(db, cfg) wires all runtime
 * dependencies (importable in tests without side effects); startServer() is the
 * thin production entry that opens the real DB, boots the LLM and serves on
 * the loopback host. Heavy native wiring (ws relay, spawn) is injected at boot,
 * never hard-coded in services.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { serve } from "@hono/node-server";
import { getConfig, type ServerConfig } from "./config";
import { migrate } from "./db/migrate";
import { createHistoryRepo, type HistoryRepo } from "./db/history";
import type { RunStatus } from "./db/history";
import { ComfyClient } from "./services/comfy";
import { convert } from "./services/converter";
import { createGenerationService, type GenerationStore } from "./services/generation";
import { createLlmLifecycle, type LlmLifecycle } from "./services/llm";
import { createChatService, type ChatService } from "./services/chat";
import { createThumbnailer } from "./services/thumbs";
import { createApp, type AppServices } from "./app";

export { createApp };
export type { AppServices };

export interface BootResult {
  app: ReturnType<typeof createApp>;
  config: ServerConfig;
  services: AppServices;
  history: HistoryRepo;
  llm: LlmLifecycle;
  chat: ChatService;
}

/** Opens the DB, runs migrations, and wires every runtime dependency. */
export function build(db: Database.Database, cfg: ServerConfig): BootResult {
  if (cfg.host !== "127.0.0.1") {
    throw new Error(`Refusing to bind server on ${cfg.host}; loopback only.`);
  }

  migrate(db);
  const history = createHistoryRepo(db, cfg.dataDir);
  const comfy = new ComfyClient({ baseUrl: cfg.comfyUrl });

  const llm = createLlmLifecycle({
    binPath: cfg.llmBin,
    modelPath: cfg.llmModel,
    systemPromptPath: "",
    port: cfg.llmPort,
    ctx: cfg.llmCtx,
    ngl: cfg.llmNgl,
    healthUrl: `http://127.0.0.1:${cfg.llmPort}/health`,
    pidFile: cfg.llmPidFile,
    pollIntervalMs: 500,
    healthTimeoutMs: cfg.llmHealthTimeoutMs,
    binExists: () => true,
    spawnFn: () => {
      throw new Error("spawnFn must be injected at boot; not wired in build().");
    },
    execFile: () => {},
    fetchFn: (url, init) => fetch(url, init),
    killFn: () => {},
    readPidFile: () => null,
    writePidFile: () => {},
    removePidFile: () => {},
    fsExists: () => true,
  });

  const chat = createChatService({
    llmUrl: `http://127.0.0.1:${cfg.llmPort}`,
    systemPrompt: cfg.llmSystemPrompt,
    model: "default",
    fetchFn: (url, init) => fetch(url, init),
  });

  const thumb = createThumbnailer(cfg.dataDir);

  const store: GenerationStore = {
    async createRun(run) {
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
    async markRunning(runId, promptIds) {
      history.updateStatus(runId, "running");
      void promptIds;
    },
    async setStatus(runId, status, error) {
      history.updateStatus(runId, status as RunStatus, error);
    },
    async addImage(img) {
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
    async getRun(runId) {
      const d = history.detailByRunId(runId);
      return d ? (d as unknown as Record<string, unknown>) : null;
    },
  };

  const generation = createGenerationService({
    comfy: comfy as unknown as Parameters<typeof createGenerationService>[0]["comfy"],
    relay: { subscribe: () => {} } as Parameters<typeof createGenerationService>[0]["relay"],
    store,
    writer: {
      writeImage: async (opts) => ({
        localPath: `images/${opts.runId}/${opts.variationIndex}_${opts.filename}`,
        width: 1024,
        height: 1024,
      }),
    },
    thumb,
    convert: convert as unknown as Parameters<typeof createGenerationService>[0]["convert"],
    template: {} as Parameters<typeof createGenerationService>[0]["template"],
  });

  const services: AppServices = {
    comfy,
    comfyUrl: cfg.comfyUrl,
    llm,
    chat,
    generation,
    history,
    dataDir: cfg.dataDir,
    convertTemplate: convert,
  };

  const app = createApp(services);
  return { app, config: cfg, services, history, llm, chat };
}

/** Thin production entry: create dirs, open the DB, build, boot LLM. */
export async function startServer(): Promise<void> {
  const cfg = getConfig();
  mkdirSync(cfg.imagesDir, { recursive: true });
  mkdirSync(dirname(cfg.dbPath), { recursive: true });
  const db = new Database(cfg.dbPath);
  db.pragma("journal_mode = WAL");
  const { app, llm } = build(db, cfg);
  const server = serve(
    { fetch: app.fetch, port: cfg.serverPort, hostname: cfg.host },
    (info) => {
      const addr = info as { address?: string; port: number };
      console.log(`[prompt-studio] listening on http://${cfg.host}:${addr.port}`);
    },
  );
  // Boot the LLM in the background; the HTTP layer is up regardless. If the
  // LLM is not configured (blank bin/model) or unreachable, log a warning so
  // /api/health and /api/llm/status still answer.
  void llm.start().then(
    (res) => {
      console.log(
        `[prompt-studio] LLM ${res.adopted ? "adopted" : "spawned (pid " + res.pid + ")"} on :${cfg.llmPort}`,
      );
      if (!res.adopted && res.pid == null) {
        console.warn("[prompt-studio] LLM did not report ready in time; /api/llm/* will 503 until healthy.");
      }
    },
    (err: unknown) => {
      console.warn(`[prompt-studio] LLM boot skipped: ${err instanceof Error ? err.message : String(err)}`);
    },
  );
  const close = async () => {
    try {
      await llm.stop();
    } catch {
      /* best-effort */
    }
    server.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "index.ts")).href) {
  void startServer();
}