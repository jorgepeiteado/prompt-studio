/**
 * Boot wiring integration test (design "Async execution flow").
 *
 * Proves the CRITICAL PR3 blocker is resolved: build() now wires a REAL ComfyUI
 * WS relay (no-op `{ subscribe: () => {} }` removed) plus a real ImageWriter,
 * drives the generation orchestrator through runCompletion, and bridges all
 * progress/image/complete frames into the RunEventHub so the SSE endpoint can
 * stream them. No real network: a fake WebSocket socket receives raw ComfyUI
 * WS frames, and a fake ComfyClient answers /prompt /history /view.
 */
import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build, type BootOverrides } from "./index";
import type { ServerConfig } from "./config";
import type { ApiWorkflow } from "./services/converter";
import type { ComfyClientLike } from "./services/generation";
import type { WsLike } from "./lib/ws-relay";
import type { RunEventFrame } from "./lib/run-events";

const TINY_WORKFLOW: ApiWorkflow = { "11": { class_type: "SaveImage", inputs: {} } };
const stubConvert = (_t: ApiWorkflow, _o: Record<string, unknown>): ApiWorkflow => {
  void _t;
  void _o;
  return TINY_WORKFLOW;
};

/** A fake ComfyUI WebSocket: records registered handlers, lets tests emit raw frames. */
class FakeWs implements WsLike {
  private readonly handlers = new Map<string, Array<(data: unknown) => void>>();
  on(event: string, cb: (data: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(cb);
  }
  emit(event: string, data?: unknown): void {
    for (const cb of this.handlers.get(event) ?? []) cb(data);
  }
  send(_data: string): void {
    void _data;
  }
  close(): void {}
}

function cfgFor(dir: string): ServerConfig {
  return Object.freeze({
    serverPort: 8787,
    host: "127.0.0.1",
    dataDir: resolve(dir, "data"),
    dbPath: resolve(dir, "data", "test.db"),
    imagesDir: resolve(dir, "data", "images"),
    comfyUrl: "http://127.0.0.1:8188",
    comfyWsUrl: "ws://127.0.0.1:8188/ws",
    llmPort: 8080,
    llmBin: "",
    llmModel: "",
    llmSystemPrompt: "",
    llmCtx: 8192,
    llmNgl: 0,
    llmPidFile: resolve(dir, "data", ".llm.pid"),
    llmHealthTimeoutMs: 1000,
  });
}

interface Harness {
  boot: ReturnType<typeof build>;
  cfg: ServerConfig;
  socket: FakeWs;
  comfy: ComfyClientLike;
  db: Database.Database;
  dataDir: string;
  dispose: () => void;
}

async function bootHarness(options: {
  variations?: number;
  overrides?: BootOverrides;
} = {}): Promise<Harness> {
  const dir = mkdtempSync(resolve(tmpdir(), "ps-boot-"));
  const cfg = cfgFor(dir);
  mkdirSync(cfg.imagesDir, { recursive: true });
  const db = new Database(cfg.dbPath);
  const pids = ["pid-0", "pid-1", "pid-2", "pid-3"];

  const socket = new FakeWs();
  const comfy: ComfyClientLike = {
    submitPrompt: vi.fn(async () => pids.shift() ?? "pid-x"),
    getHistory: vi.fn(async () => ({ status: { status_str: "success", completed: true } })),
    getImage: vi.fn(async () => Buffer.from([3, 1, 4, 1, 5, 9])),
  };

  // A regular function (not arrow) is constructible with `new` and returns the
  // same FakeWs instance, so WsRelay.connect() registers handlers on `socket`.
  const WebSocketCtor = function (_url: string): FakeWs {
    void _url;
    return socket;
  } as unknown as new (url: string) => FakeWs;

  const template = options.overrides?.template ?? TINY_WORKFLOW;
  void template;

  const boot = build(db, cfg, {
    comfy,
    convert: stubConvert,
    template: TINY_WORKFLOW,
    WebSocketCtor,
    ...(options.overrides ?? {}),
  });

  return {
    boot,
    cfg,
    socket,
    comfy,
    db,
    dataDir: dir,
    dispose: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

/** Polls until `pred` is true (or times out) so async handler chains settle. */
async function waitUntil(pred: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await tick();
  }
}

async function postGenerate(h: Harness, variations: number): Promise<{ runId: string; promptIds: string[] }> {
  const res = await h.boot.app.request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "boot test prompt",
      variations,
      seed: 100,
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 2.5,
    }),
  });
  expect(res.status).toBe(202);
  return (await res.json()) as { runId: string; promptIds: string[] };
}

function connectRelay(h: Harness): void {
  h.boot.relay.connect();
  h.socket.emit("open");
}

describe("boot wiring — real relay drives a run to completion", () => {
  it("submits, streams progress/executed over the WS relay, writes images and completes the run", async () => {
    const h = await bootHarness({ variations: 2 });
    try {
      const { runId, promptIds } = await postGenerate(h, 2);
      connectRelay(h);
      expect(promptIds).toHaveLength(2);

      const events: RunEventFrame[] = [];
      const unsub = h.boot.events.subscribe(runId, (f) => events.push(f));

      for (const pid of promptIds) {
        h.socket.emit("message", JSON.stringify({ type: "progress", data: { prompt_id: pid, node: 3, value: 5, max: 10 } }));
        h.socket.emit(
          "message",
          JSON.stringify({
            type: "executed",
            data: { prompt_id: pid, node: "11", output: { images: [{ filename: `${pid}.png`, subfolder: "", type: "output" }] } },
          }),
        );
      }
      // Wait for the terminal frame: it is published only after every image
      // row was stored, so disposal below cannot race in-flight handlers.
      await waitUntil(() => events.some((f) => f.type === "complete"));

      const detail = h.boot.history.detailByRunId(runId);
      expect(detail?.status).toBe("completed");
      expect(detail?.images ?? []).toHaveLength(2);

      // Real writer wrote image files to disk under data/images/<runId>/
      expect(existsSync(resolve(h.dataDir, "data", "images", runId))).toBe(true);

      // Frames bridged into the hub: progress + image + complete
      expect(events.some((f) => f.type === "progress")).toBe(true);
      expect(events.filter((f) => f.type === "image")).toHaveLength(2);
      expect(events.some((f) => f.type === "complete")).toBe(true);

      // runCompletion released the busy lock -> a second run is accepted
      const res2 = await postGenerate(h, 1);
      expect(res2.runId).toBeTruthy();

      unsub();
    } finally {
      h.dispose();
    }
  });

  it("ignores post-cancel WS events and marks the run cancelled", async () => {
    const h = await bootHarness({ variations: 1 });
    try {
      const { runId, promptIds } = await postGenerate(h, 1);
      connectRelay(h);

      await h.boot.app.request(`/api/generate/${runId}`, { method: "DELETE" });
      // late executed event for the (now cancelled) prompt must be ignored
      h.socket.emit(
        "message",
        JSON.stringify({
          type: "executed",
          data: { prompt_id: promptIds[0], node: "11", output: { images: [{ filename: "late.png", subfolder: "", type: "output" }] } },
        }),
      );
      await tick();

      const detail = h.boot.history.detailByRunId(runId);
      expect(detail?.status).toBe("cancelled");
      expect(detail?.images ?? []).toHaveLength(0);
    } finally {
      h.dispose();
    }
  });

  it("SSE endpoint streams progress/image/complete frames live while the run executes", async () => {
    const h = await bootHarness({ variations: 1 });
    try {
      const { runId, promptIds } = await postGenerate(h, 1);
      connectRelay(h);

      const res = await h.boot.app.request(`/api/generate/${runId}/events`);
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      let text = "";
      let pushed = false;
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline && !text.includes("event: complete")) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        // Push the run's WS frames once the stream is open.
        if (!pushed) {
          pushed = true;
          h.socket.emit("message", JSON.stringify({ type: "progress", data: { prompt_id: promptIds[0], node: 3, value: 9, max: 10 } }));
          h.socket.emit(
            "message",
            JSON.stringify({
              type: "executed",
              data: { prompt_id: promptIds[0], node: "11", output: { images: [{ filename: "out.png", subfolder: "", type: "output" }] } },
            }),
          );
        }
      }
      await reader.cancel();

      expect(text).toContain("event: queued");
      expect(text).toContain("event: progress");
      expect(text).toContain("event: image");
      expect(text).toContain("event: complete");
    } finally {
      h.dispose();
    }
  });
});