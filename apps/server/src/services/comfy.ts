/**
 * ComfyUI HTTP client (comfyui-integration spec "Submit and Poll"): POST
 * /prompt, GET /history/{id}, GET /view, GET /object_info, GET /system_stats.
 *
 * - A network failure or a non-OK HTTP status is surfaced as
 *   ComfyUnreachableError (API code 502).
 * - A node-execution error inside a history entry is surfaced as
 *   ComfyExecutionError carrying the failing node id, node type and message.
 * - fetch is injectable so tests never touch the network.
 */
import type { ApiWorkflow } from "./converter";

export interface ComfyClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class ComfyUnreachableError extends Error {
  readonly code = 502;
  constructor(message: string) {
    super(message);
    this.name = "ComfyUnreachableError";
  }
}

export class ComfyExecutionError extends Error {
  readonly code = 500;
  constructor(
    readonly nodeId: number | string,
    readonly nodeType: string,
    message: string,
  ) {
    super(message);
    this.name = "ComfyExecutionError";
  }
}

export interface ComfyHistoryStatus {
  status_str: string;
  completed: boolean;
  messages?: Array<{ type: string; data?: Record<string, unknown> }>;
}

export interface ComfyImageOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistoryEntry {
  status: ComfyHistoryStatus;
  outputs?: Record<string, { images?: ComfyImageOutput[] }>;
}

export class ComfyClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: ComfyClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** POST /prompt — returns the ComfyUI prompt_id for the workflow. */
  async submitPrompt(workflow: ApiWorkflow): Promise<string> {
    const body = JSON.stringify({ prompt: workflow });
    const res = await this.request("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json = (await res.json()) as { prompt_id?: string };
    if (!json.prompt_id) {
      throw new ComfyUnreachableError("ComfyUI /prompt returned no prompt_id.");
    }
    return json.prompt_id;
  }

  /** GET /history/{promptId} — null while the entry does not exist yet. */
  async getHistory(promptId: string): Promise<ComfyHistoryEntry | null> {
    const res = await this.request(`/history/${encodeURIComponent(promptId)}`, {
      method: "GET",
    });
    const json = (await res.json()) as Record<string, ComfyHistoryEntry>;
    const entry = json[promptId];
    if (!entry) return null;

    const errorMessage = entry.status.messages?.find((m) => m.type === "execution_error");
    if (errorMessage) {
      const data = (errorMessage.data ?? {}) as {
        node_id?: number | string;
        node_type?: string;
        exception_message?: string;
      };
      throw new ComfyExecutionError(
        data.node_id ?? "?",
        data.node_type ?? "unknown",
        `Node ${data.node_type ?? "?"} failed: ${data.exception_message ?? "unknown error"}`,
      );
    }
    return entry;
  }

  /** GET /view — fetches generated image bytes. */
  async getImage(filename: string, subfolder = "", type = "output"): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const res = await this.request(`/view?${params.toString()}`, { method: "GET" });
    return Buffer.from(await res.arrayBuffer());
  }

  /** GET /object_info — registered node classes and inputs. */
  async getObjectInfo(): Promise<Record<string, unknown>> {
    const res = await this.request("/object_info", { method: "GET" });
    return (await res.json()) as Record<string, unknown>;
  }

  /** GET /system_stats — reachability + version. */
  async getSystemStats(): Promise<{ system?: { comfyui_version?: string } }> {
    const res = await this.request("/system_stats", { method: "GET" });
    return (await res.json()) as { system?: { comfyui_version?: string } };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ComfyUnreachableError(
        `ComfyUI is unreachable at ${this.baseUrl} (${path}). Start the launcher and retry.`,
      );
    }
    if (!res.ok) {
      throw new ComfyUnreachableError(
        `ComfyUI answered ${res.status} at ${path} (${res.statusText}).`,
      );
    }
    return res;
  }
}
