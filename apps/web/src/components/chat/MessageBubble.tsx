import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import type { ChatMessageView } from "./types";

export interface MessageBubbleProps {
  message: ChatMessageView;
}

/**
 * A single chat turn. Memoized so streaming updates to later bubbles never
 * re-render earlier ones (design "MessageBubble(React.memo)").
 */
export const MessageBubble = memo(function MessageBubble({
  message,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-accent text-accent-foreground"
            : "border border-border bg-surface text-foreground",
        )}
      >
        {message.content}
      </div>
    </motion.div>
  );
});