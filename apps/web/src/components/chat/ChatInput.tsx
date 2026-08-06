import { useState, type KeyboardEvent } from "react";
import { strings } from "../../lib/strings";

export interface ChatInputProps {
  onSend: (value: string) => void;
  onStop: () => void;
  disabled: boolean;
  streaming: boolean;
  placeholder: string;
}

/**
 * Interview composer. Disabled until the LLM is ready (design "disabled until
 * LLM ready"); while streaming the send button becomes a "stop" control that
 * cancels the upstream request. Empty input blocks submit.
 */
export function ChatInput({ onSend, onStop, disabled, streaming, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");
  const canSend = !disabled && !streaming && value.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border p-3">
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-destructive bg-surface px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          ▣ {strings.chat.stop}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={2}
            className="flex min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {strings.chat.send}
          </button>
        </form>
      )}
    </div>
  );
}