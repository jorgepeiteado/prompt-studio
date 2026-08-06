/**
 * RunEventHub — per-run pub/sub that carries generation SSE frames from the
 * generation orchestrator to the SSE endpoint subscribers (design "Async
 * execution flow": one WS client relays progress/executed to SSE subscribers).
 * Pure in-memory; no timers, no IO — trivially unit-testable.
 */
import { describe, expect, it, vi } from "vitest";
import { createRunEventHub, type RunEventFrame } from "./run-events";

describe("RunEventHub", () => {
  it("delivers published frames to subscribers of the same runId", () => {
    const hub = createRunEventHub();
    const listener = vi.fn();
    hub.subscribe("run-1", listener);
    hub.publish("run-1", { type: "progress", runId: "run-1", variationIndex: 2, progress: 50 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: "progress",
      runId: "run-1",
      variationIndex: 2,
      progress: 50,
    } satisfies RunEventFrame);
  });

  it("does not deliver frames to subscribers of another run", () => {
    const hub = createRunEventHub();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    hub.subscribe("run-a", listenerA);
    hub.subscribe("run-b", listenerB);
    hub.publish("run-a", { type: "complete", runId: "run-a" });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const hub = createRunEventHub();
    const listener = vi.fn();
    const unsub = hub.subscribe("run-1", listener);
    unsub();
    hub.publish("run-1", { type: "image", runId: "run-1", variationIndex: 0, url: "/x.png" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers on the same run", () => {
    const hub = createRunEventHub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe("run-1", a);
    hub.subscribe("run-1", b);
    hub.publish("run-1", { type: "complete", runId: "run-1" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
