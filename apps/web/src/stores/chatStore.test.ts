import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chatStore";

beforeEach(() => useChatStore.setState(useChatStore.getInitialState(), true));

describe("useChatStore (RED first)", () => {
  it("starts empty with no session and LLM not ready", () => {
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.streaming).toBe(false);
    expect(s.llmReady).toBe(false);
  });

  it("records llm readiness", () => {
    useChatStore.getState().setLlmReady(true);
    expect(useChatStore.getState().llmReady).toBe(true);
  });

  it("tracks a session id (sessionStorage-backed interview)", () => {
    useChatStore.getState().setSessionId("abc123");
    expect(useChatStore.getState().sessionId).toBe("abc123");
  });

  it("appends user and assistant messages in order", () => {
    const st = useChatStore.getState();
    st.appendUser("hola");
    st.appendAssistant("contame más");
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "hola" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "contame más" });
  });

  it("stores the final prompt when the assistant finishes", () => {
    useChatStore.getState().setFinalPrompt("A photorealistic portrait…");
    expect(useChatStore.getState().finalPrompt).toContain("photorealistic");
  });

  it("hydrates from a server session (refresh resume)", () => {
    useChatStore.getState().hydrate([
      { role: "user", content: "hola" },
      { role: "assistant", content: "contame más", isFinalPrompt: false },
    ]);
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(2);
    expect(s.finalPrompt).toBeNull(); // no final prompt yet in hydration
  });

  it("carries the final prompt into hydration when present", () => {
    useChatStore.getState().hydrate([
      { role: "user", content: "hola" },
      { role: "assistant", content: "The final…", isFinalPrompt: true },
    ]);
    expect(useChatStore.getState().finalPrompt).toBe("The final…");
  });

  it("tracks streaming state to show/cancel the typing indicator", () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().streaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it("appends streamed tokens to the in-progress assistant message", () => {
    const st = useChatStore.getState();
    st.appendUser("hola");
    st.appendAssistant("cont");
    useChatStore.getState().appendToken("inu");
    useChatStore.getState().appendToken("á");
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: "assistant", content: "continuá" });
  });

  it("creates an assistant message from the first token when none is open", () => {
    useChatStore.getState().appendToken("primer");
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "assistant", content: "primer" });
  });
});