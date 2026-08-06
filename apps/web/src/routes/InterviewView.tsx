import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { api } from "../lib/api";
import { strings } from "../lib/strings";
import { useChatStore } from "../stores/chatStore";
import { useRunStore } from "../stores/runStore";
import { MessageList } from "../components/chat/MessageList";
import { ChatInput } from "../components/chat/ChatInput";
import { QuickReplyChips } from "../components/chat/QuickReplyChips";
import { Button } from "../components/ui/button";

const SESSION_KEY = "prompt-studio-session";

/**
 * Interview view (design "Chat resilience": sessionId in sessionStorage,
 * hydrate from GET /api/llm/chat/:sessionId, refresh rejoin). Streams the LLM
 * chat; when the assistant emits `isFinalPrompt` the final prompt lands in the
 * run store and the view navigates to `/review`.
 */
export function InterviewView() {
  const navigate = useNavigate();
  const chat = useChatStore();
  const setRunPrompt = useRunStore((s) => s.setPrompt);
  const abortRef = useRef<AbortController | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Session resume + LLM readiness on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = window.sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        chat.setSessionId(stored);
        try {
          const session = await api.getChatSession(stored);
          if (!cancelled) {
            chat.hydrate(session.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content, isFinalPrompt: m.isFinalPrompt })));
            const final = session.messages.find((m) => m.isFinalPrompt);
            if (final) setRunPrompt(final.content);
          }
        } catch {
          /* session expired server-side — start fresh */
        }
      }
      try {
        const status = await api.getLlmStatus();
        if (!cancelled) chat.setLlmReady(status.ready);
      } catch {
        if (!cancelled) chat.setLlmReady(false);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
cancelled = true;
      };
  }, []);

  const send = useCallback(
    async (message: string) => {
      if (message.trim().length === 0) return;
      const sessionId = chat.sessionId ?? `s-${Date.now()}`;
      if (!chat.sessionId) {
        chat.setSessionId(sessionId);
        window.sessionStorage.setItem(SESSION_KEY, sessionId);
      }
      chat.appendUser(message);
      chat.setStreaming(true);
      abortRef.current = new AbortController();
      try {
        await api.streamChat(sessionId, message, {
          signal: abortRef.current.signal,
          onToken: (text) => chat.appendToken(text),
          onDone: async (full, isFinalPrompt) => {
            chat.appendAssistant(full, isFinalPrompt);
            if (isFinalPrompt) {
              setRunPrompt(full);
              navigate("/review");
            }
          },
          onError: () => {
            chat.appendAssistant("⚠ " + strings.errors.generic);
          },
        });
      } finally {
        chat.setStreaming(false);
        abortRef.current = null;
      }
    },
    [chat, navigate, setRunPrompt],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    chat.setStreaming(false);
  }, [chat]);

  const sendChip = useCallback(
    (value: string) => {
      void send(value);
    },
    [send],
  );

  const goToReview = useCallback(() => {
    if (chat.finalPrompt) setRunPrompt(chat.finalPrompt);
    navigate("/review");
  }, [chat.finalPrompt, navigate, setRunPrompt]);

  if (!hydrated) {
    return <div role="status" className="py-10 text-center text-sm text-muted-foreground">…</div>;
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{strings.chat.title}</h1>
          <p className="text-sm text-muted-foreground">{strings.chat.subtitle}</p>
        </div>
        {chat.finalPrompt && (
          <Button variant="outline" onClick={goToReview}>
            {strings.chat.finalPromptLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-background/60 p-4">
        <MessageList
          messages={
            chat.messages.length === 0
              ? [{ role: "assistant", content: strings.chat.welcome }]
              : chat.messages
          }
          typing={chat.streaming}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <QuickReplyChips
          label={strings.chips.label}
          options={[
            ...strings.chips.axes.subject.options,
            ...strings.chips.axes.clothing.options,
            ...strings.chips.axes.lighting.options,
            ...strings.chips.axes.style.options,
          ]}
          onSelect={sendChip}
          disabled={!chat.llmReady || chat.streaming}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {strings.chat.englishHint}
        </p>
        <ChatInput
          onSend={(v) => void send(v)}
          onStop={stop}
          disabled={!chat.llmReady}
          streaming={chat.streaming}
          placeholder={strings.chat.placeholder}
        />
      </div>
    </div>
  );
}