/**
 * Thumbnail generation via sharp (design "Thumbnails"). Generates a ~320px
 * webp preview at data/images/<runId>/thumbs/<variationIndex>.webp at ingest
 * time. sharp is imported lazily so importing this module never loads the
 * native binding unless a thumbnail is actually generated.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Thumbnailer = (
  srcPath: string,
  runId: string,
  variationIndex: number,
) => Promise<string | null>;

/**
 * Creates a thumbnailer bound to a DATA_DIR. Returns the served relative path
 * (e.g. `images/<runId>/thumbs/<variationIndex>.webp`) or null when sharp
 * cannot process the source — generation must never fail on a thumbnail error.
 */
export function createThumbnailer(dataDir: string): Thumbnailer {
  return async (srcPath: string, runId: string, variationIndex: number) => {
    try {
      const sharp = (await import("sharp")).default;
      const rel = `images/${runId}/thumbs/${variationIndex}.webp`;
      const abs = join(dataDir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      const data = await sharp(srcPath)
        .resize({ width: 320, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      writeFileSync(abs, data);
      return rel;
    } catch {
      return null;
    }
  };
}