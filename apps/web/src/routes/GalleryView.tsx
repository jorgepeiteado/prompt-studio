import { useEffect } from "react";
import { api } from "../lib/api";
import { strings } from "../lib/strings";
import { useGalleryStore } from "../stores/galleryStore";
import { RunList } from "../components/gallery/RunList";

/**
 * Gallery list view — newest first is guaranteed by the server (DESC order).
 * Fetches on mount; the store keeps the list so navigating back is instant.
 */
export function GalleryView() {
  const runs = useGalleryStore((s) => s.runs);
  const loading = useGalleryStore((s) => s.loading);
  const error = useGalleryStore((s) => s.error);
  const setRuns = useGalleryStore((s) => s.setRuns);
  const setLoading = useGalleryStore((s) => s.setLoading);
  const setError = useGalleryStore((s) => s.setError);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await api.getHistory();
        if (!cancelled) {
          setRuns(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRuns, setLoading, setError]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-2xl">{strings.gallery.title}</h1>
      </header>
      <RunList runs={runs} loading={loading} error={error} />
    </div>
  );
}