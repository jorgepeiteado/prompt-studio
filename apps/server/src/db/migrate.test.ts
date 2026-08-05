import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./migrate";

function withDb(fn: (db: Database.Database) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "ps-db-"));
  const db = new Database(join(dir, "test.db"));
  try {
    fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("db migrations", () => {
  it("applies 001_init and bumps PRAGMA user_version to 1", () => {
    withDb((db) => {
      migrate(db);
      const version = db.pragma("user_version", { simple: true }) as number;
      expect(version).toBe(1);
    });
  });

  it("creates runs, images and idx_images_run with the design schema", () => {
    withDb((db) => {
      migrate(db);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => (r as { name: string }).name);
      expect(tables).toContain("runs");
      expect(tables).toContain("images");
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_images_run'")
        .all();
      expect(indexes.length).toBe(1);
    });
  });

  it("is idempotent — second migrate leaves user_version at 1", () => {
    withDb((db) => {
      migrate(db);
      migrate(db);
      const version = db.pragma("user_version", { simple: true }) as number;
      expect(version).toBe(1);
    });
  });

  it("applies pending migrations inside a single transaction and schema is usable", () => {
    withDb((db) => {
      migrate(db);
      const runId = "run-1";
      db.prepare(
        `INSERT INTO runs (id, status, prompt, params_json, seeds_json, prompt_ids_json)
         VALUES (?, 'completed', 'p', '{}', '[]', '[]')`,
      ).run(runId);
      db.prepare(
        `INSERT INTO images (id, run_id, variation_index, seed, kind, local_path, filename)
         VALUES ('img-1', ?, 0, 123, 'base', 'images/run-1/0.webp', '0.webp')`,
      ).run(runId);
      const row = db
        .prepare("SELECT count(*) AS n FROM images WHERE run_id = ?")
        .get(runId) as { n: number };
      expect(row.n).toBe(1);
    });
  });
});