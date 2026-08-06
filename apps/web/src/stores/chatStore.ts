import { create } from "zustand";

export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  isFinalPrompt?: boolean;
}

interface ChatState {
  sessionId: string | null;
  messages: ChatMessageView[];
  streaming: boolean;
  llmReady: boolean;
  finalPrompt: string | null;
  setSessionId: (id: string) => void;
  setLlmReady: (ready: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  appendUser: (content: string) => void;
  appendAssistant: (content: string, isFinalPrompt?: boolean) => void;
  /** Appends a streamed token to the in-progress assistant message. */
  appendToken: (content: string) => void;
  setFinalPrompt: (prompt: string | null) => void;
  hydrate: (messages: ChatMessageView[]) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  messages: [] as ChatMessageView[],
  streaming: false,
  llmReady: false,
  finalPrompt: null,
};

export const useChatStore = create<ChatState>()((set) => ({
  ...initialState,
  setSessionId: (sessionId) => set({ sessionId }),
  setLlmReady: (llmReady) => set({ llmReady }),
  setStreaming: (streaming) => set({ streaming }),
  appendUser: (content) =>
    set((s) => ({ messages: [...s.messages, { role: "user", content }] })),
  appendAssistant: (content, isFinalPrompt = false) =>
    set((s) => ({
      messages: [...s.messages, { role: "assistant", content, isFinalPrompt }],
      ...(isFinalPrompt ? { finalPrompt: content } : {}),
    })),
  appendToken: (content) =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        messages[messages.length - 1] = { ...last, content: last.content + content };
      } else {
        messages.push({ role: "assistant", content });
      }
      return { messages };
    }),
  setFinalPrompt: (finalPrompt) => set({ finalPrompt }),
  hydrate: (messages) =>
    set(() => {
      const final = messages.find((m) => m.isFinalPrompt);
      return { messages, finalPrompt: final?.content ?? null };
    }),
  reset: () => set(initialState),
}));