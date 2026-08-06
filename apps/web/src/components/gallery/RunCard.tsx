import type { RunSummaryDto } from "@promptstudio/shared";
import { Images, Plus } from "lucide-react";
import { strings } from "../../lib/strings";
import { Skeleton } from "../ui/skeleton";

export interface RunCardProps {
  run: RunSummaryDto;
}

const STATUS_TEXT: Record<string, string> = {
  pending: strings.statusBadge.pending,
  running: strings.statusBadge.running,
  completed: strings.statusBadge.completed,
  failed: strings.statusBadge.failed,
  cancelled: strings.statusBadge.cancelled,
};

/**
 * Gallery list card (design "RunCard — chronological, thumbnail, prompt
 * excerpt, status, empty-state"). Thumbnail lazy-loads via HTML `loading`.
 */
export function RunCard({ run }: RunCardProps) {
  const isRunning = run.status === "running" || run.status === "pending";
  return (
    <article className="group relative flex gap-4 rounded-lg border border-border bg-surface p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/20">
        {run.thumbnail ? (
          <img
            src={run.thumbnail}
            alt={run.prompt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <Images className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <p className="truncate text-sm font-medium">{run.prompt || "—"}</p>
        <p className="text-xs text-muted-foreground">
          {run.aspect ? `${run.aspect} · ` : ""}
          {strings.gallery.params}: {run.variations}
        </p>
        <p className="flex items-center gap-1.5 text-xs">
          <span className="font-mono">{STATUS_TEXT[run.status] ?? run.status}</span>
          {isRunning && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
        </p>
      </div>
      {isRunning && (
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          <Plus className="h-3 w-3" aria-hidden="true" />
          {strings.gallery.newRun}
        </span>
      )}
    </article>
  );
}

/** Skeleton rows while the list loads. */
export function RunCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-lg border border-border bg-surface p-3">
      <Skeleton className="h-16 w-16" />
      <div className="flex flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}