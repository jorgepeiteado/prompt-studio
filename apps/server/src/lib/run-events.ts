/**
 * RunEventHub — per-run pub/sub that carries generation SSE frames from the
 * generation orchestrator to the SSE endpoint subscribers (design "Async
 * execution flow": one WS client relays progress/executed to SSE subscribers).
 *
 * Pure in-memory; no timers, no IO — trivially unit-testable.
 */

export interface RunEventProgressFrame {
  type: "progress";
  runId: string;
  variationIndex: number;
  progress: number; // 0-100
}

export interface RunEventImageFrame {
  type: "image";
  runId: string;
  variationIndex: number;
  url: string;
}

export interface RunEventCompleteFrame {
  type: "complete";
  runId: string;
}

export interface RunEventFailedFrame {
  type: "failed";
  runId: string;
  message?: string;
}

export interface RunEventCancelledFrame {
  type: "cancelled";
  runId: string;
}

export type RunEventFrame =
  | RunEventProgressFrame
  | RunEventImageFrame
  | RunEventCompleteFrame
  | RunEventFailedFrame
  | RunEventCancelledFrame;

export type RunEventListener = (frame: RunEventFrame) => void;

export interface RunEventHub {
  subscribe(runId: string, listener: RunEventListener): () => void;
  publish(runId: string, frame: RunEventFrame): void;
  /** Number of listeners currently subscribed to a run (useful in tests). */
  listenerCount(runId: string): number;
}

export function createRunEventHub(): RunEventHub {
  const listenersByRun = new Map<string, Set<RunEventListener>>();

  return {
    subscribe(runId, listener) {
      let listeners = listenersByRun.get(runId);
      if (!listeners) {
        listeners = new Set();
        listenersByRun.set(runId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByRun.delete(runId);
        }
      };
    },

    publish(runId, frame) {
      const listeners = listenersByRun.get(runId);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        listener(frame);
      }
    },

    listenerCount(runId) {
      return listenersByRun.get(runId)?.size ?? 0;
    },
  };
}
