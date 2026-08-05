-- 001_init.sql — prompt-studio v1 (runs + images)
-- Applied inside one transaction; migrator bumps PRAGMA user_version to 1.
CREATE TABLE runs (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,               -- pending|running|completed|failed|cancelled
  prompt TEXT NOT NULL, negative_prompt TEXT,
  params_json TEXT NOT NULL,          -- {steps,cfg,sampler_name,scheduler,denoise,width,height,aspect}
  seeds_json TEXT NOT NULL,           -- [s0..sN-1]
  prompt_ids_json TEXT NOT NULL,      -- [comfyui prompt_id per variation]
  chat_json TEXT NOT NULL DEFAULT '[]',
  error TEXT
);
CREATE TABLE images (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  variation_index INTEGER NOT NULL, seed INTEGER NOT NULL, comfyui_prompt_id TEXT,
  kind TEXT NOT NULL,                 -- base|hd (SaveImage 11 vs 15)
  local_path TEXT NOT NULL,           -- relative to DATA_DIR
  thumbnail_path TEXT,                -- relative to DATA_DIR (320px webp preview; null until generated)
  filename TEXT NOT NULL, width INTEGER, height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_run ON images(run_id);