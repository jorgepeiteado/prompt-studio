# ComfyUI Integration Specification

## Purpose

CORS-safe bridge to the local ComfyUI (`http://127.0.0.1:8188`, v0.29.2, no CORS headers): a backend proxy plus a deterministic conversion of the reference UI-format workflow into the API-format submission, with progress and image retrieval.

## Requirements

### Requirement: Backend Proxy (CORS)

The browser MUST NOT call ComfyUI directly. The server MUST proxy ComfyUI HTTP endpoints (`/prompt`, `/history/{id}`, `/view`, `/object_info`, `/system_stats`).

#### Scenario: Browser cannot reach ComfyUI

- GIVEN ComfyUI responds with no `Access-Control-Allow-Origin` (verified 403 on preflight)
- WHEN the frontend calls `/system_stats` via the proxy
- THEN the proxy returns the data successfully

### Requirement: Workflow Template

The system MUST use `workflow_fotorealista_qwen.json` (UI/LiteGraph format) as the read-only conversion source. The template file MUST be copied into the app and never edited in place.

#### Scenario: Template immutability

- GIVEN the template is loaded at conversion time
- WHEN the app converts it
- THEN the original workflow file on disk is byte-identical after conversion

### Requirement: UI→API Format Conversion

The system MUST convert the UI workflow to API format: flat `{node_id: {class_type, inputs}}`; widget values moved into `inputs`; links replaced by `["src_node_id", src_slot]` input references; muted nodes (`mode != 0`) dropped; the LLMTextProcessor node (5) dropped; the img2img branch (nodes 16–26, muted) dropped; the upscale branch (12–15) kept.

#### Scenario: Conversion of a muted branch

- GIVEN the template with img2img nodes 16–26 muted and LLM node 5
- WHEN the workflow is converted
- THEN nodes 5 and 16–26 are absent and remaining links are resolved to input references

#### Scenario: Link-to-input reference

- GIVEN CLIPTextEncode node 6 receives text via link 6 from the LLM node
- WHEN converted
- THEN node 6 inputs `text` references the LLM slot at conversion time and the value is later replaced by the final prompt

### Requirement: Injection Points

The system MUST set: node 6 CLIPTextEncode positive `text` = final prompt; node 7 negative prompt fixed (template value); node 8 EmptySD3LatentImage `width`/`height`/`batch_size` = selected resolution and batch; node 9 KSampler `seed` = per-variation seed, with template defaults steps 20, cfg 2.5, sampler `euler`, scheduler `simple`, denoise 1.0.

#### Scenario: Valid submission payload

- GIVEN a final prompt, resolution 1024×1024, batch 4, four seeds
- WHEN the payload is built
- THEN node 6 text equals the final prompt, node 8 matches resolution, node 9 seed differs per variation

### Requirement: Submit and Poll

The system MUST POST the API-format workflow to `/prompt`, receive a `prompt_id`, and poll `/history/{prompt_id}` until completion. Errors MUST be surfaced with the failing node and message.

#### Scenario: Successful generation

- GIVEN a valid payload and running ComfyUI
- WHEN the workflow is submitted and polled
- THEN a completed history entry with output images is returned

#### Scenario: Node execution error

- GIVEN a payload referencing an unknown node class
- WHEN the workflow is submitted
- THEN the proxy surfaces the error including failing node and message

### Requirement: Image Retrieval

The system MUST retrieve generated images via the ComfyUI `/view` endpoint and serve them to the frontend.

#### Scenario: Fetch saved image

- GIVEN a completed history entry with output image filenames
- WHEN the app requests `/view` for a filename
- THEN the image bytes are returned and displayed

### Requirement: Progress Streaming (SSE)

The system SHOULD forward ComfyUI WebSocket progress events (`ws://127.0.0.1:8188/ws`) to the frontend as Server-Sent Events.

#### Scenario: Progress updates

- GIVEN an active generation
- WHEN the ComfyUI WebSocket emits progress
- THEN the frontend receives matching SSE progress events

### Requirement: Conversion Verification

The conversion MUST be verified against the live `/object_info` (registered classes and required inputs) and MUST have golden tests comparing converted output for known templates.

#### Scenario: Golden test

- GIVEN a template fixture
- WHEN the converter runs
- THEN its output equals the committed golden API-format snapshot
