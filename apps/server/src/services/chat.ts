/**
 * Chat streaming + conversation state (llm-runtime spec "OpenAI-Compatible
 * Chat API", design "Streaming" + "Conversation state").
 *
 * stream() POSTs /v1/chat/completions (stream:true) with the system prompt
 * held server-side plus per-session history; parses NDJSON deltas and emits
 * SSE frames {type:"token",text}…{type:"done",full,isFinalPrompt}. The final
 * prompt is detected with the shared detectFinalPrompt (interview-assistant).
 * Sessions live in a Map capped at maxMessages (drop oldest pairs) and are
 * GC'd after idleTtlMs of inactivity. fetch is injectable for tests.
 */
import { detectFinalPrompt } from "@promptstudio/shared";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isFinalPrompt?: boolean;
}

export interface ChatServiceDeps {
  llmUrl: string;
  systemPrompt: string;
  model?: string;
  maxMessages?: number;
  idleTtlMs?: number;
  now?: () => number;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface ChatStreamEvent {
  type: "token" | "done" | "error";
  text?: string;
  full?: string;
  isFinalPrompt?: boolean;
  message?: string;
}

interface Session {
  messages: ChatMessage[];
  lastAccess: number;
}

export interface ChatStreamResult {
  full: string;
  isFinalPrompt: boolean;
}

export interface ChatService {
  stream(
    sessionId: string,
    message: string,
    onEvent: (ev: ChatStreamEvent) => void,
  ): Promise<ChatStreamResult>;
  getSession(sessionId: string): { sessionId: string; messages: ChatMessage[] };
  gc(): void;
  _countSessions(): number;
}

export function createChatService(deps: ChatServiceDeps): ChatService {
  const maxMessages = deps.maxMessages ?? 40;
  const idleTtlMs = deps.idleTtlMs ?? 30 * 60 * 1000;
  const now = deps.now ?? (() => Date.now());
  const sessions = new Map<string, Session>();

  function getOrCreate(sessionId: string): Session {
    let session = sessions.get(sessionId);
    if (!session) {
      session = { messages: [], lastAccess: now() };
      sessions.set(sessionId, session);
    }
    session.lastAccess = now();
    return session;
  }

  function trim(session: Session): void {
    // cap: drop oldest PAIRS (user + assistant) while over the cap.
    while (session.messages.length > maxMessages) {
      session.messages.splice(0, 2);
    }
  }

  async function parseNdjson(
    res: Response,
    onToken: (text: string) => void,
  ): Promise<string> {
    const decoder = new TextDecoder();
    const reader = (res.body as ReadableStream<Uint8Array> | null)?.getReader();
    if (!reader) throw new Error("LLM returned no response body.");
    let buffer = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) {
            full += content;
            onToken(content);
          }
        } catch {
          // malformed NDJSON line — ignore (non-blocking).
        }
      }
    }
    return full;
  }

  return {
    async stream(sessionId, message, onEvent) {
      const session = getOrCreate(sessionId);
      session.messages.push({ role: "user", content: message });

      const body = JSON.stringify({
        model: deps.model ?? "default",
        stream: true,
        messages: [
          { role: "system", content: deps.systemPrompt },
          ...session.messages,
        ],
      });
      let res: Response;
      try {
        res = await deps.fetchFn(`${deps.llmUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onEvent({ type: "error", message: msg });
        throw err;
      }
      if (!res.ok) {
        const msg = `LLM answered ${res.status}.`;
        onEvent({ type: "error", message: msg });
        throw new Error(msg);
      }

      const full = await parseNdjson(res, (text) => onEvent({ type: "token", text }));
      const isFinalPrompt = detectFinalPrompt(full);

      session.messages.push({ role: "assistant", content: full, isFinalPrompt });
      session.lastAccess = now();
      trim(session);

      onEvent({ type: "done", full, isFinalPrompt });
      return { full, isFinalPrompt };
    },

    getSession(sessionId) {
      const session = sessions.get(sessionId);
      const messages = session
        ? session.messages.map((m) => ({ role: m.role, content: m.content }))
        : [];
      return { sessionId, messages };
    },

    gc() {
      const cutoff = now() - idleTtlMs;
      for (const [id, s] of sessions) {
        if (s.lastAccess < cutoff) sessions.delete(id);
      }
    },

    _countSessions() {
      return sessions.size;
    },
  };
}