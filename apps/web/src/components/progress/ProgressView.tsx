import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { strings } from "../../lib/strings";
import {
  applyProgressEvent,
  countDone,
  emptyProgress,
  type ProgressMap,
} from "../../lib/progress";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export interface ProgressViewProps {
  runId: string;
  total: number;
  prompt: string;
  onCancel: () => void;
  onOpenGallery: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  queued: strings.progress.queued,
  started: strings.progress.started,
  progress: strings.progress.progress,
  complete: strings.progress.complete,
  failed: strings.progress.failed,
  cancelled: strings.progress.cancelled,
};

/**
 * Per-variation SSE progress bars (throttled ≈1–4/s via 5-step rounding).
 * Keeps "lo que pedí" (the submitted prompt) visible while bars fill; Cancel →
 * DELETE /api/generate/:runId (design requirements). Completion shows a link to
 * the gallery.
 */
export function ProgressView({ runId, total, prompt, onCancel, onOpenGallery }: ProgressViewProps) {
  const [map, setMap] = useState<ProgressMap>(() => emptyProgress(total));
  const [cancelling, setCancelling] = useState(false);
  // Dedupe throttled progress frames (per-variation last applied step).
  const lastStep = useRef<Record<number, number>>({});

  useEffect(() => {
    const unsubscribe = api.subscribeProgress(runId, (ev) => {
      if (ev.type === "progress") {
        const idx = ev.variationIndex ?? 0;
        const rounded = Math.floor((ev.progress ?? 0) / 5) * 5;
        if (lastStep.current[idx] === rounded) return; // already shown this step
        lastStep.current[idx] = rounded;
        setMap((m) => applyProgressEvent(m, { ...ev, progress: rounded }));
        return;
      }
      setMap((m) => applyProgressEvent(m, ev));
    });
    return unsubscribe;
  }, [runId, total]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelGenerate(runId);
    } finally {
      setCancelling(false);
      onCancel();
    }
  }

  const done = countDone(map);
  const finished = done === total;

  return (
    <section aria-label={strings.progress.title} className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-xl">{strings.progress.title}</h2>
        <span className="font-mono text-sm text-muted-foreground" role="status" aria-live="polite">
          {strings.progress.total.replace("{actual}", String(done)).replace("{total}", String(total))}
        </span>
      </header>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {strings.progress.promptLabel}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{prompt}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b)
          .map((idx) => {
            const v = map[idx] ?? { status: "queued", progress: 0 };
            const filled = v.status === "complete" ? 100 : v.progress;
            return (
              <li key={idx} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {strings.progress.variation} {idx + 1}
                  </span>
                  <span className="font-mono text-muted-foreground">{STATUS_LABEL[v.status] ?? v.status}</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={filled}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${strings.progress.variation} ${idx + 1}`}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted/30"
                >
                  <div
                    className={cn("h-full rounded-full bg-accent transition-[width]", v.status === "failed" && "bg-destructive", v.status === "cancelled" && "bg-muted")}
                    style={{ width: `${filled}%` }}
                  />
                </div>
              </li>
            );
          })}
      </ol>

      <footer className="flex items-center gap-2">
        {finished ? (
          <Button onClick={onOpenGallery}>{strings.progress.open}</Button>
        ) : (
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? strings.progress.cancelling : strings.progress.cancel}
          </Button>
        )}
      </footer>
    </section>
  );
}