import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { ImageRow, RunDetailDto } from "@promptstudio/shared";
import { api } from "../lib/api";
import { strings } from "../lib/strings";
import { useGalleryStore } from "../stores/galleryStore";
import { ImageViewer } from "../components/gallery/ImageViewer";
import { CompareView } from "../components/gallery/CompareView";
import { ChatReplay } from "../components/gallery/ChatReplay";
import { RegenerateButton } from "../components/gallery/RegenerateButton";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

/** Image row plus the served URL (mirrors the SSE image frame contract). */
function imageUrl(runId: string, img: ImageRow): string {
  return `/api/history/${runId}/images/${img.filename}`;
}

/**
 * Run detail (design "ImageViewer full-res only; CompareView; ChatReplay;
 * RegenerateButton 'mantener semilla'; Delete"). Regenerate POSTs
 * /api/regenerate and navigates to the review of the NEW run; the original is
 * never mutated. Delete confirms, removes the run + files, returns to gallery.
 */
export function RunDetailView() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const removeRun = useGalleryStore((s) => s.removeRun);
  const [detail, setDetail] = useState<RunDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getRunDetail(runId);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRegenerate = useCallback(
    async (keepSeed: boolean) => {
      if (!runId) return;
      const result = await api.postRegenerate({ fromRunId: runId, keepSeed });
      navigate(`/review?from=${result.runId}`);
    },
    [runId, navigate],
  );

  const handleDelete = useCallback(async () => {
    if (!runId) return;
    setDeleting(true);
    try {
      await api.deleteRun(runId);
      removeRun(runId);
      navigate("/gallery");
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [runId, navigate, removeRun]);

  const compareImages = useMemo(() => {
    if (!detail) return [];
    return detail.images.filter((img) => compareIds.has(img.id));
  }, [detail, compareIds]);

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/gallery" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {strings.detail.back}
        </Link>
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return <div role="status" className="py-10 text-center text-sm text-muted-foreground">…</div>;
  }

  const params = detail.params;
  const base = detail.images.filter((i) => i.kind === "base");
  const hd = detail.images.filter((i) => i.kind === "hd");
  const showHd = hd.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/gallery" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {strings.detail.back}
        </Link>
        <div className="flex items-center gap-2">
          {!confirmDelete ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {strings.detail.delete}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                {strings.detail.cancel}
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? strings.detail.deleting : strings.detail.confirmDelete}
              </Button>
            </>
          )}
        </div>
      </div>

      <header>
        <h1 className="font-display text-2xl">{strings.detail.images}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{strings.gallery.statusPrefix}: {detail.status}</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {base.map((img) => (
            <ImageViewer key={img.id} image={img} url={imageUrl(detail.id, img)} prompt={detail.prompt} />
          ))}
          {showHd &&
            hd.map((img) => (
              <ImageViewer key={img.id} image={img} url={imageUrl(detail.id, img)} prompt={detail.prompt} />
            ))}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{strings.detail.prompt}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{detail.prompt}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.detail.params}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 font-mono text-xs">
                <dt className="text-muted-foreground">{strings.detail.seed}</dt>
                <dd className="text-right">{params.seed}</dd>
                <dt className="text-muted-foreground">{strings.options.steps}</dt>
                <dd className="text-right">{params.steps}</dd>
                <dt className="text-muted-foreground">{strings.options.cfg}</dt>
                <dd className="text-right">{params.cfg}</dd>
                <dt className="text-muted-foreground">{strings.review.resolution}</dt>
                <dd className="text-right">
                  {params.width}×{params.height}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{strings.detail.chatReplay}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChatReplay chat={detail.chat} />
            </CardContent>
          </Card>

          <RegenerateButton onRegenerate={handleRegenerate} />

          {detail.images.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>{strings.detail.compare}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{strings.detail.compareHint}</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.images.map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      aria-pressed={compareIds.has(img.id)}
                      onClick={() => toggleCompare(img.id)}
                      className={cn(
                        "inline-flex min-h-[44px] items-center rounded-md border px-2.5 text-xs transition-colors",
                        compareIds.has(img.id)
                          ? "border-accent bg-accent/10 font-medium text-accent"
                          : "border-border bg-surface",
                      )}
                    >
                      {img.variationIndex + 1} · {img.kind}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {compareImages.length >= 2 && (
            <CompareView images={compareImages} urlFor={(img) => imageUrl(detail.id, img)} prompt={detail.prompt} />
          )}
        </aside>
      </section>
    </div>
  );
}