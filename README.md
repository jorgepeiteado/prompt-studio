# Prompt Studio — local AI prompt designer for ComfyUI

> Chat with a local "photographic director" LLM until you get the perfect English
> prompt, edit it, and render **N image variations** on your local ComfyUI —
> 100 % local, no cloud, no API keys.

[![Tests](https://img.shields.io/badge/tests-177%20passed%20%2F%2027%20files-green)](https://github.com/jorgepeiteado/prompt-studio)
[![Security audit](https://img.shields.io/badge/security%20audit-READY-green)](#security)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

---

## What it does

1. **Interactive interview (es-AR)** — a local LLM (Qwen3-4B, via `llama-server`)
   asks photographic-director questions until it proposes a complete prompt.
2. **Editable prompt** — review, tweak, and confirm the English prompt by hand;
   it is never locked by the machine.
3. **N variations** — generate between 1 and 8 images from the prompt, each with
   its own seed, on your local ComfyUI.
4. **Live progress** — per-variation progress streamed over SSE/WebSocket while
   the queue runs.
5. **History & regeneration** — every run is stored (SQLite + images on disk);
   re-run any prompt, keep the originals untouched.

Everything runs on your machine: the conversation, the generation, and the data.
No telemetry, no cloud services, no credentials.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + React + TypeScript, Tailwind + shadcn/ui, zustand |
| Backend | Hono (TypeScript), SQLite (`better-sqlite3`) |
| LLM | `llama-server` (spawned/adopted by the server) |
| Image | Local ComfyUI (workflow `comfyui/workflow_fotorealista_qwen.json`) |
| Monorepo | npm workspaces (`apps/*`, `packages/*`), strict TDD |

## Requirements

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 22** + npm | dev tooling |
| **ComfyUI** on `http://127.0.0.1:8188` | with the custom nodes used by `comfyui/workflow_fotorealista_qwen.json` (Qwen caption/LLM nodes) |
| **Qwen-Image 2512** model in ComfyUI | `qwen-image-2512-Q4_K_M.gguf` (checkpoints / diffusion models dir) |
| **`llama-server.exe`** | llama.cpp CUDA/win-x64 build (see `.env.example`) |
| **GGUF model for the LLM** | e.g. `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` |

## Configuration

```bash
cp .env.example .env   # Windows: copy .env.example .env
```

Edit the paths:

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

> `DATA_DIR` holds the SQLite database and generated images under `data/`.
> No credentials involved.

## Install & run

```bash
npm install
npm run dev
```

That starts **server** (`8787`) and **web** (`5173`, proxy `/api` → `127.0.0.1:8787`)
in parallel. Open **http://localhost:5173**. ComfyUI must already be running on
`:8188`.

Ports in use:

| Port | Role |
|------|------|
| `8188` | ComfyUI (runs separately) |
| `8787` | Prompt Studio API (server) |
| `8080` | `llama-server` (spawned/adopted by the server) |
| `5173` | Vite dev server (frontend) |

## Manual smoke test

1. **Interview** → answer the photographer-director until a final prompt appears and is editable.
2. **Generate** → choose variations (1–8) and watch live per-variation progress; images land in the gallery as they finish.
3. **Gallery** → a completed run shows its thumbnail, the exact prompt, and status.
4. **Regenerate** → new run from the same prompt; the original run stays untouched.
5. **Delete** → removes the run row and its image files.

> The full journey is also automated against a mocked ComfyUI in
> `apps/server/src/e2e.test.ts` (177 tests / 27 files, strict TDD).

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

## Security

Professional security audit performed at close (see
`openspec/changes/prompt-studio-webapp/security-audit.md`):

- **0 critical / 0 high** findings; 0 secrets committed (`git log -p` scan),
  no SQL injection (all parameterized), no path traversal, no SSRF, no XSS.
- All processes bind **loopback only** (`127.0.0.1`); the server refuses to
  start on a non-loopback host.
- CORS scoped to the exact dev origin (same-origin via Vite proxy).
- `npm audit`: **0 vulnerabilities**.
- **Verdict: READY** for loopback production use.

## Layout

```
apps/server          # Hono API, workflow converter, generation orchestrator, LLM, SQLite
apps/web             # React UI (interview, review, progress, gallery, detail)
packages/shared      # types + DTOs + shared logic (aspect, validation)
assets/workflows     # template workflow (Qwen fotorealista)
assets/fixtures      # golden API workflow (byte-identical)
scripts/             # copy-template, update-golden
openspec/            # SDD change artifacts (proposal, design, tasks, verify, security audit)
```

## License

MIT