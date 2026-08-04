import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConversionError, convert } from "./converter";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const TEMPLATE_PATH = join(REPO_ROOT, "assets", "workflows", "workflow_fotorealista_qwen.json");
const GOLDEN_PATH = join(REPO_ROOT, "assets", "fixtures", "fotorealista.api.golden.json");

const CANONICAL_OPTS = {
  prompt: "golden test prompt",
  width: 1024,
  height: 1024,
  seed: 12345,
  steps: 20,
  cfg: 2.5,
  batchSize: 1,
};

function loadTemplate(): unknown {
  return JSON.parse(readFileSync(TEMPLATE_PATH, "utf8"));
}

function loadGolden(): unknown {
  return JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
}

function sha256Of(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

describe("converter golden", () => {
  it("deep-equals the committed golden snapshot for canonical opts", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    expect(output).toEqual(loadGolden());
  });

  it("is read-only: the template file on disk is byte-identical after conversion", () => {
    const before = sha256Of(TEMPLATE_PATH);
    convert(loadTemplate(), CANONICAL_OPTS);
    const after = sha256Of(TEMPLATE_PATH);
    expect(after).toBe(before);
  });
});

describe("converter node selection", () => {
  it("drops the LLMTextProcessor (5), muted img2img (16-26) and Note nodes (27-28)", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    for (const dropped of ["5", "16", "17", "20", "22", "26", "27", "28"]) {
      expect(output[dropped]).toBeUndefined();
    }
  });

  it("keeps the txt2img and upscale branch (1,2,3,4,6,7,8,9,10,11,12,13,14,15)", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    const kept = ["1", "2", "3", "4", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
    for (const id of kept) {
      expect(output[id]).toBeDefined();
    }
    expect(Object.keys(output)).toHaveLength(kept.length);
  });

  it("keeps the upscale branch classes with template widget values", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    expect(output["12"].class_type).toBe("UpscaleModelLoader");
    expect(output["12"].inputs.model_name).toBe("4x-UltraSharp.pth");
    expect(output["13"].class_type).toBe("ImageUpscaleWithModel");
    expect(output["14"].class_type).toBe("ImageScale");
    expect(output["14"].inputs.upscale_method).toBe("lanczos");
    expect(output["14"].inputs.crop).toBe("disabled");
    expect(output["15"].inputs.filename_prefix).toBe("qwen_txt_hd");
  });
});

describe("converter injection points", () => {
  it("injects the final prompt into node 6 CLIPTextEncode text", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    expect(output["6"].inputs.text).toBe("golden test prompt");
  });

  it("keeps the fixed negative prompt from the template in node 7", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    const negative = (output["7"].inputs as { text: string }).text;
    expect(negative.length).toBeGreaterThan(50);
    expect(negative).toContain("plastic skin");
  });

  it("injects resolution and batch into node 8 EmptySD3LatentImage", () => {
    const output = convert(loadTemplate(), { ...CANONICAL_OPTS, width: 576, height: 1024, batchSize: 2 });
    expect(output["8"].inputs).toMatchObject({ width: 576, height: 1024, batch_size: 2 });
  });

  it("injects per-variation params into node 9 KSampler with defaults", () => {
    const output = convert(loadTemplate(), { ...CANONICAL_OPTS, seed: 777, steps: 30, cfg: 4, denoise: 0.9 });
    expect(output["9"].inputs).toMatchObject({
      seed: 777,
      steps: 30,
      cfg: 4,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 0.9,
    });
  });
});

describe("converter link references", () => {
  it("resolves kept-source links to [srcId, srcSlot] references", () => {
    const output = convert(loadTemplate(), CANONICAL_OPTS);
    expect(output["2"].inputs.model).toEqual(["1", 0]);
    expect(output["6"].inputs.clip).toEqual(["3", 0]);
    expect(output["9"].inputs.positive).toEqual(["6", 0]);
    expect(output["10"].inputs.samples).toEqual(["9", 0]);
    expect(output["10"].inputs.vae).toEqual(["4", 0]);
    expect(output["11"].inputs.images).toEqual(["10", 0]);
    expect(output["13"].inputs.image).toEqual(["10", 0]);
  });
});

describe("converter dropped-source contract", () => {
  it("throws ConversionError when a kept node links to a dropped non-injection source", () => {
    const synthetic = {
      nodes: [
        { id: 1, type: "CLIPTextEncode", mode: 0, inputs: [{ name: "text", link: 1 }], widgets_values: [null] },
        { id: 2, type: "CLIPTextEncode", mode: 2, inputs: [], widgets_values: ["muted source"] },
      ],
      links: [[1, 2, 0, 1, 0, "STRING"]],
    };
    expect(() => convert(synthetic, CANONICAL_OPTS)).toThrow(ConversionError);
  });
});

describe("converter img2img (optional, off by default)", () => {
  it("keeps the img2img branch when enabled and sets the uploaded source image", () => {
    const output = convert(loadTemplate(), {
      ...CANONICAL_OPTS,
      img2img: { enabled: true, filename: "uploaded.png" },
    });
    expect(output["16"]).toBeDefined();
    expect(output["16"].class_type).toBe("LoadImage");
    expect(output["16"].inputs.image).toBe("uploaded.png");
    expect(output["20"]).toBeDefined();
    // KSampler 20 keeps the template denoise 0.45; node 5 stays dropped.
    expect(output["20"].inputs.denoise).toBe(0.45);
    expect(output["20"].inputs.model).toEqual(["2", 0]);
    expect(output["5"]).toBeUndefined();
  });
});
