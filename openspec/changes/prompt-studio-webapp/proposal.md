# Proposal: Prompt Studio — Local AI Prompt Designer for ComfyUI

## Intent

Local-first webapp: interview a "director fotografico" LLM, get an editable photorealistic English prompt, set generation parameters, render on the local ComfyUI (`127.0.0.1:8188`), and keep a comparable history. Today this requires hand-editing the workflow JSON, toggling the LLM node, and managing images manually.

## Scope

### In Scope
- Interview chat (Qwen3-4B via spawned `llama-server.exe`; `director_fotografico.txt` reused verbatim). Final prompt ALWAYS editable before submit.
- ComfyUI proxy: CORS-safe API, workflow UI→API-format conversion, submit/poll, image fetch, SSE progress.
- Options: seed, steps, cfg, resolution + aspect presets (1:1, 4:5, 3:2, 16:9, 9:16) mapped to latent width/height; one interview → multiple seeds (variations).
- History gallery (SQLite): compare, regenerate with edited prompt/params.
- img2img: optional configuration, OFF by default.

### Out of Scope
- Any modification or install into the ComfyUI portable env (HTTP only; vendored llama-server run read-only).
- Cloud deploy, auth, multi-user.
- Upscale-branch UI control (template default only).
- Rigid question tree (the prompt file already implements the interview logic).

## Capabilities

### New Capabilities
- `interview-assistant`: director chat, quick-reply chips, always-editable final prompt.
- `comfyui-integration`: proxy, workflow conversion, submit/poll/images/SSE.
- `generation-options`: params UI, aspect-ratio mapping, multi-seed variations.
- `history-gallery`: SQLite persistence, compare, regenerate.
- `llm-runtime`: llama-server spawn/lifecycle/health; CPU default (-ngl 0).

### Modified Capabilities
None — pre-scaffold, no existing specs (`openspec/specs/` is empty).

## Approach
- npm workspaces monorepo: `apps/web` (React + Vite + TS + Tailwind + shadcn/ui), `apps/server` (Hono + better-sqlite3).
- Server spawns vendored `llama-server.exe` (OpenAI-compatible `/v1/chat/completions`), CPU-only to avoid VRAM contention with the image UNet; chat state held server-side.
- Convert the reference workflow UI→API format (links→inputs, drop muted nodes incl. img2img + LLM node); set CLIPTextEncode positive `text` = final prompt; KSampler seed per variation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/*` | New | React UI: chat, params, gallery |
| `apps/server/*` | New | Hono proxy, LLM lifecycle, SQLite |
| `workflow_fotorealista_qwen.json` | Read | Template source — copied, never edited |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UI→API conversion errors | Med | Verify against live API-format export; golden tests |
| VRAM contention (LLM + UNet) | Med | LLM on CPU default; sequential queue |
| Orphan llama-server process | Med | PID tracking, health check, exit hook |
| No git repo (rollback) | High | Zip snapshot before scaffold; ComfyUI files untouched |

## Rollback Plan

Pre-scaffold: nothing to revert to. Snapshot `prompt-studio/` before work; rollback = restore snapshot + kill spawned llama-server. ComfyUI install is never modified → no rollback needed there.

## Dependencies

- Running ComfyUI at `127.0.0.1:8188` (read-only HTTP).
- Vendored llama.cpp b8840 CUDA13 binaries + Qwen3-4B GGUF present.
- Node v24 / npm (verified).

## Success Criteria

- [ ] Full loop: interview → editable prompt → 4 variations → gallery.
- [ ] Aspect presets yield correct latent sizes; generation succeeds end-to-end.
- [ ] Regenerate from history re-runs with edited prompt/params.

## Proposal question round — RESOLVED (user answers, 2026-08-04)

1. Default **4 variations** per run, configurable 1–8.
2. App **auto-starts llama-server** (and shuts it down on exit); user only starts ComfyUI.
3. Aspect presets sized by **1024 long side**: 4:5 → 1024×1280, 3:2 → 1024×683, 16:9 → 1024×576, 9:16 → 576×1024.
4. Images stored **on disk** (app folder); SQLite stores metadata only.
5. UI language: **Spanish (Argentina register)** for v1; i18n (es/en) deferred to v2/v3. Director replies in Spanish; final prompt in English (per the prompt file).
