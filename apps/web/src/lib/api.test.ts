import { describe, expect, it, vi } from "vitest";
import { createApi, parseSseChunk, messageForError, ApiError } from "./api";

/** Minimal fake EventSource honoring the subset api.ts uses. */
function fakeEventSource(handlers: {
  open?: () => void;
  frame?: (event: string, data: string) => void;
  error?: () => void;
  closeSpy?: () => void;
}): new (url: string) => {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (type: string, cb: (ev: { data?: string }) => void) => void;
  close: () => void;
} {
  return class FakeEventSource {
    onopen: (() => void) | null = handlers.open ?? null;
    onerror: (() => void) | null = handlers.error ?? null;
    private listeners = new Map<string, (ev: { data?: string }) => void>();
    constructor(public url: string) {
      setTimeout(() => this.onopen?.(), 0);
    }
    addEventListener(type: string, cb: (ev: { data?: string }) => void) {
      this.listeners.set(type, cb);
    }
    emit(type: string, data: string) {
      this.listeners.get(type)?.(type === "open" ? {} : { data });
    }
    close() {
      handlers.closeSpy?.();
    }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
}

describe("lib/api.ts — fetch/SSE wrapper (RED first, mocked fetch + EventSource)", () => {
  it("postGenerate POSTs the payload to /api/generate and returns runId+promptIds", async () => {
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe("/api/generate");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.prompt).toBe("un prompt");
      expect(body.variations).toBe(4);
      return jsonResponse({ runId: "r1", promptIds: ["p1", "p2"] }, 202);
    });
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const result = await api.postGenerate({
      prompt: "un prompt",
      variations: 4,
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 2.5,
      sampler: "euler",
      scheduler: "simple",
      seed: 42,
    });
    expect(result).toEqual({ runId: "r1", promptIds: ["p1", "p2"] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("surfaces the API error envelope with code on non-OK responses", async () => {
    const fetchFn = fetchMock(() =>
      jsonResponse({ error: { code: 409, message: "Busy." } }, 409),
    );
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    await expect(
      api.postGenerate({ prompt: "x", variations: 1, width: 1, height: 1, steps: 20, cfg: 2.5 }),
    ).rejects.toMatchObject({ code: 409 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("getLlmStatus returns the llm readiness shape", async () => {
    const fetchFn = fetchMock(() =>
      jsonResponse({ ready: true, port: 8080, model: "qwen", adopted: false }),
    );
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const status = await api.getLlmStatus();
    expect(status.ready).toBe(true);
    expect(status.port).toBe(8080);
  });

  it("getChatSession returns session messages for refresh hydration", async () => {
    const fetchFn = fetchMock(() =>
      jsonResponse({
        sessionId: "s1",
        messages: [
          { role: "user", content: "hola" },
          { role: "assistant", content: "contame más", isFinalPrompt: false },
        ],
      }),
    );
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const session = await api.getChatSession("s1");
    expect(session.sessionId).toBe("s1");
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]).toMatchObject({ role: "user", content: "hola" });
  });

  it("getHistory returns the run list", async () => {
    const fetchFn = fetchMock(() =>
      jsonResponse([
        { id: "r9", status: "completed", prompt: "foto", variations: 4, thumbnail: null },
      ]),
    );
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const list = await api.getHistory();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "r9", status: "completed" });
  });

  it("getRunDetail returns run + images + chat + params", async () => {
    const fetchFn = fetchMock((url) => {
      expect(url).toBe("/api/history/r1");
      return jsonResponse({
        id: "r1",
        status: "completed",
        prompt: "foto",
        params: { width: 1024, height: 1024, steps: 20, cfg: 2.5 },
        seeds: [1, 2],
        promptIds: ["p1", "p2"],
        chat: [],
        images: [{ variationIndex: 0, kind: "base", filename: "a.png", url: "/x/a.png" }],
        error: null,
      });
    });
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const detail = await api.getRunDetail("r1");
    expect(detail.images).toHaveLength(1);
    expect(detail.seeds).toEqual([1, 2]);
  });

  it("deleteRun resolves on 204", async () => {
    const fetchFn = fetchMock(() => new Response(null, { status: 204 }));
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    await expect(api.deleteRun("r1")).resolves.toBeUndefined();
  });

  it("cancelGenerate sends DELETE /api/generate/:runId", async () => {
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe("/api/generate/r1");
      expect(init?.method).toBe("DELETE");
      return jsonResponse({ status: "cancelling" }, 202);
    });
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    await expect(api.cancelGenerate("r1")).resolves.toBeUndefined();
  });

  it("postRegenerate sends fromRunId + keepSeed and returns the new run", async () => {
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe("/api/regenerate");
      const body = JSON.parse(String(init?.body));
      expect(body.fromRunId).toBe("r1");
      expect(body.keepSeed).toBe(true);
      return jsonResponse({ runId: "r2", promptIds: ["p9"] }, 202);
    });
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const result = await api.postRegenerate({ fromRunId: "r1", keepSeed: true });
    expect(result.runId).toBe("r2");
  });

  it("getGenerateRun returns the poll-fallback status shape", async () => {
    const fetchFn = fetchMock((url) => {
      expect(url).toBe("/api/generate/r1");
      return jsonResponse({
        status: "running",
        images: [{ variationIndex: 0, kind: "base", url: "/x/a.png" }],
        error: null,
      });
    });
    const api = createApi({ fetchFn, EventSourceCtor: fakeEventSource({}) });
    const run = await api.getGenerateRun("r1");
    expect(run.status).toBe("running");
    expect(run.images).toHaveLength(1);
  });

  it("subscribeProgress opens an EventSource and dispatches parsed frames", async () => {
    const listeners = new Map<string, (ev: { data?: string }) => void>();
    const CapturingES = class CapturingEventSource {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public url: string) {}
      addEventListener(type: string, cb: (ev: { data?: string }) => void) {
        listeners.set(type, cb);
      }
      close() {}
    };
    const api2 = createApi({
      fetchFn: fetchMock(() => jsonResponse({})),
      EventSourceCtor: CapturingES,
    });
    const seen: Array<{ type: string; variationIndex?: number }> = [];
    const unsubscribe = api2.subscribeProgress("r1", (ev) =>
      seen.push({ type: ev.type, variationIndex: ev.variationIndex }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(listeners.size).toBeGreaterThan(0);
    // Simulate SSE frames of two different event types arriving from the server.
    listeners.get("image")?.({ data: JSON.stringify({ type: "image", runId: "r1", variationIndex: 2, url: "/x/b.png" }) });
    listeners.get("done")?.({ data: JSON.stringify({ type: "done", runId: "r1" }) });
    expect(seen).toEqual([
      { type: "image", variationIndex: 2 },
      { type: "done" },
    ]);
    expect(unsubscribe).toBeTypeOf("function");
  });

  it("parseSseChunk splits concatenated SSE frames into typed data", () => {
    const chunk = [
      'event: token\ndata: {"type":"token","text":"hola"}\n\n',
      'event: done\ndata: {"type":"done","full":"hola","isFinalPrompt":true}\n\n',
      ': keep-alive\n\n',
    ].join("");
    const frames = parseSseChunk(chunk);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ type: "token", text: "hola" });
    expect(frames[1]).toMatchObject({ type: "done", isFinalPrompt: true });
  });

  it("messageForError maps API codes to Spanish designed copy", () => {
    expect(messageForError(new ApiError(409, "busy"))).toContain("generación");
    expect(messageForError(new ApiError(502, "down"))).toContain("ComfyUI");
    expect(messageForError(new ApiError(503, "starting"))).toContain("arrancando");
    expect(messageForError(new ApiError(999, "unknown"))).toBe("Algo salió mal. Reintentá en un momento.");
  });
});