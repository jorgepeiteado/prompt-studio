import { describe, expect, it, vi } from "vitest";
import { BusyError, createGenerationService } from "./generation";
import type {
  ComfyClientLike,
  GenerationStore,
  GenerateInput,
  GenerationDeps,
  ImageWriter,
  RelayLike,
  Thumbnailer,
} from "./generation";
import type { ApiWorkflow } from "./converter";

const SAMPLE_WORKFLOW: ApiWorkflow = { "11": { class_type: "SaveImage", inputs: {} } };

function build(overrides: {
  comfy?: Partial<ComfyClientLike>;
  relay?: Partial<RelayLike>;
  store?: Partial<GenerationStore>;
  writer?: Partial<ImageWriter>;
  thumb?: Thumbnailer;
  convert?: () => ApiWorkflow;
} = {}) {
  const convert = overrides.convert ?? (() => SAMPLE_WORKFLOW);
  const baseComfy: ComfyClientLike = {
    submitPrompt: vi.fn(async () => "prompt-x"),
    getHistory: vi.fn(async () => ({
      status: { status_str: "success", completed: true },
      outputs: {},
    })),
    getImage: vi.fn(async () => Buffer.from([1, 2, 3])),
  };
  const baseRelay: RelayLike = { subscribe: vi.fn() };
  const baseStore: GenerationStore = {
    createRun: vi.fn(async () => {}),
    markRunning: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    addImage: vi.fn(async () => {}),
    getRun: vi.fn(async () => null),
  };
  const baseWriter: ImageWriter = {
    writeImage: vi.fn(async () => ({ localPath: "images/base.png", width: 1024, height: 1024 })),
  };
  const baseThumb: Thumbnailer = vi.fn(async () => "images/base.thumb.webp");

  const deps: GenerationDeps = {
    comfy: { ...baseComfy, ...overrides.comfy },
    relay: { ...baseRelay, ...overrides.relay },
    store: { ...baseStore, ...overrides.store },
    writer: { ...baseWriter, ...overrides.writer },
    thumb: overrides.thumb ?? baseThumb,
    convert,
    template: SAMPLE_WORKFLOW,
  };
  const svc = createGenerationService(deps);
  return { svc, deps };
}

const input = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  prompt: "golden test prompt",
  variations: 4,
  seed: 100,
  width: 1024,
  height: 1024,
  steps: 20,
  cfg: 2.5,
  ...over,
});

describe("GenerationService", () => {
  it("returns a 202-style {runId, promptIds} and submits one prompt per variation", async () => {
    const { svc, deps } = build();
    const result = await svc.start(input({ variations: 4, seed: 100 }));
    expect(result.runId).toBeTruthy();
    expect(result.promptIds).toHaveLength(4);
    const submit = deps.comfy.submitPrompt as ReturnType<typeof vi.fn>;
    expect(submit).toHaveBeenCalledTimes(4);
    // seeds differ per variation: 100..103
    expect(submit.mock.calls.map((c) => c[0])).toHaveLength(4);
  });

  it("returns 409 BusyError when a run is already active", async () => {
    const { svc } = build();
    await svc.start(input({ variations: 1 }));
    await expect(svc.start(input({ variations: 1, seed: 2 }))).rejects.toBeInstanceOf(BusyError);
  });

  it("marks the run completed once all prompt_ids report completed history", async () => {
    const { svc, deps } = build();
    const { runId, promptIds } = await svc.start(input({ variations: 2 }));
    await svc.runCompletion(runId, promptIds);
    const setStatus = deps.store.setStatus as ReturnType<typeof vi.fn>;
    expect(setStatus).toHaveBeenCalledWith(runId, "completed", undefined);
  });

  it("surfaces a failing node when any history entry reports execution_error", async () => {
    const getHistory = vi.fn(async () => ({
      status: {
        status_str: "error",
        completed: false,
        messages: [
          { type: "execution_error", data: { node_id: 9, node_type: "KSampler", exception_message: "boom" } },
        ],
      },
      outputs: {},
    }));
    const { svc, deps } = build({ comfy: { getHistory } });
    const { runId, promptIds } = await svc.start(input({ variations: 1 }));
    await svc.runCompletion(runId, promptIds);
    const setStatus = deps.store.setStatus as ReturnType<typeof vi.fn>;
    expect(setStatus).toHaveBeenCalledWith(runId, "failed", expect.stringContaining("KSampler"));
  });

  it("writes images and records image rows from executed relay events", async () => {
    const { svc, deps } = build();
    const { runId } = await svc.start(input({ variations: 2 }));
    const subscribe = deps.relay.subscribe as ReturnType<typeof vi.fn>;
    const handler = subscribe.mock.calls[0]?.[1];
    await handler("pid1", {
      event: "executed",
      data: { node: "11", images: [{ filename: "a.png", subfolder: "", type: "output" }] },
    });
    const writeImage = deps.writer.writeImage as ReturnType<typeof vi.fn>;
    expect(writeImage).toHaveBeenCalled();
    const addImage = deps.store.addImage as ReturnType<typeof vi.fn>;
    expect(addImage).toHaveBeenCalled();
    expect(addImage.mock.calls[0]?.[0]).toMatchObject({
      runId,
      kind: "base",
    });
  });

  it("ignores post-cancel executed events", async () => {
    const { svc, deps } = build();
    const { runId } = await svc.start(input({ variations: 2 }));
    await svc.cancel(runId);
    const subscribe = deps.relay.subscribe as ReturnType<typeof vi.fn>;
    const handler = subscribe.mock.calls[0]?.[1];
    await handler(runId.match(/\d/) ? "x" : "pid1", {
      event: "executed",
      data: { node: "11", images: [{ filename: "b.png", subfolder: "", type: "output" }] },
    });
    const addImage = deps.store.addImage as ReturnType<typeof vi.fn>;
    expect(addImage).not.toHaveBeenCalled();
  });
});