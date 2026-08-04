# Project — testeo comfyui

## Overview

Standalone project inside the `testeo_arneses` parent workspace. Target: a prompt-design
webapp that helps a photographer/creative director produce photorealistic images on a
**local ComfyUI** install. The app is at **pre-scaffold** stage — the SDD process starts
before any code exists.

## Goal

A webapp with:

1. **Interview flow** — step-by-step questions that elicit a photographic brief
   (subject, scene, light, camera/lens, mood, reference style).
2. **Local LLM assistance** — a Qwen3-4B GGUF model (via ComfyUI's `LLMTextProcessor`,
   acting as a "director fotografico") expands short user answers into rich,
   photorealistic prompts.
3. **Direct submission to ComfyUI** — send the generated workflow to the local server
   at `127.0.0.1:8188` (`/prompt` API) and show results.
4. **Local history** — persisted record of past sessions, prompts, and generated images.

## Existing assets

| Asset | Role |
| --- | --- |
| `workflow_fotorealista_qwen.json` | Reference 28-node Qwen-Image photorealistic workflow (UnetLoaderGGUF + LLMTextProcessor Qwen3-4B director + KSampler + 2 upscale branches). Base for the app's workflow template. |
| ~~`todolodecomfy.txt`~~ | ~~5.3 MB listing dump of the ComfyUI install — used to enumerate available nodes/models.~~ **MISSING**: vanished during the 2026-08-04 sdd-init session (not deleted by init; not found in Temp/recycle). Re-dump from the ComfyUI install if needed. |
| `.atl/skill-registry.md` | Skill index for agent delegation. |

## Environment

- **OS**: Windows (win32), PowerShell 7
- **Runtime**: Node v24.19.0, npm 11.17.0
- **ComfyUI**: portable install at `C:\Program Files\ComfyUI_windows_portable`, server
  currently reachable at `127.0.0.1:8188`; `comfyui-mcp` server connected (151 tools)
- **Git**: NOT a repository (neither this folder nor the parent) — no branch/PR baseline

## Stack conventions (from parent repo AGENTS.md)

- TypeScript, npm package manager
- Verification: `npx eslint . --quiet`, `npx tsc --noEmit`, `npx vitest run`
- **Note**: vitest/eslint/tsc are NOT installed yet (parent stub test script only);
  strict TDD stays disabled until the webapp scaffold lands

## SDD state

- Persistence: **hybrid** (openspec files + engram)
- Config: `openspec/config.yaml`
- Strict TDD: **disabled** (no test runner yet)
- No change is active yet — first step is `/sdd-explore` or `/sdd-new` for the webapp
