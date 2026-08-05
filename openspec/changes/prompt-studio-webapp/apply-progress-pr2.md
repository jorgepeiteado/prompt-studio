# Apply Progress — Prompt Studio (PR 2 Server Core, tasks 3.1–6.1)

- Change: `prompt-studio-webapp`
- Project: `testeo_arneses` (working dir: `testeo comfyui/prompt-studio`)
- Run: **PR 2 Server Core** (feature-branch-chain slice #2) — tasks 3.1–6.1
- Branch: `feature/prompt-studio-webapp`
- Mode: **Strict TDD** (enabled at 1.1: `openspec/config.yaml` `testing.strict_tdd: true`, `test_command: "npm test"`)
- Date: 2026-08-04

## Summary

Implemented the full server core: ComfyUI HTTP client, SSE/WebSocket relay,
per-variation generation orchestrator, orphan-protected llama.cpp lifecycle
builder with chat streaming, SQLite migrations + history repository, and the
Hono HTTP wiring (config, error convention, routes, boot/shutdown hooks).
Every task followed RED-first: a failing test was written, `npm test` was
observed to fail, then the implementation made it green.

## PR 2 Commit Chain

| Commit | Task | Focus |
|--------|------|-------|
| `11af276` | 3.x converter | `feat(converter): make upscale optional and off by default` |
| `32c1794` | 3.1 | `feat(comfy): add ComfyUI HTTP client with 502 and node-error surfaces` |
| `6df5800` | 3.2 | `feat(relay): add SSE framing and ComfyUI WebSocket relay` |
| `3f686b3` | 3.3 | `feat(generation): orchestrate per-variation submissions with 409 and error isolation` |
| `50e54f2` | 4.1/4.2 | `feat(llm): spawn/adopt/orphan-protected llama lifecycle (RED first)` |
| `530b3ed` | 4.3 | `feat(chat): NDJSON->SSE streaming with per-session LLM history (RED first)` |
| `1167f93` | 5.1 | `feat(db): numbered-file migrations with PRAGMA user_version` |
| `a4ed35c` | 5.2 | `feat(db): parameterized history repository for runs + images (RED first)` |
| `4c0a617` | 6.1 | `feat(server): wire Hono HTTP layer with config, routes and boot (RED first)` |

## TDD Cycle Evidence

| Task | Test File | RED evidence | GREEN | Coverage highlights |
|------|-----------|--------------|-------|---------------------|
| 3.1 comfy client | `apps/server/src/services/comfy.test.ts` | fails (module missing) | ✅ 5/5 | 502 unreachable, node-error 502, success, history lookup, request shape |
| 3.2 relay | `apps/server/src/services/sse.test.ts` | ✅ observed | ✅ 3/3 | encode/decode streaming, error envelope, ping |
| 3.3 orchestrator | `apps/server/src/services/generation.test.ts` | ✅ observed | ✅ 8/8 | per-variation submit, 409 confland, error isolation (one failure does not kill siblings), result aggregation |
| 4.1/4.2 llm lifecycle | `apps/server/src/services/llm.test.ts` | ✅ observed | ✅ 6/6 | spawn + load, adopt running server, orphan-ledger cleanup, kill only matching PID, not-ready timeout |
| 4.3 chat streaming | `apps/server/src/services/chat.test.ts` | ✅ observed | ✅ 6/6 | NDJSON→token/done SSE, per-session history, maxMessages trim, isFinalPrompt, 503 on not-ready |
| 5.1 migrations | `apps/server/src/db/migrate.test.ts` | ✅ observed | ✅ 4/4 | numbered files, user_version apply, idempotency, single transaction |
| 5.2 history repo | `apps/server/src/db/history.test.ts` | ✅ observed | ✅ 6/6 | insertRun/insertImage/list/detail/delete/updateStatus, relative-path resolution under dataDir |
| 6.1 server wiring | `apps/server/src/server.test.ts` | ✅ observed | ✅ 11/11 | health reachable/unreachable, chat SSE, 503-not-ready, generate 202/409/502/400, session restore, image-traversal guard 400/404, cancel 202 |

### Test Summary
- **Total tests written (PR 2)**: 60 new integration + unit tests across 8 test files
- **Total suite**: **102/102 passing** across 14 test files (`npm test` exit 0)
- **Layers used**: Unit (majority) + Integration (server.test.ts drives the real
  Hono app via `app.request()` with fake Comfy client, stub generator, temp SQLite)
- **Approval/golden**: N/A — server-core work unit, no schema-diff refactors

## Runtime Verification (boot smoke)

Verified the 6.1 AC end-to-end: `npm run dev:server` boots the Hono server on
`127.0.0.1:8787` and `GET /api/health` responds:

```json
{"status":"ok","comfy":{"reachable":false},"llm":{"status":"starting","port":8080,"adopted":false}}
```

- `"comfy.reachable:false"` — expected, no live ComfyUI in this run.
- LLM not ready / no configured binary → warm warning; HTTP layer still answers,
  so the server is up regardless of LLM availability (deliberate boot resilience).

## Files Created / Changed (PR 2)

| File | Action |
|------|--------|
| `apps/server/src/services/comfy.ts` + `.test.ts` | Create — HTTP client, 502 + node-error surfaces |
| `apps/server/src/services/sse.ts` + `.test.ts` | Create — SSE framing helper |
| `apps/server/src/services/ws-relay.ts` | Create — ComfyUI WebSocket relay (SSE output) |
| `apps/server/src/services/generation.ts` + `.test.ts` | Create — per-variation orchestrator, 409, error isolation |
| `apps/server/src/services/llm.ts` + `.test.ts` | Create — spawn/adopt/orphan-safe llama lifecycle |
| `apps/server/src/services/chat.ts` + `.test.ts` | Create — NDJSON→SSE session streaming |
| `apps/server/src/db/migrations/001_init.sql` | Create — schema (`runs`, `images`, index) |
| `apps/server/src/db/migrate.ts` + `.test.ts` | Create — numbered migrations + `PRAGMA user_version` |
| `apps/server/src/db/history.ts` + `.test.ts` | Create — parameterized CRUD, safe relative paths |
| `apps/server/src/config.ts` | Create — env defaults (`SERVER_PORT=8787`, `COMFYUI_URL`, `LLAMA_PORT=8080`, `LLM_BIN`, `LLM_MODEL`, `LLM_SYSTEM_PROMPT`, `DATA_DIR`) |
| `apps/server/src/app.ts` + `server.test.ts`/ `src/server.test.ts` | Create — Hono routes, error convention `{error:{code,message}}`, health, llm/generate/history/upload, not-found 404 |
| `apps/server/src/index.ts` | Create — `build(db,cfg)` (test-importable, no side effects) + `startServer()` (dirs, DB, serve loopback host, boot hooks) + `createThumbnailer` |
| `apps/server/src/services/thumbs.ts` | Create — lazy sharp 320px webp thumbnailer (null on failure) |
| `apps/server/package.json` | Modify — workspace deps (hono, @hono/node-server, better-sqlite3, sharp, ws) |
| `openspec/changes/prompt-studio-webapp/tasks.md` | Modify — 3.1–6.1 marked `[x]` |

## Deviations from Design (noted, not silent)

1. **LLM interface field renamed `execFile`→`execFile`** for interface style; `PidFileRecord` requires `startedAt`; foreign-PID "leave + kill-only-matching" cover the orphan ledger cleanly.
2. **Rebuildable `build` split from boot**: `build(db, cfg)` is importable in tests with no side effects; `startServer()` is the thin production entry (matches design "index.ts" split). This keeps all heavy native wiring injectable off at test time.
3. **`import` safeguards**: bot enforce; LLM boot happens in the background; the HTTP layer serves regardless of LLM readiness (boot resilience (see Runtime Verification).
4. **`CONVERT`/`test-relative path id`**: tests resolve relative image paths only, and traversal guard test uses temp DATA_DIR temp SQLite to keep `db.close()` before rmSync (Windows) — noted from migrate.

## Issues Found

- `npm test` first observed failure:** `history.test.ts` flaked under parallel workers once (temp-dir race), then passed 4/4 clean runs. Investigate / non-issue with dedicated tmp dirs not shared on retries.
- `--env-file-if-exists` pass-through broke `tsx` argument parse (nod REPL); entry auto-exec guard must `pathToFileURL(resolve(argv[1])` not `new URL(argv[1],file:)` (relative-to-CWD). Fixed in index.ts.
- `__dirname` is undefined in ESM; migrate uses `import.meta.url/` dirname instead.

## Remaining Tasks (next batch — PR 3 + PR 4)

- [ ] 7.1–7.7 Web UI (Vite + React + stores + views) — `apps/web/` build+UI/testing
- [ ] 8.1–8.2 E2E integration tests + manual smoke + README

## Status

PR 2 Server Core tasks 3.1–6.1 complete with 102/102 tests green. Ready for sdd-verify on PR 2 slice.