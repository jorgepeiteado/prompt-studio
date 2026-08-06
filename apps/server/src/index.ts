/**
 * Server boot (design "index.ts — Hono app, bind 127.0.0.1, llm boot,
 * shutdown hooks). Entry is split: build(db, cfg) wires all runtime
 * dependencies (importable in tests without side effects); startServer() is the
 * thin production entry that opens the real DB, boots the LLM and serves on
 * the loopback host. Heavy native wiring (ws relay, spawn) is injected at boot,
 * never hard-coded in services.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { serve } from "@hono/node-server";
import { getConfig, type ServerConfig } from "./config";
import { migrate } from "./db/migrate";
import { createHistoryRepo, type HistoryRepo } from "./db/history";
import type { RunStatus } from "./db/history";
import { ComfyClient } from "./services/comfy";
import { convert } from "./services/converter";
import type { ApiWorkflow } from "./services/converter";
import { createGenerationService, type GenerationStore } from "./services/generation";
import type { ComfyClientLike, ImageWriter, MappedSseLike, RelayLike } from "./services/generation";
import { createLlmLifecycle, type LlmLifecycle } from "./services/llm";
import { createChatService, type ChatService } from "./services/chat";
import { createThumbnailer } from "./services/thumbs";
import { WsRelay, type WsLike } from "./lib/ws-relay";
import { createRunEventHub, type RunEventHub } from "./lib/run-events";
import { createApp, type AppServices } from "./app";

export { createApp };
export type { AppServices };

/**
 * Injectable overrides for `build()` — lets tests replace the network-touching
 * pieces (ComfyUI HTTP client, ComfyUI WebSocket constructor) and native
 * artifacts without ever opening a socket. Production `startServer()` calls
 * build() with no overrides.
 */
export interface BootOverrides {
  /** Replace the ComfyUI HTTP client (tests never reach the network). */
  comfy?: ComfyClientLike;
  /** Injectable WebSocket constructor for the shared ComfyUI WS relay. */
  WebSocketCtor?: new (url: string) => WsLike;
  /** Replace the default disk-backed ImageWriter. */
  writer?: ImageWriter;
  /** Committed LiteGraph workflow template (default: assets/workflows/…). */
  template?: ApiWorkflow;
  /** Replace the deterministic workflow converter. */
  convert?: (template: ApiWorkflow, opts: Record<string, unknown>) => ApiWorkflow;
}

export interface BootResult {
  app: ReturnType<typeof createApp>;
  config: ServerConfig;
  services: AppServices;
  history: HistoryRepo;
  llm: LlmLifecycle;
  chat: ChatService;
  /** ComfyUI WS relay wired to the generation orchestrator. */
  relay: WsRelay;
  /** Per-run event hub bridging orchestrator frames to SSE subscribers. */
  events: RunEventHub;
}

/** Writes decoded ComfyUI images to `data/images/<runId>/<variation>_<file>`. */
function createImageWriter(dataDir: string): ImageWriter {
  return {
    async writeImage(opts: Record<string, unknown>) {
      const runId = String(opts.runId);
      const variationIndex = Number(opts.variationIndex);
      const filename = String(opts.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const data = opts.data as Buffer;
      const dir = join(dataDir, "images", runId);
      mkdirSync(dir, { recursive: true });
      const localPath = join(dir, `${variationIndex}_${filename}`);
      writeFileSync(localPath, data);
      return { localPath, width: 1024, height: 1024 };
    },
  };
}

function loadTemplate(): ApiWorkflow {
  const here = dirname(fileURLToPath(import.meta.url));
  const assetPath = resolve(here, "../../../assets/workflows/workflow_fotorealista_qwen.json");
  return JSON.parse(readFileSync(assetPath, "utf8")) as ApiWorkflow;
}

/** Opens the DB, runs migrations, and wires every runtime dependency. */
export function build(db: Database.Database, cfg: ServerConfig, overrides: BootOverrides = {}): BootResult {
  if (cfg.host !== "127.0.0.1") {
    throw new Error(`Refusing to bind server on ${cfg.host}; loopback only.`);
  }

  migrate(db);
  const history = createHistoryRepo(db, cfg.dataDir);
  const comfy: ComfyClient = (overrides.comfy ?? new ComfyClient({ baseUrl: cfg.comfyUrl })) as unknown as ComfyClient;

  const events = createRunEventHub();

  // One shared WS client relays ComfyUI `progress`/`executed` frames for the
  // active run's prompt_ids. The adapter turns the relay's handler-object shape
  // into the orchestrator's `(promptId, sse)` callback signature.
  const wsRelay = new WsRelay({ url: cfg.comfyWsUrl, WebSocketCtor: overrides.WebSocketCtor });
  const relay: RelayLike = {
    subscribe(promptIds, handler) {
      wsRelay.subscribe(promptIds, {
        onSse: (promptId, sse) => {
          void handler(promptId, sse as MappedSseLike);
        },
      });
    },
  };

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
    relay,
    store,
    writer: overrides.writer ?? createImageWriter(cfg.dataDir),
    thumb,
    convert: (overrides.convert ?? (convert as unknown as Parameters<typeof createGenerationService>[0]["convert"])),
    template: (overrides.template ?? loadTemplate()) as ApiWorkflow,
    emit: (runId, event) => events.publish(runId, event),
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
    events,
  };

  const app = createApp(services);
  return { app, config: cfg, services, history, llm, chat, relay: wsRelay, events };
}

/** Thin production entry: create dirs, open the DB, build, boot LLM. */
export async function startServer(): Promise<void> {
  const cfg = getConfig();
  mkdirSync(cfg.imagesDir, { recursive: true });
  mkdirSync(dirname(cfg.dbPath), { recursive: true });
  const db = new Database(cfg.dbPath);
  db.pragma("journal_mode = WAL");
  const { app, llm, relay } = build(db, cfg);
  // Open the shared ComfyUI WS client; progress/executed frames for active
  // runs flow through it into the SSE endpoint (design "Async execution flow").
  relay.connect();
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
    relay.close();
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