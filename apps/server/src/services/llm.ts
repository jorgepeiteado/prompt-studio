/**
 * LLM runtime lifecycle (llm-runtime spec "Automatic Start and Shutdown" +
 * "Orphan Protection", design "LLM lifecycle").
 *
 * Spawns the vendored llama-server.exe with an explicit argv array and
 * shell:false. Three paths on start():
 *  1. If /health already answers ok → ADOPT (pid null, adopted true), never kill.
 *  2. Else if a PID file exists → verify identity via a fixed PowerShell WMI
 *     script (the PID is passed as a parameter, never interpolated into shell
 *     syntax); kill ONLY if ExecutablePath equals the vendored binary, else
 *     warn and leave the foreign process untouched.
 *  3. Else spawn.
 *
 * stop() kills only a process this runtime spawned (non-adopted) and removes
 * the PID file. All filesystem/child-process/fetch primitives are injectable
 * so tests never spawn a real binary or touch the network.
 */
export interface PidFileRecord {
  pid: number;
  exePath: string;
  startedAt: string;
}

export interface ChildProcessLike {
  pid: number;
  kill: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

export interface LlmLifecycleDeps {
  binPath: string;
  modelPath: string;
  systemPromptPath: string;
  port: number;
  ctx: number;
  ngl: number;
  healthUrl: string;
  pidFile: string;
  pollIntervalMs: number;
  healthTimeoutMs: number;
  binExists: (path: string) => boolean;
  spawnFn: (file: string, args: string[], opts: Record<string, unknown>) => ChildProcessLike;
  execFile: (file: string, args: string[], cb: (err: Error | null, stdout: string) => void) => void;
  fetchFn: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  killFn: (pid: number) => void;
  readPidFile: () => PidFileRecord | null;
  writePidFile: (rec: PidFileRecord) => void;
  removePidFile: () => void;
  fsExists: (path: string) => boolean;
}

export interface LlmLifecycle {
  start(): Promise<{ pid: number | null; adopted: boolean }>;
  stop(): Promise<void>;
  status(): { ready: boolean; port: number; model: string; adopted: boolean };
}

export function createLlmLifecycle(deps: LlmLifecycleDeps): LlmLifecycle {
  const state: { child?: ChildProcessLike; adopted: boolean; pid: number | null } = {
    adopted: false,
    pid: null,
  };
  let ready = false;

  async function healthOk(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await deps.fetchFn(deps.healthUrl, { signal });
      if (!res.ok) return false;
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      return json.status === "ok";
    } catch {
      return false;
    }
  }

  /** Fixed PowerShell WMI script; the PID is a parameter, never shell text. */
  async function executablePathOf(pid: number): Promise<string> {
    const script =
      'param([int]$TargetPid) (Get-CimInstance Win32_Process -Filter "ProcessId = $TargetPid").ExecutablePath';
    return new Promise<string>((resolve) => {
      deps.execFile("powershell.exe", ["-NoProfile", "-Command", script, "-TargetPid", String(pid)], (err, out) => {
        resolve(err ? "" : out.trim());
      });
    });
  }

  /** Kills the stale PID only when its executable matches the vendored binary. */
  async function cleanupOrphan(): Promise<void> {
    const rec = deps.readPidFile();
    if (!rec) return;
    const exePath = await executablePathOf(rec.pid);
    if (exePath && exePath.toLowerCase() === deps.binPath.toLowerCase()) {
      deps.killFn(rec.pid);
    }
    // A missing or non-matching exePath → foreign process; left untouched.
  }

  async function spawnServer(): Promise<void> {
    const args = [
      "-m", deps.modelPath,
      "-c", String(deps.ctx),
      "-ngl", String(deps.ngl),
      "--port", String(deps.port),
      "--host", "127.0.0.1",
    ];
    const child = deps.spawnFn(deps.binPath, args, { shell: false });
    state.child = child;
    state.pid = child.pid;
    state.adopted = false;
    deps.writePidFile({
      pid: child.pid,
      exePath: deps.binPath,
      startedAt: new Date().toISOString(),
    });
    child.on("exit", () => {
      if (!state.adopted) {
        ready = false;
        deps.removePidFile();
      }
    });
  }

  async function pollUntilReady(): Promise<boolean> {
    if (await healthOk()) return true;
    const deadline = Date.now() + deps.healthTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, deps.pollIntervalMs));
      if (await healthOk()) return true;
    }
    return false;
  }

  return {
    async start() {
      if (!deps.binExists(deps.binPath)) {
        throw new Error(`Vendored llama-server not found at ${deps.binPath}. Start the launcher and retry.`);
      }

      // 1. Adopt a running instance.
      if (await healthOk()) {
        state.adopted = true;
        state.pid = null;
        ready = true;
        return { pid: null, adopted: true };
      }

      // 2. Clean up a stale orphan from a previous crashed session.
      await cleanupOrphan();

      // 3. Spawn a fresh server.
      await spawnServer();
      ready = await pollUntilReady();
      return { pid: state.pid, adopted: false };
    },

    async stop() {
      if (!state.adopted && state.child) {
        state.child.kill();
      }
      state.child = undefined;
      ready = false;
      deps.removePidFile();
    },

    status() {
      return { ready, port: deps.port, model: deps.modelPath, adopted: state.adopted };
    },
  };
}