# LLM Runtime — RAM vs VRAM

This document explains where the interview LLM (the "photographic director")
loads when the app boots, and how to change it.

## TL;DR

**Default: the GGUF loads into system RAM, not VRAM.** That is intentional.

The LLM is spawned by the server as `llama-server.exe` with:

```
-m <model.gguf>
-c 8192
-ngl 0        ← how many layers are offloaded to the GPU
```

`-ngl` (`--n-gpu-layers`) controls GPU offload. The app reads it from the
`LLM_NGL` env var, which defaults to **0** when unset. With `-ngl 0`, **every
layer runs on the CPU** and the model (~2.3 GB for
`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`) lives in **RAM** — VRAM is untouched.

## Why RAM by default

This app shares one GPU with **ComfyUI**, which needs almost all VRAM for the
image model (e.g. Qwen-Image, ~11–12 GB on a 16 GB card). Running the director
LLM on the GPU as well would make it compete with rendering and can exhaust
VRAM mid-queue. Keeping the interview LLM on CPU/RAM leaves the full GPU to
ComfyUI.

## How to change it (optional)

Add one line to `.env`:

```dotenv
LLM_NGL=33
```

`Qwen3-4B-Instruct-2507` has 36 layers; keeping a few layers on CPU (e.g.
`33`) caps VRAM usage around ~2.5 GB while accelerating the rest on GPU.

**Warning:** with a 16 GB card shared with ComfyUI, enabling GPU offload for
the LLM reduces headroom and may cause out-of-memory errors during generation.
Only enable it if you have observed headroom or run ComfyUI on a separate GPU.

## How to verify what it is currently using

```powershell
# While the app is running:
Get-Process llama-server | Select-Object -Property WorkingSet64, PrivateMemorySize64
```

`WorkingSet64` in the gigabytes range (≈ 2.5–3 GB) means it is loaded in RAM.
If you prefer a numeric check of GPU usage, use Task Manager → Performance →
GPU (or `nvidia-smi`), and note that with `LLM_NGL=0` the llama-server process
shows ~0 GPU memory.