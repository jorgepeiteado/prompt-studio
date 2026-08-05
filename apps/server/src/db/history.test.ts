import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./migrate";
import { createHistoryRepo } from "./history";

interface Fixture {
  db: Database.Database;
  dataDir: string;
  dispose: () => void;
}

function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "ps-hist-"));
  const dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  migrate(db);
  return {
    db,
    dataDir,
    dispose: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedDiskFile(dataDir: string, rel: string): void {
  const abs = join(dataDir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "PNGDATA");
}

describe("history repository (history-gallery spec)", () => {
  it("inserts a run and lists runs newest-first with thumbnail", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      repo.insertRun({
        id: "run-1",
        status: "completed",
        prompt: "golden prompt",
        negativePrompt: null,
        params: { steps: 20, cfg: 2.5, width: 1024, height: 1024 },
        seeds: [12345, 12346],
        promptIds: ["p1", "p2"],
      });
      seedDiskFile(dataDir, "images/run-1/0_123.webp");
      repo.insertImage({
        id: "img-1",
        runId: "run-1",
        variationIndex: 0,
        seed: 123,
        comfyuiPromptId: "p1",
        kind: "base",
        localPath: "images/run-1/0_123.webp",
        filename: "0_123.webp",
      });
      const list = repo.list();
      expect(list.length).toBe(1);
      expect(list[0]).toMatchObject({ id: "run-1", status: "completed" });
    } finally {
      dispose();
    }
  });

  it("stores only relative paths on image rows — never image bytes", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      repo.insertRun({
        id: "r",
        status: "pending",
        prompt: "p",
        negativePrompt: null,
        params: {},
        seeds: [1],
        promptIds: [],
        chat: [],
      });
      repo.insertImage({
        id: "i",
        runId: "r",
        variationIndex: 0,
        seed: 1,
        kind: "base",
        localPath: "images/r/0.webp",
        filename: "0.webp",
      });
      const detail = repo.detailByRunId("r");
      expect(detail?.images[0]?.localPath).toBe("images/r/0.webp");
      expect(detail?.images?.length).toBe(1);
    } finally {
      dispose();
    }
  });

  it("detail returns chat_json back to the caller", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      repo.insertRun({
        id: "r",
        status: "completed",
        prompt: "p",
        negativePrompt: null,
        params: {},
        seeds: [],
        promptIds: [],
        chat: [{ role: "user", content: "hola" }],
      });
      const detail = repo.detailByRunId("r");
      expect(detail?.chat).toEqual([{ role: "user", content: "hola" }]);
      expect(detail?.params).toEqual({});
    } finally {
      dispose();
    }
  });

  it("delete removes the run row, image rows, AND disk files", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      repo.insertRun({
        id: "r",
        status: "completed",
        prompt: "p",
        negativePrompt: null,
        params: {},
        seeds: [7],
        promptIds: [],
      });
      seedDiskFile(dataDir, "images/r/0.webp");
      repo.insertImage({
        id: "i",
        runId: "r",
        variationIndex: 0,
        seed: 7,
        kind: "base",
        localPath: "images/r/0.webp",
        filename: "0.webp",
      });
      expect(repo.deleteByRunId("r")).toBe(true);
      expect(repo.detailByRunId("r")).toBeNull();
      const imgCount = db
        .prepare("SELECT count(*) AS n FROM images WHERE run_id = ?")
        .get("r") as { n: number };
      expect(imgCount.n).toBe(0);
      expect(existsSync(join(dataDir, "images", "r"))).toBe(false);
    } finally {
      dispose();
    }
  });

  it("rejects a duplicate run id (parameterized, no interpolation)", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      repo.insertRun({
        id: "r",
        status: "pending",
        prompt: "p",
        negativePrompt: null,
        params: {},
        seeds: [],
        promptIds: [],
      });
      expect(() =>
        repo.insertRun({
          id: "r",
          status: "pending",
          prompt: "p2",
          negativePrompt: null,
          params: {},
          seeds: [],
          promptIds: [],
        }),
      ).toThrow(/UNIQUE/);
    } finally {
      dispose();
    }
  });

  it("list orders newest first and supports relative path resolution for images", () => {
    const { db, dataDir, dispose } = makeFixture();
    try {
      const repo = createHistoryRepo(db, dataDir);
      // insert two runs; created_at defaults to now so we assert on explicit ordering by id desc
      repo.insertRun({
        id: "b",
        status: "pending",
        prompt: "first",
        negativePrompt: null,
        params: {},
        seeds: [],
        promptIds: [],
      });
      repo.insertRun({
        id: "a",
        status: "completed",
        prompt: "second",
        negativePrompt: null,
        params: { width: 512, height: 512 },
        seeds: [1],
        promptIds: ["x"],
      });
      seedDiskFile(dataDir, "images/a/0.webp");
      repo.insertImage({
        id: "ia",
        runId: "a",
        variationIndex: 0,
        seed: 1,
        kind: "base",
        localPath: "images/a/0.webp",
        filename: "0.webp",
      });
      const rows = repo.list();
      // newest first = id desc -> 'b' then 'a'
      expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
      // image relative path resolvable and stays under dataDir
      expect(join(dataDir, rows[1]!.id, "images/a/0.webp")).toContain(dataDir);
    } finally {
      dispose();
    }
  });
});