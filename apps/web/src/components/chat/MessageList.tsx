import { motion } from "framer-motion";
import type { ChatMessageView } from "./types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

export interface MessageListProps {
  messages: ChatMessageView[];
  typing: boolean;
  renderFinalPrompt?: (content: string) => React.ReactNode;
}

/**
 * The chat log. `role="log"` + buffered `aria-live="polite"` announce turns
 * without interrupting (design requirements). Auto-scrolls to the newest turn.
 */
export function MessageList({ messages, typing, renderFinalPrompt }: MessageListProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      className="flex flex-col gap-3 overflow-y-auto px-1 pb-2"
    >
      {messages.map((m, i) =>
        m.isFinalPrompt && renderFinalPrompt ? (
          <div key={i}>{renderFinalPrompt(m.content)}</div>
        ) : (
          <MessageBubble key={i} message={m} />
        ),
      )}
      {typing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-start"
        >
          <TypingIndicator />
        </motion.div>
      )}
    </div>
  );
}