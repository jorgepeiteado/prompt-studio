/**
 * Thin fetch / SSE wrapper (design "API contract" + "lib/api.ts"). Every server
 * endpoint the UI consumes lives here. fetch and EventSource are injectable so
 * the wrapper is testable with mocks; a default instance wires the browser
 * globals. Unifies the server error envelope into an ApiError with a numeric
 * code.
 */

import { strings } from "./strings";
import type { GenerateRequestDto, RunSummaryDto, RunDetailDto } from "@promptstudio/shared";

/** Injected fetch implementation (string URL only — the wrapper never routes). */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Subset of the EventSource API that api.ts uses (mocked in tests). */
export interface ProgressEventSource {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: string, cb: (ev: { data?: string }) => void): void;
  close(): void;
}

export interface ApiDeps {
  fetchFn: FetchLike;
  EventSourceCtor: new (url: string) => ProgressEventSource;
}

/** Structured error carrying the server's numeric code. */
export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  steps: number;
  cfg: number;
  sampler?: string;
  scheduler?: string;
  width: number;
  height: number;
  aspect?: string;
  variations: number;
  upscale?: boolean;
}

export interface LlmStatus {
  ready: boolean;
  port?: number;
  model?: string;
  adopted?: boolean;
}

export interface ChatMessageView {
  role: string;
  content: string;
  isFinalPrompt?: boolean;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessageView[];
}

export interface RunStatusView {
  status: string;
  images: Array<{ variationIndex: number; kind: string; url: string }>;
  error: string | null;
}

export interface GeneratedRun {
  runId: string;
  promptIds: string[];
}

export interface ProgressEvent {
  type: string;
  runId: string;
  variationIndex?: number;
  progress?: number;
  url?: string;
  message?: string;
}

/**
 * Splits a raw SSE buffer into parsed `data:` JSON frames, ignoring comments
 * (lines starting `:`) and the event: prefix. Returns every frame we can parse.
 */
export function parseSseChunk(chunk: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  for (const block of chunk.split("\n\n")) {
    if (!block.trim()) continue;
    const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) continue; // comment-only (keep-alive) block
    try {
      frames.push(JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>);
    } catch {
      // trailing partial frame — skip
    }
  }
  return frames;
}

/** Maps an ApiError code to the designed Spanish copy (errors fall back generic). */
export function messageForError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 500;
  return (strings.errors as unknown as Record<string, string>)[String(code)] ?? strings.errors.generic;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function assertOk(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await parseBody(res)) as { error?: { code?: number; message?: string; details?: unknown } } | undefined;
    const code = body?.error?.code ?? res.status;
    const message = body?.error?.message ?? res.statusText;
    throw new ApiError(code, message, body?.error?.details);
  }
  return parseBody(res);
}

/** Builds the api object bound to injected deps (fetch/EventSource). */
export function createApi(deps: ApiDeps) {
  async function send(url: string, init: RequestInit = {}): Promise<unknown> {
    const res = await deps.fetchFn(url, init);
    return assertOk(res);
  }

  return {
    postGenerate(params: GenerateParams): Promise<GeneratedRun> {
      const body: GenerateRequestDto = {
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        seed: params.seed,
        steps: params.steps,
        cfg: params.cfg,
        sampler: params.sampler,
        scheduler: params.scheduler,
        width: params.width,
        height: params.height,
        aspect: (params.aspect as GenerateRequestDto["aspect"]) ?? undefined,
        variations: params.variations,
        upscale: params.upscale,
      };
      return send("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as Promise<GeneratedRun>;
    },

    cancelGenerate(runId: string): Promise<void> {
      return send(`/api/generate/${runId}`, { method: "DELETE" }).then(() => undefined);
    },

    getGenerateRun(runId: string): Promise<RunStatusView> {
      return send(`/api/generate/${runId}`) as Promise<RunStatusView>;
    },

    postRegenerate(input: {
      fromRunId: string;
      prompt?: string;
      params?: Partial<GenerateParams>;
      keepSeed?: boolean;
    }): Promise<GeneratedRun> {
      return send("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }) as Promise<GeneratedRun>;
    },

    getLlmStatus(): Promise<LlmStatus> {
      return send("/api/llm/status") as Promise<LlmStatus>;
    },

    getChatSession(sessionId: string): Promise<ChatSession> {
      return send(`/api/llm/chat/${encodeURIComponent(sessionId)}`) as Promise<ChatSession>;
    },

    async streamChat(
      sessionId: string,
      message: string,
      handlers: {
        onToken: (text: string) => void;
        onDone: (full: string, isFinalPrompt: boolean) => void;
        onError: (err: ApiError) => void;
        signal?: AbortSignal;
      },
    ): Promise<void> {
      let res: Response;
      try {
        res = await deps.fetchFn("/api/llm/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message }),
          signal: handlers.signal,
        });
      } catch (err) {
        if (handlers.signal?.aborted) return;
        handlers.onError(err instanceof Error ? new ApiError(500, err.message) : new ApiError(500, String(err)));
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as { error?: { code?: number; message?: string } } | undefined;
        handlers.onError(new ApiError(body?.error?.code ?? res.status, body?.error?.message ?? res.statusText));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError(new ApiError(500, "No response body."));
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (handlers.signal?.aborted) {
          reader.cancel().catch(() => undefined);
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = parseSseChunk(buffer);
        // keep only the possibly-incomplete trailing fragment in the buffer
        const lastEnd = buffer.lastIndexOf("\n\n");
        buffer = lastEnd >= 0 ? buffer.slice(lastEnd + 2) : "";
        for (const frame of frames) {
          if (frame.type === "token") {
            full += String(frame.text ?? "");
            handlers.onToken(String(frame.text ?? ""));
          } else if (frame.type === "done") {
            handlers.onDone(String(frame.full ?? full), Boolean(frame.isFinalPrompt));
          } else if (frame.type === "error") {
            handlers.onError(new ApiError(500, String(frame.message ?? "LLM stream failed.")));
          }
        }
      }
      // flush a trailing un-terminated done when the stream closed cleanly
      if (!handlers.signal?.aborted && full && !res.ok) {
        handlers.onDone(full, false);
      }
    },

    getHistory(): Promise<RunSummaryDto[]> {
      return send("/api/history") as Promise<RunSummaryDto[]>;
    },

    getRunDetail(runId: string): Promise<RunDetailDto> {
      return send(`/api/history/${encodeURIComponent(runId)}`) as Promise<RunDetailDto>;
    },

    deleteRun(runId: string): Promise<void> {
      return send(`/api/history/${encodeURIComponent(runId)}`, { method: "DELETE" }).then(() => undefined);
    },

    subscribeProgress(runId: string, onEvent: (ev: ProgressEvent) => void): () => void {
      const source = new deps.EventSourceCtor(`/api/generate/${runId}/events`);
      const types = ["queued", "started", "progress", "image", "complete", "cancelled", "error", "done"];
      const handler = (ev: { data?: string }) => {
        if (!ev.data) return;
        try {
          onEvent(JSON.parse(ev.data) as ProgressEvent);
        } catch {
          /* malformed frame — skip */
        }
      };
      for (const type of types) source.addEventListener(type, handler);
      source.onopen = () => undefined;
      source.onerror = () => onEvent({ type: "error", runId });
      return () => source.close();
    },
  };
}

/** Default instance bound to the browser's fetch/EventSource. */
export const api = createApi({
  fetchFn: (...args: Parameters<FetchLike>) => fetch(...args),
  EventSourceCtor:
    (typeof EventSource !== "undefined" ? EventSource : class {}) as unknown as new (
      url: string,
    ) => ProgressEventSource,
});