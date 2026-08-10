/**
 * ComfyUI WebSocket relay (comfyui-integration spec "Progress Streaming"):
 * one WS client to ws://127.0.0.1:8188/ws relays `progress` and `executed`
 * messages for the prompt_ids of the active run to SSE subscribers.
 *
 * mapWsMessageToSse is a pure function mapping one raw WS message to an SSE
 * event; the relay parses incoming text frames and dispatches mapped events
 * to registered handlers. The WebSocket constructor is injectable so tests
 * never open a real socket.
 */
import type { ComfyImageOutput } from "../services/comfy";
// ESM-safe default WebSocket: this module runs under "type": "module", so
// `require` is not available. The `ws` named export is a class usable with
// `new WebSocket(url)`; tests may still inject WebSocketCtor to avoid sockets.
import { WebSocket as WsWebSocket } from "ws";

export interface WsMessage {
  type: string;
  data?: {
    prompt_id?: string;
    node?: string | number;
    value?: number;
    max?: number;
    output?: { images?: ComfyImageOutput[] };
  };
}

export interface MappedSse {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Maps a raw ComfyUI WS message to the SSE event exposed to the frontend.
 * Returns null for message types the frontend does not consume (status, etc.)
 * or for progress messages that carry no node context.
 */
export function mapWsMessageToSse(msg: WsMessage): MappedSse | null {
  const data = msg.data;
  if (!data) return null;

  if (msg.type === "progress" && data.node !== undefined) {
    return {
      event: "progress",
      data: { value: data.value, max: data.max, node: data.node },
    };
  }
  if (msg.type === "executed" && data.output?.images) {
    return {
      event: "executed",
      data: { node: data.node, images: data.output.images },
    };
  }
  return null;
}

export interface WsRelayOptions {
  url: string;
  /** Injectable WebSocket constructor (defaults to the `ws` package). */
  WebSocketCtor?: new (url: string) => WsLike;
}

export interface WsLike {
  on(event: "message", cb: (data: unknown) => void): void;
  on(event: "open", cb: () => void): void;
  on(event: "close", cb: () => void): void;
  on(event: "error", cb: (err: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export interface WsRelayHandler {
  /** Called with every mapped SSE event for a subscribed prompt_id. */
  onSse: (promptId: string, event: MappedSse) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
}

export class WsRelay {
  private readonly url: string;
  private readonly Ctor: new (url: string) => WsLike;
  private ws: WsLike | null = null;
  private readonly promptIds = new Set<string>();
  private handler: WsRelayHandler | null = null;

  constructor(opts: WsRelayOptions) {
    this.url = opts.url;
    this.Ctor = opts.WebSocketCtor ?? WsWebSocket;
  }

  /** Subscribes to prompt_ids and (re)registers the single handler. */
  subscribe(promptIds: string[], handler: WsRelayHandler): void {
    for (const id of promptIds) this.promptIds.add(id);
    this.handler = handler;
  }

  connect(): void {
    if (this.ws) return;
    const ws = new this.Ctor(this.url);
    this.ws = ws;
    ws.on("message", (raw) => this.onMessage(raw));
    ws.on("open", () => this.handler?.onOpen?.());
    ws.on("close", () => this.handler?.onClose?.());
    ws.on("error", (err) => this.handler?.onError?.(err));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  private onMessage(raw: unknown): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(String(raw)) as WsMessage;
    } catch {
      return; // non-JSON WS frame — ignore
    }
    const promptId = msg.data?.prompt_id;
    if (!promptId || !this.promptIds.has(promptId)) return;
    const mapped = mapWsMessageToSse(msg);
    if (mapped) this.handler?.onSse(promptId, mapped);
  }
}
