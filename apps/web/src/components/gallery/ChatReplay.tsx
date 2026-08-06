import type { ChatMessage } from "@promptstudio/shared";
import { strings } from "../../lib/strings";

export interface ChatReplayProps {
  chat: ChatMessage[];
}

/**
 * Interview replay for a run (design "ChatReplay (chat_json)"). Renders the
 * persisted conversation exactly as it happened, user right / assistant left.
 */
export function ChatReplay({ chat }: ChatReplayProps) {
  if (!chat || chat.length === 0) {
    return <p className="text-sm text-muted-foreground">{strings.detail.noChat}</p>;
  }
  return (
    <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
      {chat.map((m, i) => (
        <div
          key={i}
          className={
            m.role === "user"
              ? "self-end rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
              : "self-start rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          }
        >
          {m.content}
        </div>
      ))}
    </div>
  );
}