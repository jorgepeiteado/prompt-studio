/**
 * UI→API workflow conversion (comfyui-integration spec, design decision
 * "UI→API conversion"): a deterministic pure function that turns the committed
 * LiteGraph template into the flat ComfyUI `/prompt` payload.
 *
 * - Drops muted nodes (mode !== 0), Note nodes and the LLMTextProcessor (5).
 * - Resolves links to ["srcNodeId", srcSlot] references when the source is kept.
 * - The ONLY allowed dropped-source link is node 6 text ← node 5 (the injection
 *   point, replaced by the configured final prompt); any other dropped-source
 *   link throws ConversionError.
 * - Widgets map to API input names via WIDGET_NAMES (dropping the non-API
 *   control_after_generate "randomize" entry).
 * - Injection (overrides the template): node 6 text = final prompt; node 8
 *   width/height/batch_size; node 9 KSampler seed/steps/cfg/sampler/scheduler/denoise.
 * - Optional img2img keeps nodes 16–26 (mode ignored), sets node 16 image =
 *   uploaded filename, and leaves KSampler 20 at its template denoise 0.45.
 */
import type { AspectRatio } from "@promptstudio/shared";

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

export interface ConvertOptions {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
  batchSize?: number;
  aspect?: AspectRatio;
  img2img?: { enabled: boolean; filename?: string };
  /**
   * Keep the HD/4K upscale branch (nodes 12–15, SaveImage 15 `qwen_txt_hd`).
   * OFF by default: the run produces only the base 1024 image (SaveImage 11
   * `qwen_txt`) and nodes 12–15 are dropped from the submitted workflow.
   */
  upscale?: boolean;
}

export interface ApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

/** Flat payload accepted by POST /prompt: {"nodeId": {class_type, inputs}}. */
export type ApiWorkflow = Record<string, ApiNode>;

interface TemplateNodeInput {
  name: string;
  link: number | null;
}

interface TemplateNode {
  id: number;
  type: string;
  mode?: number;
  inputs: TemplateNodeInput[];
  widgets_values?: unknown[];
}

/** [linkId, srcNodeId, srcSlot, dstNodeId, dstSlot, type] */
type TemplateLink = [number, number, number, number, number, string];

export interface Template {
  nodes: TemplateNode[];
  links: TemplateLink[];
}

/**
 * Widgets → API input names, per class. Entries are in `widgets_values` order
 * minus the non-API `control_after_generate` entry.
 *
 * NOTE: this table extends design.md's list with `UpscaleModelLoader`
 * (template node 12 carries a widget value that must map to ComfyUI's
 * `model_name` API input) and `LoadImage` (img2img node 16 `image`) — without
 * them the payload would be invalid for ComfyUI.
 */
export const WIDGET_NAMES: Record<string, string[]> = {
  UnetLoaderGGUF: ["unet_name"],
  ModelSamplingAuraFlow: ["shift"],
  CLIPLoader: ["clip_name", "type", "device"],
  VAELoader: ["vae_name"],
  CLIPTextEncode: ["text"],
  EmptySD3LatentImage: ["width", "height", "batch_size"],
  KSampler: ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
  SaveImage: ["filename_prefix"],
  ImageScale: ["upscale_method", "width", "height", "crop"],
  UpscaleModelLoader: ["model_name"],
  LoadImage: ["image"],
};

export const DEFAULT_PARAMS = {
  steps: 20,
  cfg: 2.5,
  samplerName: "euler",
  scheduler: "simple",
  denoise: 1,
} as const;

function isKept(
  node: TemplateNode,
  img2imgEnabled: boolean,
  upscaleEnabled: boolean,
): boolean {
  if (node.type === "Note") return false;
  if (node.id === 5) return false; // LLMTextProcessor — replaced by the app's interview
  // Upscale branch (12–15) is optional; dropped unless explicitly requested.
  if (!upscaleEnabled && node.id >= 12 && node.id <= 15) return false;
  return node.mode === 0 || img2imgEnabled;
}

/** Injects configured values into the output node; overrides template widgets. */
function inject(
  id: number,
  inputs: Record<string, unknown>,
  opts: ConvertOptions,
): void {
  if (id === 6) {
    inputs.text = opts.prompt;
  } else if (id === 8) {
    inputs.width = opts.width;
    inputs.height = opts.height;
    inputs.batch_size = opts.batchSize ?? 1;
  } else if (id === 9) {
    inputs.seed = opts.seed;
    inputs.steps = opts.steps ?? DEFAULT_PARAMS.steps;
    inputs.cfg = opts.cfg ?? DEFAULT_PARAMS.cfg;
    inputs.sampler_name = opts.samplerName ?? DEFAULT_PARAMS.samplerName;
    inputs.scheduler = opts.scheduler ?? DEFAULT_PARAMS.scheduler;
    inputs.denoise = opts.denoise ?? DEFAULT_PARAMS.denoise;
  } else if (id === 16 && opts.img2img?.enabled) {
    inputs.image = opts.img2img.filename ?? "";
  }
}

export function convert(template: Template, opts: ConvertOptions): ApiWorkflow {
  const img2imgEnabled = opts.img2img?.enabled === true;
  const upscaleEnabled = opts.upscale === true;

  const nodesById = new Map<number, TemplateNode>();
  for (const node of template.nodes) nodesById.set(node.id, node);

  const linksById = new Map<number, TemplateLink>();
  for (const link of template.links) linksById.set(link[0], link);

  const output: ApiWorkflow = {};
  const keptIds = new Set<number>();

  const sorted = [...template.nodes]
    .filter((node) => isKept(node, img2imgEnabled, upscaleEnabled))
    .sort((a, b) => a.id - b.id);
  for (const node of sorted) keptIds.add(node.id);

  for (const node of sorted) {
    const inputs: Record<string, unknown> = {};

    for (const entry of node.inputs) {
      if (entry.link === null) continue;
      const link = linksById.get(entry.link);
      if (!link) {
        throw new ConversionError(`Link ${entry.link} of node ${node.id} does not exist.`);
      }
      const [linkId, srcId, srcSlot] = link;
      if (keptIds.has(srcId)) {
        inputs[entry.name] = [String(srcId), srcSlot];
      } else if (node.id === 6 && entry.name === "text" && srcId === 5) {
        // Injection point: node 6 text was fed by the dropped LLM node.
        // Replaced by the configured final prompt in the injection step.
      } else {
        throw new ConversionError(
          `Dropped-source link ${linkId} (node ${srcId}) feeds ${node.id}.${entry.name} and is not a supported injection point.`,
        );
      }
    }

    const widgetNames = WIDGET_NAMES[node.type];
    const apiValues = (node.widgets_values ?? []).filter((v) => v !== "randomize");
    if (widgetNames) {
      for (const [i, name] of widgetNames.entries()) {
        const value = apiValues[i];
        if (value !== undefined) inputs[name] = value;
      }
    }

    inject(node.id, inputs, opts);
    output[String(node.id)] = { class_type: node.type, inputs };
  }

  return output;
}
