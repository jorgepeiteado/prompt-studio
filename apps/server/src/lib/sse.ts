/**
 * SSE framing helpers (comfyui-integration spec "Progress Streaming").
 *
 * encodeSse produces a single Server-Sent Event frame; parseSseStream is the
 * inverse used by tests and by consumers that buffer raw SSE text. The wire
 * format is the standard `event:`/`data:` block terminated by a blank line.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Parses a buffer of concatenated SSE frames back into structured events. */
export function parseSseStream(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (!eventLine || !dataLine) continue;
    try {
      events.push({
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)) as unknown,
      });
    } catch {
      // Incomplete/blank JSON — skip (trailing partial frame).
    }
  }
  return events;
}

/** Standard headers for an SSE HTTP response. */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
