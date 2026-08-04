import type { AspectRatio, ChatMessage, ImageRow, RunStatus } from "./types.js";

/** POST /api/generate request body. */
export interface GenerateRequestDto {
  prompt: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  width: number;
  height: number;
  aspect?: AspectRatio;
  variations: number;
  img2img?: Img2ImgDto;
}

/** Optional img2img branch — OFF by default. */
export interface Img2ImgDto {
  enabled: boolean;
  /** Uploaded filename as stored in ComfyUI's input dir. */
  filename?: string;
}

/** 202 response for POST /api/generate and POST /api/regenerate. */
export interface GenerateResponseDto {
  runId: string;
  promptIds: string[];
}

/** Unified error envelope: {error: {code, message, details?}}. */
export interface ErrorDto {
  error: {
    code: number;
    message: string;
    details?: unknown;
  };
}

/** Gallery list item. */
export interface RunSummaryDto {
  id: string;
  createdAt: string;
  status: RunStatus;
  prompt: string;
  aspect?: string;
  variations: number;
  thumbnail: string | null;
}

/** Full run detail for the gallery detail view. */
export interface RunDetailDto {
  id: string;
  createdAt: string;
  status: RunStatus;
  prompt: string;
  negativePrompt: string | null;
  params: {
    seed: number;
    steps: number;
    cfg: number;
    samplerName: string;
    scheduler: string;
    width: number;
    height: number;
    aspect?: string;
    denoise?: number;
  };
  seeds: number[];
  promptIds: string[];
  chat: ChatMessage[];
  images: ImageRow[];
  error: string | null;
}
