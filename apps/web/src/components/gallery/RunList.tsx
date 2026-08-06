import type { RunSummaryDto } from "@promptstudio/shared";
import { Link } from "react-router-dom";
import { Camera, Plus } from "lucide-react";
import { strings } from "../../lib/strings";
import { RunCardSkeleton, RunCard } from "./RunCard";

export interface RunListProps {
  runs: RunSummaryDto[];
  loading: boolean;
  error: string | null;
}

/**
 * Gallery list. Newest-first is guaranteed by the server (DESC order is a
 * server concern; design "RunList … newest first" renders the returned order).
 * Shows skeleton rows while loading and a first-run empty state when there are
 * no runs at all.
 */
export function RunList({ runs, loading, error }: RunListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <RunCardSkeleton />
        <RunCardSkeleton />
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="text-sm text-destructive">{error}</p>;
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
        <Camera className="h-8 w-8 text-accent" aria-hidden="true" />
        <div>
          <h2 className="font-display text-lg">{strings.gallery.emptyTitle}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{strings.gallery.emptyBody}</p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {strings.gallery.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => (
        <Link key={run.id} to={`/gallery/${run.id}`} className="block" aria-label={`${strings.gallery.openDetail} — ${run.prompt || run.id}`}>
          <RunCard run={run} />
        </Link>
      ))}
    </div>
  );
}