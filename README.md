# Prompt Studio — local AI prompt designer for ComfyUI

Prompt Studio chats with you (es-AR) until it reaches a photographic prompt,
lets you edit it, and generates **N image variations** on a local **ComfyUI**
install, with live per-variation progress, history, and regeneration.

It is a **100 % local app**: LLM, server and ComfyUI all run on your machine.
No cloud services.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + React + TypeScript, Tailwind + shadcn/ui, zustand |
| Backend | Hono (TypeScript), SQLite (`better-sqlite3`) |
| LLM | `llama-server` (spawned/adopted by the server) |
| Image | Local ComfyUI (workflow `comfyui/workflow_fotorealista_qwen.json`) |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |

## Requirements

- **Node.js ≥ 22** and npm.
- **ComfyUI** running at `http://127.0.0.1:8188` with the nodes required by
  the workflow `comfyui/workflow_fotorealista_qwen.json` (Qwen caption, etc.).
- **`llama-server.exe`** from llama.cpp (CUDA/win-x64 build) and a GGUF model
  (e.g. `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`).

## Configuration

Copy `.env.example` → `.env` and adjust the paths:

```dotenv
SERVER_PORT=8787
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_WS=ws://127.0.0.1:8188/ws

LLAMA_PORT=8080
LLM_BIN=C:\path\to\llama-server.exe
LLM_MODEL=C:\path\to\Qwen3-4B-Instruct-2507-Q4_K_M.gguf
LLM_SYSTEM_PROMPT=C:\path\to\director_fotografico.txt
LLM_CTX=8192

DATA_DIR=./data
```

> `DATA_DIR` holds the SQLite database and generated images under `/data`. No
> credentials involved.

## Install & run

```bash
npm install
npm run dev
```

This starts **server** (port `8787`) and **web** (port `5173`, proxy `/api` →
`127.0.0.1:8787`) in parallel. ComfyUI must already be running on `:8188`.

Ports in use:

| Port | Role |
|------|------|
| `8188` | ComfyUI (runs separately) |
| `8787` | Prompt Studio API (server) |
| `8080` | `llama-server` (spawned/adopted by the server) |
| `5173` | Vite dev server (frontend) |

## Useful commands

```bash
npm run dev                # server + web together
npm run dev:server         # server only (tsx watch, .env)
npm run dev:web            # frontend only
npm test                   # full suite (vitest)  → 27 files / 177 tests
npm run typecheck          # types (root + apps/web)
npm run lint               # eslint . --quiet
npm run build              # typecheck + vite build
npm run verify:object-info # cross-check WIDGET_NAMES vs live ComfyUI /object_info
npm run update:golden      # regenerate the golden after review (-u)
```

## Success criteria (manual smoke)

Proposal success checklist (PR4 / task 8.2) against a real instance:

1. **Interview** → reach an editable final prompt.
   - `POST /api/llm/chat` → `{type:done, full, isFinalPrompt:true}`.
2. **4 variations** → N images (N distinct seeds).
   - `POST /api/generate` → `runId` + 4 `prompt_ids`; SSE `/events` delivers
     `progress` → `image` ×4 → `complete`.
3. **Gallery** → the run shows `Completado`, with thumbnail, prompt and status.
4. **Regenerate** → new run (original untouched), `/review?from=<runId>` shows
   its live progress.
5. **Delete** → removes row and image files (204).

> The full flow is automated against a mocked ComfyUI
> (`apps/server/src/e2e.test.ts`); the manual smoke only validates integration
> with the real ComfyUI.

## Layout

```
apps/server   # Hono API, converter, generation orchestrator, LLM, SQLite
apps/web      # React UI (interview, review, progress, gallery, detail)
packages/shared # types + DTOs + shared logic (aspect, validation)
assets/workflows / fixtures   # template + golden (byte-identical)
scripts/      # copy-template, update-golden
```