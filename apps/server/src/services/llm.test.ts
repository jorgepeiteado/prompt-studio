import { describe, expect, it, vi } from "vitest";
import { createLlmLifecycle } from "./llm";
import type { LlmLifecycleDeps } from "./llm";

function fakeChild() {
  return { on: vi.fn(), pid: 7777, kill: vi.fn() };
}

function buildDeps(over: Partial<LlmLifecycleDeps> = {}): LlmLifecycleDeps {
  const base: LlmLifecycleDeps = {
    binPath: "C:\\vendor\\llama-server.exe",
    modelPath: "C:\\models\\Qwen3-4B.gguf",
    systemPromptPath: "C:\\models\\director_fotografico.txt",
    port: 8080,
    ctx: 8192,
    ngl: 0,
    healthUrl: "http://127.0.0.1:8080/health",
    pidFile: "data/.llm.pid",
    pollIntervalMs: 5,
    healthTimeoutMs: 30,
    binExists: vi.fn(() => true),
    spawnFn: vi.fn(() => fakeChild()),
    execFile: vi.fn((_file: string, _args: string[], cb: (e: Error | null, out: string) => void) => cb(null, "")),
    fetchFn: vi.fn(async () => new Response(JSON.stringify({ status: "error" }), { status: 503 })),
    killFn: vi.fn(),
    readPidFile: vi.fn(() => null),
    writePidFile: vi.fn(),
    removePidFile: vi.fn(),
    fsExists: vi.fn(() => true),
  };
  return { ...base, ...over };
}

describe("llm lifecycle (threat matrix)", () => {
  it("spawns with shell:false and the exact argv when nothing is listening or tracked", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    const deps = buildDeps({
      spawnFn,
      fetchFn: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const llm = await createLlmLifecycle(deps);
    const result = await llm.start();
    expect(result).toEqual({ pid: 7777, adopted: false });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [file, args, opts] = spawnFn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(file).toContain("llama-server.exe");
    expect(args).toEqual([
      "-m", deps.modelPath,
      "-c", String(deps.ctx),
      "-ngl", String(deps.ngl),
      "--port", String(deps.port),
      "--host", "127.0.0.1",
    ]);
    expect(opts.shell).toBe(false);
  });

  it("adopts an already-listening instance and never spawns or kills", async () => {
    const spawnFn = vi.fn(() => fakeChild());
    const killFn = vi.fn();
    const deps = buildDeps({
      spawnFn,
      killFn,
      fetchFn: vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })),
      readPidFile: vi.fn(() => ({ pid: 111, startedAt: new Date().toISOString(), exePath: deps.binPath as string })),
    });
    const llm = await createLlmLifecycle(deps);
    const result = await llm.start();
    expect(result).toEqual({ pid: null, adopted: true });
    expect(spawnFn).not.toHaveBeenCalled();
    expect(killFn).not.toHaveBeenCalled();
  });

  it("kills only the PID whose WMI ExecutablePath equals the vendored binary", async () => {
    const killFn = vi.fn();
    const deps = buildDeps({
      killFn,
      fetchFn: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      readPidFile: vi.fn(() => ({ pid: 222, startedAt: new Date().toISOString(), exePath: deps.binPath })),
      execFile: vi.fn((_file: string, _args: string[], cb: (e: Error | null, out: string) => void) =>
        cb(null, "C:\\vendor\\llama-server.exe\n"),
      ),
      spawnFn: vi.fn(() => fakeChild()),
    });
    const llm = await createLlmLifecycle(deps);
    await llm.start();
    expect(killFn).toHaveBeenCalledWith(222);
  });

  it("leaves a foreign PID untouched (ExecutablePath does not match)", async () => {
    const killFn = vi.fn();
    const deps = buildDeps({
      killFn,
      fetchFn: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      readPidFile: vi.fn(() => ({ pid: 999, startedAt: new Date().toISOString(), exePath: "C:\\Windows\\System32\\notepad.exe" })),
      execFile: vi.fn((_file: string, _args: string[], cb: (e: Error | null, out: string) => void) =>
        cb(null, ""),
      ),
      spawnFn: vi.fn(() => fakeChild()),
    });
    const llm = await createLlmLifecycle(deps);
    await llm.start();
    expect(killFn).not.toHaveBeenCalled();
  });

  it("fails clearly when the vendored binary is missing", async () => {
    const deps = buildDeps({ binExists: vi.fn(() => false) });
    const llm = await createLlmLifecycle(deps);
    await expect(llm.start()).rejects.toThrow(/llama-server\.exe/);
  });

  it("reports readiness/status and cleans up the PID file on stop", async () => {
    const removePidFile = vi.fn();
    const deps = buildDeps({
      removePidFile,
      fetchFn: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      spawnFn: vi.fn(() => {
        const child = fakeChild();
        return child;
      }),
    });
    const llm = await createLlmLifecycle(deps);
    expect(llm.status()).toMatchObject({ ready: false, port: 8080, adopted: false });
    await llm.start();
    await llm.stop();
    expect(removePidFile).toHaveBeenCalled();
  });
});