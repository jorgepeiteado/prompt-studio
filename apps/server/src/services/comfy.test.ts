import { describe, expect, it, vi } from "vitest";
import { ComfyClient, ComfyUnreachableError } from "./comfy";
import type { ApiWorkflow } from "./converter";

const SAMPLE_WORKFLOW: ApiWorkflow = {
  "6": { class_type: "CLIPTextEncode", inputs: { text: "prompt" } },
  "9": { class_type: "KSampler", inputs: { seed: 1 } },
  "11": { class_type: "SaveImage", inputs: { filename_prefix: "qwen_txt" } },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ComfyClient", () => {
  it("submits a workflow to POST /prompt and returns the prompt_id", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ prompt_id: "abc-123" }));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    const promptId = await client.submitPrompt(SAMPLE_WORKFLOW);
    expect(promptId).toBe("abc-123");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:8188/prompt",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prompt: SAMPLE_WORKFLOW }),
      }),
    );
  });

  it("surfaces a 502 ComfyUnreachableError when the fetch throws (network down)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    await expect(client.submitPrompt(SAMPLE_WORKFLOW)).rejects.toBeInstanceOf(ComfyUnreachableError);
  });

  it("surfaces a 502 when ComfyUI answers a non-OK status", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    await expect(client.submitPrompt(SAMPLE_WORKFLOW)).rejects.toBeInstanceOf(ComfyUnreachableError);
  });

  it("fetches history for a prompt_id", async () => {
    const historyEntry = {
      "abc-123": { status: { status_str: "success", completed: true }, outputs: {} },
    };
    const fetchFn = vi.fn(async () => jsonResponse(historyEntry));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    const entry = await client.getHistory("abc-123");
    expect(entry).not.toBeNull();
    expect(entry!.status.completed).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:8188/history/abc-123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns null history when ComfyUI has no entry yet", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    expect(await client.getHistory("missing")).toBeNull();
  });

  it("throws ComfyExecutionError with failing node and message on execution_error", async () => {
    const historyEntry = {
      "abc-123": {
        status: {
          status_str: "error",
          completed: false,
          messages: [
            {
              type: "execution_error",
              data: { node_id: 9, node_type: "KSampler", exception_message: "boom" },
            },
          ],
        },
        outputs: {},
      },
    };
    const fetchFn = vi.fn(async () => jsonResponse(historyEntry));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    await expect(client.getHistory("abc-123")).rejects.toMatchObject({
      nodeId: 9,
      nodeType: "KSampler",
      message: expect.stringContaining("boom"),
    });
  });

  it("fetches image bytes via GET /view", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const fetchFn = vi.fn(
      async () => new Response(pngBytes, { status: 200, headers: { "Content-Type": "image/png" } }),
    );
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    const buf = await client.getImage("img_00001_.png", "output", "output");
    expect(buf).toEqual(Buffer.from(pngBytes));
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/view"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("gets object_info and system_stats", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ SaveImage: { input: { required: {} } } }))
      .mockResolvedValueOnce(jsonResponse({ system: { comfyui_version: "0.29.2" } }));
    const client = new ComfyClient({ baseUrl: "http://127.0.0.1:8188", fetchFn });
    const objectInfo = await client.getObjectInfo();
    expect(objectInfo).toHaveProperty("SaveImage");
    const stats = await client.getSystemStats();
    expect(stats).toMatchObject({ system: { comfyui_version: "0.29.2" } });
  });
});
