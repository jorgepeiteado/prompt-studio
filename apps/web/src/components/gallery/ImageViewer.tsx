import type { ImageRow } from "@promptstudio/shared";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export interface ImageViewerProps {
  image: ImageRow;
  url: string;
  prompt: string;
}

/**
 * Focused full-resolution viewer (design "full-res only here; alt from prompt
 * summary + mono camera-info figcaption"). Full-res (up to 4096px HD) loads
 * only in this view, never in the list.
 */
export function ImageViewer({ image, url, prompt }: ImageViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const meta = `${image.width ?? "?"}×${image.height ?? "?"} · semilla ${image.seed} · ${image.kind}`;
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <img
          src={url}
          alt={`${prompt} — ${meta}`}
          onLoad={() => setLoaded(true)}
          className="block max-h-[70dvh] w-full object-contain"
        />
      </div>
      <figcaption className="font-mono text-xs text-muted-foreground">{meta}</figcaption>
    </figure>
  );
}