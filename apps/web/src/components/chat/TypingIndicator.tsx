/**
 * Typing indicator for the interview assistant (`role="status"`). The dot
 * animation is gated by `@media (prefers-reduced-motion: reduce)` in
 * globals.css (design "typing dots @media prefers-reduced-motion").
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="El asistente está escribiendo"
      className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-3"
    >
      <span className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  );
}