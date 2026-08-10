import { describe, expect, it, vi } from "vitest";
import { encodeSse, parseSseStream } from "./sse";
import { mapWsMessageToSse, WsRelay } from "./ws-relay";
import type { WsLike } from "./ws-relay";

describe("sse framing", () => {
  it("encodes one SSE event frame with event name and JSON data", () => {
    const frame = encodeSse("progress", { value: 5, max: 10 });
    expect(frame).toBe("event: progress\ndata: {\"value\":5,\"max\":10}\n\n");
  });

  it("encodes an error frame", () => {
    const frame = encodeSse("error", { message: "boom" });
    expect(frame).toContain("event: error");
    expect(frame).toContain("\"message\":\"boom\"");
  });

  it("parses a stream of concatenated frames back into events", () => {
    const stream = encodeSse("progress", { value: 1 }) + encodeSse("done", { full: "x" });
    expect(parseSseStream(stream)).toEqual([
      { event: "progress", data: { value: 1 } },
      { event: "done", data: { full: "x" } },
    ]);
  });

  it("ignores blank/incomplete trailing data", () => {
    expect(parseSseStream("event: progress\ndata: {")).toEqual([]);
  });
});

describe("ws-relay mapping (ComfyUI WS → SSE)", () => {
  it("maps a progress message to an SSE progress frame with value and max", () => {
    const mapped = mapWsMessageToSse({
      type: "progress",
      data: { prompt_id: "pid-1", node: "9", value: 4, max: 20 },
    });
    expect(mapped).toEqual({ event: "progress", data: { value: 4, max: 20, node: "9" } });
  });

  it("maps an executed message to an SSE executed frame carrying image outputs", () => {
    const mapped = mapWsMessageToSse({
      type: "executed",
      data: {
        prompt_id: "pid-1",
        node: "11",
        output: {
          images: [{ filename: "img_00001_.png", subfolder: "", type: "output" }],
        },
      },
    });
    expect(mapped).toEqual({
      event: "executed",
      data: {
        node: "11",
        images: [{ filename: "img_00001_.png", subfolder: "", type: "output" }],
      },
    });
  });

  it("returns null for non-image / irrelevant message types", () => {
    expect(mapWsMessageToSse({ type: "status", data: {} })).toBeNull();
    expect(mapWsMessageToSse({ type: "progress", data: {} })).toBeNull(); // no nodes
  });
});

describe("WsRelay dispatch", () => {
  it("dispatches mapped SSE events to the handler only for subscribed prompt_ids", () => {
    type Handler = (ev: "message" | "open" | "close" | "error", cb: (...a: unknown[]) => void) => void;
    const listeners = new Map<string, (...a: unknown[]) => void>();
    const fakeWs: WsLike = {
      on: ((ev: string, cb: (...a: unknown[]) => void) => {
        listeners.set(ev, cb);
      }) as unknown as Handler,
      send: () => {},
      close: () => {},
    };
    const Relay = class {
      constructor(u: string) {
        void u;
        return fakeWs;
      }
    } as unknown as new (u: string) => WsLike;

    const relay = new WsRelay({ url: "ws://x/ws", WebSocketCtor: Relay });
    const onSse = vi.fn();
    relay.subscribe(["pid-1"], { onSse });
    relay.connect();

    // Subscribed prompt_id → dispatched.
    listeners.get("message")?.(
      JSON.stringify({ type: "progress", data: { prompt_id: "pid-1", node: "9", value: 2, max: 10 } }),
    );
    // Unrelated prompt_id → ignored.
    listeners.get("message")?.(
      JSON.stringify({ type: "progress", data: { prompt_id: "pid-9", node: "9", value: 2, max: 10 } }),
    );
    expect(onSse).toHaveBeenCalledTimes(1);
    expect(onSse).toHaveBeenCalledWith("pid-1", {
      event: "progress",
      data: { value: 2, max: 10, node: "9" },
    });
  });

  it("ignores malformed non-JSON frames without throwing", () => {
    const listeners = new Map<string, (...a: unknown[]) => void>();
    const fakeWs: WsLike = {
      on: (ev, cb) => void listeners.set(ev, cb),
      send: () => {},
      close: () => {},
    };
    const Fake = class {
      constructor(u: string) {
        void u;
        return fakeWs;
      }
    } as unknown as new (u: string) => WsLike;
    const relay = new WsRelay({ url: "ws://x/ws", WebSocketCtor: Fake });
    const onSse = vi.fn();
    relay.subscribe(["pid-1"], { onSse });
    relay.connect();
    listeners.get("message")?.("not-json{");
    expect(onSse).not.toHaveBeenCalled();
  });

  it("resolves the default WebSocket constructor under ESM (no require)", () => {
    // Regression: the runtime default previously used `require("ws")`, which
    // crashes with "ReferenceError: require is not defined" under "type": "module".
    // Tests always injected WebSocketCtor, so this path was never exercised.
    const relay = new WsRelay({ url: "ws://127.0.0.1:8188/ws" });
    const ctor = (relay as unknown as { Ctor: { name?: string } }).Ctor;
    expect(typeof ctor).toBe("function");
    // The default must be the real `ws` WebSocket class (constructible shape).
    expect(ctor?.name).toBe("WebSocket");
  });
});