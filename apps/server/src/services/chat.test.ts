import { describe, expect, it, vi } from "vitest";
import { createChatService, type ChatStreamEvent } from "./chat";
import type { ChatServiceDeps } from "./chat";

function ndjsonResponse(lines: string[]): Response {
  return new Response(lines.map((l) => l + "\n").join(""), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function buildDeps(over: Partial<ChatServiceDeps> = {}): ChatServiceDeps {
  return {
    llmUrl: "http://127.0.0.1:8080",
    systemPrompt: "You are the director.",
    model: "qwen3-4b",
    maxMessages: 40,
    idleTtlMs: 30 * 60 * 1000,
    now: () => 0,
    fetchFn: vi.fn(async () => ndjsonResponse([])),
    ...over,
  };
}

describe("chat streaming (llm-runtime / interview-assistant)", () => {
  it("streams NDJSON deltas as SSE token frames then a done frame with full text", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as string;
      void body;
      return ndjsonResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hola" } }] }),
        JSON.stringify({ choices: [{ delta: { content: " mundo" } }] }),
        JSON.stringify({ choices: [{ delta: {} }] }),
      ]);
    });
    const deps = buildDeps({ fetchFn });
    const chat = createChatService(deps);
    const events: ChatStreamEvent[] = [];
    const result = await chat.stream("s1", "hola", (ev) => events.push(ev));
    expect(events.filter((e) => e.type === "token")).toEqual([
      { type: "token", text: "Hola" },
      { type: "token", text: " mundo" },
    ]);
    expect(result.full).toBe("Hola mundo");
    expect(events.at(-1)).toMatchObject({ type: "done", full: "Hola mundo" });
    // multi-turn: request body includes system + previous turns
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content: string }> };
    expect(sent.messages[0]).toMatchObject({ role: "system", content: deps.systemPrompt });
    expect(sent.messages[1]).toMatchObject({ role: "user", content: "hola" });
  });

  it("detects the final prompt via isFinalPrompt on the done frame", async () => {
    const longEnglish = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const fetchFn = vi.fn(async () =>
      ndjsonResponse([JSON.stringify({ choices: [{ delta: { content: longEnglish } }] })]),
    );
    const chat = createChatService(buildDeps({ fetchFn }));
    const events: ChatStreamEvent[] = [];
    const result = await chat.stream("s2", "usá este", (ev) => events.push(ev));
    expect(result.isFinalPrompt).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", isFinalPrompt: true });
  });

  it("keeps server-side history per session and returns it for restore", async () => {
    const fetchFn = vi.fn(async () => ndjsonResponse([JSON.stringify({ choices: [{ delta: { content: "ok" } }] })]));
    const chat = createChatService(buildDeps({ fetchFn }));
    await chat.stream("s3", "primer mensaje", () => {});
    const session = chat.getSession("s3");
    expect(session.messages).toEqual([
      { role: "user", content: "primer mensaje" },
      { role: "assistant", content: "ok" },
    ]);
    // unknown session → empty list
    expect(chat.getSession("nope").messages).toEqual([]);
  });

  it("caps the session at maxMessages dropping oldest pairs", async () => {
    const fetchFn = vi.fn(async () => ndjsonResponse([JSON.stringify({ choices: [{ delta: { content: "r" } }] })]));
    const chat = createChatService(buildDeps({ fetchFn, maxMessages: 4 }));
    for (let i = 0; i < 5; i++) {
      await chat.stream("s4", `m${i}`, () => {});
    }
    const { messages } = chat.getSession("s4");
    expect(messages.length).toBeLessThanOrEqual(4);
    // oldest pair dropped, newest user message present
    expect(messages.some((m) => m.content === "m0")).toBe(false);
    expect(messages.some((m) => m.content === "m4")).toBe(true);
  });

  it("GCs idle sessions after the TTL", async () => {
    let nowMs = 0;
    const fetchFn = vi.fn(async () => ndjsonResponse([JSON.stringify({ choices: [{ delta: { content: "x" } }] })]));
    const chat = createChatService(buildDeps({ fetchFn, now: () => nowMs, idleTtlMs: 60000 }));
    await chat.stream("s5", "hi", () => {});
    expect(chat.getSession("s5").messages.length).toBe(2);
    nowMs = 61_000;
    chat.gc();
    expect(chat.getSession("s5").messages).toEqual([]);
  });

  it("relays an upstream error as an error event", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("llama down");
    });
    const chat = createChatService(buildDeps({ fetchFn }));
    const events: ChatStreamEvent[] = [];
    await expect(chat.stream("s6", "hi", (ev) => events.push(ev))).rejects.toThrow("llama down");
  });
});