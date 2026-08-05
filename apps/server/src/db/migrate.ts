/**
 * Numbered-file migrations with PRAGMA user_version, applied in ONE
 * transaction on boot (design: "Migrations — numbered SQL files +
 * PRAGMA user_version"). Additive only: each new migration is a new
 * numbered file; migrate() applies only pending files.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";

export const MIGRATIONS_DIR = join(__dirname, "migrations");

export interface MigrationFile {
  version: number;
  filename: string;
  sql: string;
}

export function listMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .map((filename) => ({
      version: Number(filename.split("_")[0]),
      filename,
      sql: readFileSync(join(dir, filename), "utf8"),
    }))
    .sort((a, b) => a.version - b.version);
}

export function migrate(db: Database.Database, dir: string = MIGRATIONS_DIR): number {
  const current = db.pragma("user_version", { simple: true }) as number;
  const pending = listMigrations(dir).filter((m) => m.version > current);
  if (pending.length === 0) return current;

  db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    }
  })();

  return db.pragma("user_version", { simple: true }) as number;
}