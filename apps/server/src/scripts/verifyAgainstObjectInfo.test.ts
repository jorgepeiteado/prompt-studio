import { describe, expect, it } from "vitest";
import { WIDGET_NAMES } from "../services/converter";
import { verifyWidgetNames } from "./verifyAgainstObjectInfo";
import type { ObjectInfoEntry } from "./verifyAgainstObjectInfo";

function entry(required: string[], optional: string[] = []): ObjectInfoEntry {
  return {
    input: {
      required: Object.fromEntries(required.map((r) => [r, {}])),
      ...(optional.length > 0 ? { optional: Object.fromEntries(optional.map((o) => [o, {}])) } : {}),
    },
  };
}

const MATCHING_OBJECT_INFO: Record<string, ObjectInfoEntry> = {
  UnetLoaderGGUF: entry(["unet_name"]),
  ModelSamplingAuraFlow: entry(["model", "shift"]),
  // device is optional in current ComfyUI — still an accepted input.
  CLIPLoader: entry(["clip_name", "type"], ["device"]),
  VAELoader: entry(["vae_name"]),
  CLIPTextEncode: entry(["text", "clip"]),
  EmptySD3LatentImage: entry(["width", "height", "batch_size"]),
  KSampler: entry(["model", "positive", "negative", "latent_image", "seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"]),
  SaveImage: entry(["filename_prefix", "images"]),
  ImageScale: entry(["image", "upscale_method", "width", "height", "crop"]),
  UpscaleModelLoader: entry(["model_name"]),
  LoadImage: entry(["image"]),
};

describe("verifyWidgetNames", () => {
  it("reports ok when every class is registered and inputs are required or optional", () => {
    const report = verifyWidgetNames(MATCHING_OBJECT_INFO, WIDGET_NAMES);
    expect(report.ok).toBe(true);
    expect(report.missingClasses).toEqual([]);
    expect(report.missingInputs).toEqual({});
  });

  it("accepts an input that lives in `optional` (CLIPLoader.device)", () => {
    const report = verifyWidgetNames(MATCHING_OBJECT_INFO, WIDGET_NAMES);
    expect(report.missingInputs.CLIPLoader).toBeUndefined();
    expect(report.ok).toBe(true);
  });

  it("flags a class whose inputs drifted (e.g. denoise renamed in KSampler)", () => {
    const drifted = {
      ...MATCHING_OBJECT_INFO,
      KSampler: entry(["model", "seed", "steps", "cfg", "sampler_name", "scheduler", "positive", "negative", "latent_image"]),
    };
    const report = verifyWidgetNames(drifted, WIDGET_NAMES);
    expect(report.ok).toBe(false);
    expect(report.missingInputs.KSampler).toContain("denoise");
  });

  it("flags a class that is missing entirely from object_info", () => {
    const missing = { ...MATCHING_OBJECT_INFO };
    delete missing.ImageScale;
    const report = verifyWidgetNames(missing, WIDGET_NAMES);
    expect(report.ok).toBe(false);
    expect(report.missingClasses).toContain("ImageScale");
  });

  it("covers every entry of the WIDGET_NAMES table", () => {
    const report = verifyWidgetNames(MATCHING_OBJECT_INFO, WIDGET_NAMES);
    expect(report.ok).toBe(true);
    const covered = new Set([...Object.keys(MATCHING_OBJECT_INFO)]);
    for (const className of Object.keys(WIDGET_NAMES)) {
      expect(covered.has(className)).toBe(true);
    }
  });
});
