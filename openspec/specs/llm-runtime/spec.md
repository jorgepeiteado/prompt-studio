# LLM Runtime Specification

## Purpose

Lifecycle management of the local OpenAI-compatible LLM server: spawn the vendored `llama-server.exe` (CPU by default), serve `/v1/chat/completions` for the interview, and guarantee clean shutdown without orphans.

## Requirements

### Requirement: Vendored llama-server

The system MUST run the vendored `llama-server.exe` found at `ComfyUI-LLM-text-processor\vendor\llama.cpp\b8840\win-x64-cuda13\` and MUST NOT modify or install anything into the ComfyUI portable environment.

#### Scenario: Binary detection

- GIVEN the vendored llama-server directory exists
- WHEN the runtime starts
- THEN it locates and spawns `llama-server.exe` from that directory

#### Scenario: Missing binary

- GIVEN the vendored binary is missing
- WHEN the runtime starts
- THEN startup fails with a clear error message pointing at the expected path

### Requirement: Model and System Prompt

The runtime MUST load `models\LLM\Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf` and MUST read `models\LLM\prompts\director_fotografico.txt` verbatim as the system prompt.

#### Scenario: Chat honors system prompt

- GIVEN the server is up with the director prompt file
- WHEN a chat message is sent
- THEN the response follows the director interview protocol from the prompt file

### Requirement: CPU by Default

The runtime MUST default to CPU inference (`-ngl 0`) to avoid VRAM contention with the image UNet.

#### Scenario: No GPU offload

- GIVEN the server spawns with default settings
- WHEN the process arguments are inspected
- THEN `-ngl 0` is present

### Requirement: OpenAI-Compatible Chat API

The runtime MUST expose `/v1/chat/completions` and the app MUST use it for multi-turn chat. Conversation state MUST be held server-side.

#### Scenario: Multi-turn conversation

- GIVEN a chat with several turns
- WHEN the next message is sent
- THEN the response accounts for prior turns in the same conversation

### Requirement: Automatic Start and Shutdown

The app MUST auto-start the LLM server on launch and MUST shut it down when the app exits.

#### Scenario: Start on launch

- GIVEN the app starts
- WHEN the runtime initializes
- THEN the server is spawned and becomes ready before the interview is usable

#### Scenario: Shutdown on exit

- GIVEN the app is running with an active server
- WHEN the app exits
- THEN the server process is terminated

### Requirement: Health and Readiness

The runtime MUST poll an OpenAI-compatible health endpoint before serving traffic and MUST report readiness to the frontend.

#### Scenario: Readiness check

- GIVEN the server process is spawning
- WHEN the health endpoint is polled
- THEN the app reports ready only after the endpoint responds successfully

### Requirement: Orphan Protection

The runtime MUST track the spawned PID, MUST detect stale processes, and MUST NOT terminate processes it did not spawn.

#### Scenario: Crash cleanup

- GIVEN the app crashes
- WHEN the next app launch runs cleanup
- THEN the tracked PID is terminated if still alive, and no unrelated processes are touched

#### Scenario: Stale PID detection

- GIVEN a stale PID from a previous crashed session
- WHEN the app starts
- THEN it verifies and cleans the stale process before spawning a new one
