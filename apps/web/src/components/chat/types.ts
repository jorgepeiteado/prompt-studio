/** Shared chat types (kept local — the server DTOs are server-flavored). */
export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  isFinalPrompt?: boolean;
}