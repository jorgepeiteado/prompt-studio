/**
 * Server configuration (design "config.ts — env defaults", loopback binds
 * documented). Values come from process.env with these defaults. Loopback-only
 * bind (127.0.0.1) is enforced here so the local Hono server never exposes
 * itself on the network.
 */
export const LOOPBACK_HOST = "127.0.0.1";

export interface ServerConfig {
  serverPort: number;
  host: string;
  dataDir: string;
  dbPath: string;
  imagesDir: string;
  comfyUrl: string;
  comfyWsUrl: string;
  llmPort: number;
  llmBin: string;
  llmModel: string;
  llmSystemPrompt: string;
  llmCtx: number;
  llmNgl: number;
  llmPidFile: string;
  llmHealthTimeoutMs: number;
}

/** Reads env values once and returns a frozen config object. */
export function getConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DATA_DIR ?? "data";
  const comfyPort = env.COMFYUI_PORT ?? "8188";
  const comfyUrl = env.COMFYUI_URL ?? `http://127.0.0.1:${comfyPort}`;
  const llmPort = Number(env.LLAMA_PORT ?? 8080);

  return Object.freeze({
    serverPort: Number(env.SERVER_PORT ?? 8787),
    host: LOOPBACK_HOST,
    dataDir,
    dbPath: env.DB_PATH ?? `${dataDir}/prompt-studio.db`,
    imagesDir: `${dataDir}/images`,
    comfyUrl,
    comfyWsUrl: env.COMFY_WS_URL ?? `ws://127.0.0.1:${comfyPort}/ws`,
    llmPort,
    llmBin: env.LLM_BIN ?? "",
    llmModel: env.LLM_MODEL ?? "",
    llmSystemPrompt: env.LLM_SYSTEM_PROMPT ?? "",
    llmCtx: Number(env.LLM_CTX ?? 8192),
    llmNgl: Number(env.LLM_NGL ?? 0),
    llmPidFile: `${dataDir}/.llm.pid`,
    llmHealthTimeoutMs: Number(env.LLM_HEALTH_TIMEOUT_MS ?? 120000),
  });
}