/**
 * History repository (history-gallery spec / design "SQLite schema &
 * storage"). Parameterized statements ONLY — run ids / filenames are never
 * interpolated into SQL. DB persists RELATIVE image paths (no binary bytes);
 * paths resolve against DATA_DIR at runtime. delete removes the DB rows AND
 * the run's disk folder (images + thumbs).
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface RunParams {
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  width?: number;
  height?: number;
  aspect?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface NewRun {
  id: string;
  status: RunStatus;
  prompt: string;
  negativePrompt: string | null;
  params: RunParams;
  seeds: number[];
  promptIds: string[];
  chat?: ChatMessage[];
  error?: string | null;
}

export interface NewImage {
  id: string;
  runId: string;
  variationIndex: number;
  seed: number;
  comfyuiPromptId?: string | null;
  kind: "base" | "hd";
  localPath: string;
  thumbnailPath?: string | null;
  filename: string;
  width?: number | null;
  height?: number | null;
}

export interface RunListItem {
  id: string;
  createdAt: string;
  status: RunStatus;
  prompt: string;
  params: RunParams;
  aspect: string | null;
  variations: number;
  thumbnail: string | null;
}

export interface RunDetail {
  id: string;
  createdAt: string;
  status: RunStatus;
  prompt: string;
  negativePrompt: string | null;
  params: RunParams;
  seeds: number[];
  promptIds: string[];
  chat: ChatMessage[];
  error: string | null;
  images: Array<{
    id: string;
    variationIndex: number;
    seed: number;
    kind: "base" | "hd";
    localPath: string;
    thumbnailPath: string | null;
    filename: string;
    width: number | null;
    height: number | null;
  }>;
}

export interface HistoryRepo {
  insertRun(run: NewRun): void;
  insertImage(image: NewImage): void;
  list(): RunListItem[];
  detailByRunId(runId: string): RunDetail | null;
  deleteByRunId(runId: string): boolean;
  updateStatus(runId: string, status: RunStatus, error?: string | null): void;
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function createHistoryRepo(db: Database.Database, dataDir: string): HistoryRepo {
  const insertRunStmt = db.prepare(
    `INSERT INTO runs (id, status, prompt, negative_prompt, params_json, seeds_json, prompt_ids_json, chat_json, error)
     VALUES (@id, @status, @prompt, @negativePrompt, @paramsJson, @seedsJson, @promptIdsJson, @chatJson, @error)`,
  );
  const insertImageStmt = db.prepare(
    `INSERT INTO images
       (id, run_id, variation_index, seed, comfyui_prompt_id, kind, local_path, thumbnail_path, filename, width, height)
     VALUES (@id, @runId, @variationIndex, @seed, @comfyuiPromptId, @kind, @localPath, @thumbnailPath, @filename, @width, @height)`,
  );
  const listRunsStmt = db.prepare(
    `SELECT r.id, r.created_at, r.status, r.prompt, r.params_json, r.seeds_json,
            r.negative_prompt, r.error,
            (SELECT img.thumbnail_path FROM images img
              WHERE img.run_id = r.id ORDER BY img.variation_index LIMIT 1) AS thumbnail
     FROM runs r
     ORDER BY r.created_at DESC, r.id DESC`,
  );
  const detailRunStmt = db.prepare(
    `SELECT id, created_at, status, prompt, negative_prompt, params_json, seeds_json, prompt_ids_json, chat_json, error
     FROM runs WHERE id = ?`,
  );
  const imagesStmt = db.prepare(
    `SELECT id, variation_index, seed, kind, local_path, thumbnail_path, filename, width, height
     FROM images WHERE run_id = ? ORDER BY variation_index`,
  );
  const deleteRunStmt = db.prepare(`DELETE FROM runs WHERE id = ?`);
  const updateStatusStmt = db.prepare(
    `UPDATE runs SET status = @status, error = @error WHERE id = @id`,
  );

  function imageRowToDto(img: Record<string, unknown>) {
    return {
      id: String(img.id),
      variationIndex: Number(img.variation_index),
      seed: Number(img.seed),
      kind: String(img.kind) as "base" | "hd",
      localPath: String(img.local_path),
      thumbnailPath: img.thumbnail_path ? String(img.thumbnail_path) : null,
      filename: String(img.filename),
      width: img.width == null ? null : Number(img.width),
      height: img.height == null ? null : Number(img.height),
    };
  }

  return {
    insertRun(run) {
      insertRunStmt.run({
        id: run.id,
        status: run.status,
        prompt: run.prompt,
        negativePrompt: run.negativePrompt,
        paramsJson: JSON.stringify(run.params),
        seedsJson: JSON.stringify(run.seeds),
        promptIdsJson: JSON.stringify(run.promptIds),
        chatJson: JSON.stringify(run.chat ?? []),
        error: run.error ?? null,
      });
    },

    insertImage(image) {
      insertImageStmt.run({
        id: image.id,
        runId: image.runId,
        variationIndex: image.variationIndex,
        seed: image.seed,
        comfyuiPromptId: image.comfyuiPromptId,
        kind: image.kind,
        localPath: image.localPath,
        thumbnailPath: image.thumbnailPath ?? null,
        filename: image.filename,
        width: image.width ?? null,
        height: image.height ?? null,
      });
    },

    list() {
      const rows = listRunsStmt.all() as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const params = safeJson<RunParams>(String(row.params_json ?? ""), {});
        return {
          id: String(row.id),
          createdAt: String(row.created_at),
          status: String(row.status) as RunStatus,
          prompt: String(row.prompt),
          params,
          aspect: params.aspect ?? null,
          variations: safeJson<number[]>(String(row.seeds_json ?? "[]"), []).length,
          thumbnail: row.thumbnail ? String(row.thumbnail) : null,
        };
      });
    },

    detailByRunId(runId) {
      const run = detailRunStmt.get(runId) as Record<string, unknown> | undefined;
      if (!run) return null;
      const images = (imagesStmt.all(runId) as Array<Record<string, unknown>>).map(imageRowToDto);
      return {
        id: String(run.id),
        createdAt: String(run.created_at),
        status: String(run.status) as RunStatus,
        prompt: String(run.prompt),
        negativePrompt: run.negative_prompt ? String(run.negative_prompt) : null,
        params: safeJson<RunParams>(String(run.params_json), {}),
        seeds: safeJson<number[]>(String(run.seeds_json), []),
        promptIds: safeJson<string[]>(String(run.prompt_ids_json), []),
        chat: safeJson<ChatMessage[]>(String(run.chat_json), []),
        error: run.error ? String(run.error) : null,
        images,
      };
    },

    deleteByRunId(runId) {
      const images = imagesStmt.all(runId) as Array<Record<string, unknown>>;
      const result = deleteRunStmt.run(runId);
      if (images.length > 0) {
        const folder = join(dataDir, "images", runId);
        if (existsSync(folder)) rmSync(folder, { recursive: true, force: true });
      }
      return result.changes > 0;
    },

    updateStatus(runId, status, error = null) {
      updateStatusStmt.run({ id: runId, status, error });
    },
  };
}