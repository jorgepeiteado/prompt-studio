import type { ImageRow } from "@promptstudio/shared";
import { strings } from "../../lib/strings";

export interface CompareViewProps {
  images: ImageRow[];
  urlFor: (image: ImageRow) => string;
  prompt: string;
}

/**
 * Compare two or more selected images side by side (design "CompareView
 * (2+ images side-by-side with metadata)"). Renders the full image set; each
 * tile carries a mono figcaption so the crop/seed/kind reads in tandem.
 */
export function CompareView({ images, urlFor, prompt }: CompareViewProps) {
  if (images.length < 2) return null;
  return (
    <section aria-label={strings.detail.compare}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        {strings.detail.compare}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {images.map((img) => (
          <figure key={img.id} className="flex flex-col gap-1">
            <img
              src={urlFor(img)}
              alt={`${prompt} — semilla ${img.seed}`}
              className="h-48 w-full rounded-md border border-border object-cover"
            />
            <figcaption className="font-mono text-xs text-muted-foreground">
              semilla {img.seed} · {img.kind}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}