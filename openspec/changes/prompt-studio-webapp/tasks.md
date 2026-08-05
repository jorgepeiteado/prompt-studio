# Tasks: Prompt Studio — Local AI Prompt Designer for ComfyUI

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,700–3,900 (authored additions+deletions; committed goldens excluded from risk count; +~200 for the new upscale option) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 Foundation → PR 2 Server core → PR 3 Web UI → PR 4 Integration |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Scaffold + shared + converter + golden (tasks 1.1–2.4) | PR 1 | `npx vitest run shared converter` + `npm run typecheck` | `npx tsx apps/server/src/scripts/verifyAgainstObjectInfo.ts` vs live ComfyUI :8188 (manual) | Revert PR 1; drop apps/, packages/shared, assets/; restore openspec from initial commit |
| 2 | Server core: comfy client, orchestrator, LLM lifecycle, DB, routes (3.1–6.1) | PR 2 | `npx vitest run comfy ws-relay generation llm history server-routes` | `npm run dev:server` + real ComfyUI :8188; fake spawn + fake /health in tests | Revert PR 2; delete `data/` (db+images) and spawned llama-server via exit hook |
| 3 | Web UI: chat, review, gallery, detail (7.1–7.6) | PR 3 | `npx vitest run web` + `npm run typecheck` | `npm run dev` full stack; manual interview → 1 variation smoke | Revert PR 3 (apps/web) — server/DB untouched |
| 4 | Integration tests + smoke/README (8.1–8.2) | PR 4 | `npm test` (full suite green) | Manual smoke of proposal success criteria (interview → 4 variations → gallery → regenerate) | Revert PR 4 (test files + README only) |

## Phase 1: Scaffold & Workspaces (Foundation)

- [x] 1.1 **Scaffold monorepo + git init + enable strict TDD** — create root `package.json` (workspaces `["apps/*","packages/*"]`, scripts dev/build/test/lint/typecheck, `engine >=22`), `tsconfig.base.json` (strict, paths `@promptstudio/shared`), `.gitignore`, `.env.example`; `git init`; set `openspec/config.yaml` `testing.strict_tdd: true`, `test_command: "npm test"`; `npm install`; initial commit (openspec + scaffold).
  AC: `npm install` succeeds; `git log` shows initial commit; `npm test` runs vitest with 0 tests; config.yaml tdd=true. Deps: none. Est: 120. **[TDD enable]**

- [x] 1.2 **packages/shared types + DTOs** — `packages/shared/package.json` (source-only, no build) + `src/types.ts` (Run/Params/RunStatus/ImageRow/ChatMessage), `src/dto.ts`; wire tsconfig paths alias.
  AC: `npm run typecheck` passes with `@promptstudio/shared` imported from apps/server. Deps: 1.1. Est: 120.

- [x] 1.3 **Shared logic, TEST-FIRST** — RED tests for `aspectToSize` (5 presets, 1024 long side: 4:5→1024×1280, 16:9→1024×576, 9:16→576×1024), `detectFinalPrompt` (Spanish question→false, English paragraph→true, passthrough→true), `validation` (variations 1–8, empty prompt); then implement `aspect.ts`, `detectFinalPrompt.ts`, `validation.ts` to green.
  AC: `npx vitest run shared` green. Deps: 1.2. Est: 150.

## Phase 2: Converter + Golden (comfyui-integration)

- [x] 2.1 **Template asset pipeline** — `scripts/copy-template.mjs` copies `testeo comfyui/workflow_fotorealista_qwen.json` → `assets/workflows/` byte-identical (never edited in place); create `assets/fixtures/`; record SHA-256.
  AC: byte-compare source vs copy passes; script idempotent. Deps: 1.1. Est: 40.

- [x] 2.2 **Converter golden RED tests** — `converter.test.ts`: deep-equal vs committed `assets/fixtures/fotorealista.api.golden.json` for canonical opts (golden test); immutability (template byte-identical after convert); `ConversionError` on unknown dropped-source link; muted/img2img nodes 5 & 16–26 absent; upscale 12–15 kept. (RED before implementation.)
  AC: tests fail with no converter. Deps: 2.1, 1.3. Est: 90. **[TEST-FIRST]**

- [x] 2.3 **Implement `apps/server/src/services/converter.ts`** — pure `convert(template, opts)`: index nodes/links; drop `mode!=0`, `Note`, node 5; link→`[srcId,slot]` refs (dropped-source = injection point, else throw); `WIDGET_NAMES` table (UnetLoaderGGUF, ModelSamplingAuraFlow, CLIPLoader, VAELoader, CLIPTextEncode, EmptySD3LatentImage, KSampler, SaveImage, ImageScale); inject node 6 `text`=finalPrompt, node 7 fixed negative, node 8 width/height/batch, node 9 seed/steps/cfg/sampler/scheduler/denoise; flat `{"1":{class_type,inputs}}`; optional img2img keeps 16–26 + upload filename; regenerate golden only with `-u` after review.
  AC: `npx vitest run converter` green (2.2 passes). Deps: 2.2. Est: 260.

- [x] 2.4 **WIDGET_NAMES verification script** — `apps/server/src/scripts/verifyAgainstObjectInfo.ts` cross-checks class/required-input table vs live `GET /object_info` (manual, ComfyUI may be offline in CI).
  AC: run vs live ComfyUI 0.29.2 reports match or explicit diffs. Deps: 2.3. Est: 60.

- [x] 2.5 **Upscale optional (OFF by default)** — converter drops branch nodes 12–15 when `opts.upscale === false` (base 1024 `qwen_txt` only); keeps 12–15 and adds HD image (`qwen_txt_hd`) when `opts.upscale === true`; `POST /api/generate` accepts `upscale: boolean` default `false`, recorded in `run.params_json`; with upscale off only `base` image rows are produced. **PR 2 scope** (folded into current PR work).
  AC: `npx vitest run converter` green with `upscale:false` golden (no 12–15) and `upscale:true` keeps 12–15; generate route accepts `upscale` default false; no `hd` rows when off. Deps: 2.3. Est: 90.

## Phase 3: Comfy Client + Orchestrator

- [ ] 3.1 **comfy.ts HTTP client** — POST `/prompt`, GET `/history/{id}`, GET `/view`, GET `/object_info`, GET `/system_stats`; 502 on unreachable; node-execution errors surfaced with failing node + message; tests with mocked fetch.
  AC: `npx vitest run comfy` green; unreachable → 502 path. Deps: 1.3. Est: 130.

- [ ] 3.2 **sse.ts + ws-relay.ts** — SSE framing helpers; ComfyUI WS client (`ws://127.0.0.1:8188/ws`) relaying `progress`/`executed` for the run's prompt_ids; unit tests map WS events to SSE frames.
  AC: `npx vitest run ws-relay` green. Deps: 3.1. Est: 140.

- [ ] 3.3 **generation.ts orchestrator** — N separate `/prompt` submissions (batch_size 1, seed `base+i` per spec "seed differs per variation"), 409 if a run is active, run state transitions (pending→running→completed/failed), completion via `/history/{id}`, image fetch via `/view` → disk write, per-variation error isolation; tests: 202 with N prompt_ids, 409 busy, failure surfaces node.
  AC: `npx vitest run generation` green. Deps: 3.1, 3.2, 2.3. Est: 220.

## Phase 4: LLM Lifecycle (llm-runtime)

- [ ] 4.1 **RED process-lifecycle tests** — fake spawn + fake `/health` harness: spawn called with `shell:false` + exact argv (`-m <gguf> -c 8192 -ngl 0 --port 8080 --host 127.0.0.1`); orphan cleanup kills only PID whose WMI `ExecutablePath` == vendored binary (fixed powershell script, PID as parameter); foreign PID left untouched; adopt branch when `:8080/health` ok → `pid:null, adopted:true`, never kill.
  AC: all lifecycle tests fail before implementation. Deps: 1.1. Est: 100. **[TEST-FIRST]**

- [ ] 4.2 **Implement `llm.ts` lifecycle** — spawn/adopt/orphan-protection/shutdown (SIGINT/SIGTERM/`beforeExit`; kill only non-adopted), PID file `data/.llm.pid` `{pid,exePath,startedAt}`, health poll 500 ms / 120 s timeout with binary path on failure, missing-binary error pointing at expected path (`...b8840\win-x64-cuda13\llama-server.exe`).
  AC: 4.1 green; `npm run dev:server` spawns and `/api/llm/status` reports ready/adopted. Deps: 4.1. Est: 180.

- [ ] 4.3 **Chat streaming + conversation state** — RED: NDJSON deltas → SSE `{type:token}`…`{type:done,full,isFinalPrompt}`; `/v1/chat/completions` multi-turn honors server-side history (Map, cap 40 messages, drop oldest pairs, idle GC 30 min); then implement chat service.
  AC: `npx vitest run llm-chat` green; streaming relay frames verified. Deps: 4.2, 3.2. Est: 160. **[TEST-FIRST]**

## Phase 5: DB + History

- [ ] 5.1 **Migrations** — `apps/server/src/db/migrations/001_init.sql` (runs + images tables, `idx_images_run`), `migrate.ts` applying in one transaction with `PRAGMA user_version`; test `user_version == 1`.
  AC: `npx vitest run db` green; fresh `data/prompt-studio.db` created with schema. Deps: 1.1. Est: 70.

- [ ] 5.2 **History repository** — parameterized CRUD: insert run (params/seeds/prompt_ids/chat_json), insert image rows (relative paths only — no image bytes), list (chronological, thumbnail), detail, delete run + disk files; relative paths resolved against `DATA_DIR`.
  AC: `npx vitest run history` green; DB holds no binary data; delete removes files. Deps: 5.1. Est: 160.

## Phase 6: Server API Wiring

- [ ] 6.1 **config.ts + index.ts + routes** — env defaults (`SERVER_PORT=8787`, `COMFYUI_URL`, `LLAMA_PORT=8080`, `LLM_BIN`, `LLM_MODEL`, `LLM_SYSTEM_PROMPT`, `DATA_DIR`); Hono app wiring health/llm/generate/history/comfy-passthrough/upload routes; error convention `{error:{code,message}}` (400/404/409/422/502/503/500); llm boot + shutdown hooks; integration tests with mocked comfy + fake spawn covering 202/409/422/502/503 and SSE endpoints.
  AC: `npx vitest run server-routes` green; `npm run dev:server` boots and `/api/health` responds. Deps: 3.3, 4.2, 4.3, 5.2. Est: 240.

## Phase 7: Web UI (interview-assistant / generation-options / history-gallery)

- [ ] 7.1 **Web scaffold** — Vite + React + TS in `apps/web`, Tailwind + shadcn/ui (stone, cssVariables, class dark), `globals.css` darkroom tokens, minimal `ThemeProvider` (class, localStorage, system default), `AppLayout`/`Header`/nav, react-router routes (`/`, `/review`, `/gallery`, `/gallery/:runId`), vite proxy `/api` → `127.0.0.1:8787`.
  AC: `npm run dev` serves at 5173; theme toggle persists. Deps: 1.1. Est: 220.

- [ ] 7.2 **lib/api.ts + strings.ts** — fetch/SSE wrapper (EventSource for progress, AbortController cancel); Spanish (AR) `strings.ts` nested keys + 4-axis quick-reply chips (rioplatense); unit tests: all referenced keys exist, api wrapper with mocked fetch.
  AC: `npx vitest run web-lib` green; UI copy Spanish (AR), identifiers English. Deps: 7.1. Est: 160.

- [ ] 7.3 **zustand stores** — `useChatStore`, `useRunStore`, `useGalleryStore`; store unit tests.
  AC: `npx vitest run web-stores` green. Deps: 7.2. Est: 120.

- [ ] 7.4 **InterviewView** — MessageList/MessageBubble/TypingIndicator/QuickReplyChips/ChatInput; consumes SSE chat; on `isFinalPrompt` → `/review` with editable prompt; empty prompt blocks submit.
  AC: tokens stream, chip tap sends suggestion, final prompt lands in editor. Deps: 7.3, 4.3. Est: 220.

- [ ] 7.5 **ReviewView + ProgressView** — PromptEditor (empty blocks submit + validation msg), OptionsPanel (seed randomized, steps 20, cfg 2.5, euler, simple), AspectPicker (5 presets + custom), VariationSlider 1–8 (9 blocked with message), RunSummaryCard, GenerateButton → `POST /api/generate`, per-variation SSE progress bars, navigate to gallery on complete.
  AC: preset 4:5 → 1024×1280 sent; variations 9 blocked; review shows prompt/resolution/params/count. Deps: 7.3. Est: 260.

- [ ] 7.6 **GalleryView + RunDetailView** — RunList/RunCard (chronological, thumbnail, prompt excerpt, status, empty-state), ImageViewer, CompareView (2+ images side-by-side with metadata), ChatReplay (`chat_json`), RegenerateButton (`POST /api/regenerate`, new run, original untouched), Delete run.
  AC: newest run first; compare renders 2 images + metadata; regenerate creates new entry. Deps: 7.3, 5.2. Est: 240.

## Phase 8: Integration + Verification

- [ ] 8.1 **End-to-end server integration tests** — mocked ComfyUI full flow: chat → generate 4 variations → image rows → history list/detail → regenerate (new run, old intact) → delete; 409/422/502/503 error paths.
  AC: `npm test` (full suite) green. Deps: 6.1, 7.5. Est: 160.

- [ ] 8.2 **Manual smoke + README** — run `verifyAgainstObjectInfo` vs live ComfyUI, lock golden; README setup (ComfyUI :8188 running; llama auto-spawned; ports 5173/8787/8080); proposal success criteria checklist (interview → 4 variations → gallery → regenerate).
  AC: manual smoke passes all success criteria; README documents setup and ports. Deps: 8.1. Est: 60.

## TDD Notes

Strict TDD (RED→GREEN→REFACTOR, `npm test`) enabled at task 1.1 (config.yaml). Explicit TEST-FIRST tasks: 1.3 (shared logic), 2.2 (converter golden), 4.1 (process lifecycle), 4.3 (chat streaming). Threat-matrix RED tests (shell:false args, exePath-match kill, foreign-process leave, port-busy adopt) are embedded in 4.1 and enforced in 4.2.
