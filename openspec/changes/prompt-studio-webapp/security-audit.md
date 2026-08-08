# Security Audit — prompt-studio webapp

- **Date:** 2026-08-06
- **Scope:** full monorepo `prompt-studio/` on `feature/prompt-studio-webapp` (PRs 1–4, 136 tracked files)
- **Method:** READ-ONLY — no files modified or committed. Manual code review + tool checks (git history scan, `npm audit`, `npm ls`, traverse/secret regex over `git log -p --all`).
- **Model posture:** loopback-bound, single-user, local-only app (no cloud). 27 test files / 177 tests green.

---

## Executive summary

This is a **defensible, well-hardened localhost application**. The 14 concrete checks produced **no CRITICAL or HIGH findings**, no committed secrets, no plaintext credentials, no path-traversal, no SSRF, no SQL injection, no XSS, and no unintended network binding. Every executable is spawned on loopback with `--host 127.0.0.1` and `shell:false`. The only actionable items are **MEDIUM** (one unnecessarily permissive global CORS policy and two known `react-router-dom` advisories) plus a few **LOW/INFO** hygiene notes. Production readiness is **CONDITIONAL** — safe to ship once the CORS policy is tightened and the router dependency is upgraded.

---

## Concrete check results

| # | Check | Result |
|---|-------|--------|
| 1 | Secret scan (incl. `git log -p --all`, 28,146 lines) | **Clean** — 0 secret-pattern hits (keys, `Bearer`, `sk-`, `AKIA`, `aws_`, `-----BEGIN`, connection strings). No `.env`, `credentials.json`, `.pem/.key/.pfx` ever committed. |
| 2 | `.env` handling | **Pass.** Only `.env.example` tracked (placeholders, e.g. `C:\path\to\llama-server.exe`). No real `.env` present. Env read via `getConfig(process.env)` with non-secret defaults; never hardcoded credentials. `.env` + `data/` gitignored. |
| 3 | `npm audit --json` | **2 moderate** (both via `react-router-dom@6.30.4`, direct prod dep). Fix available: `react-router-dom@7.18.2` (semver-major). No high/critical. Audit registry reachable. |
| 4 | `npm ls --depth=0` | No known-bad transitive prod deps beyond the router issue above. Deps are current (better-sqlite3 13.x, ws 8.21, hono 4.13, sharp 0.35). |
| 5 | Binds & exposure | All loopback. Server `hostname: cfg.host` = `127.0.0.1` (index.ts:229); Vite `host: "127.0.0.1"` (vite.config.ts:8); llama-server spawn `--host 127.0.0.1` (llm.ts:104). **No `0.0.0.0` anywhere.** `build()` refuses non-loopback host (index.ts:91-93). |
| 6 | Path traversal | **Guarded** — see app.ts:325-338 quote below. |
| 7 | Headers | `nosniff` set on images (app.ts:347), correct `Content-Type`. **Open CORS present** (§A1). No HTML injection. |
| 8 | SSRF / proxy | **None.** Proxy/upstream targets come from fixed config (`comfyUrl`, `comfyWsUrl`), never from the request. Upload posts to `${services.comfyUrl}` (config-derived). Image filenames sanitized `replace(/[^a-zA-Z0-9._-]/g,"_")` (index.ts:70). |
| 9 | SQL injection | **None.** All statements `.prepare()` with bound `@params`/`?` (history.ts). Run ids/filenames bound, never interpolated. |
| 10 | Process/LLM lifecycle | `spawnFn(binPath, args, { shell: false })` with explicit argv array (llm.ts:106); kill only on exePath match to vendored binary (llm.ts:88-96); `powershell` PID passed as a fixed parameter, never interpolated (llm.ts:77-85). |
| 11 | XSS in web | **None.** `MessageBubble` renders text node (`{message.content}`), no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in `apps/web/src`. localStorage/sessionStorage only for theme + session/run ids. |
| 12 | Secrets/internal leak in DTOs | Run detail exposes `images[].localPath`/`thumbnailPath` (§LOW-1). No env/token leakage. |
| 13 | `.gitignore` | Correct: `node_modules/`, `dist/`, `data/`, `.env`, `*.log`. **No committed `data/`** (0 DB/image files tracked). |
| 14 | Auth | Loopback-only single-user — auth-free surface is **appropriate** (see §INFO-2). No externally reachable surface exists today. |

---

## Findings by severity

### CRITICAL
**None.**

### HIGH
**None.**

### MEDIUM

#### M-1 — Permissive CORS (`Access-Control-Allow-Origin: *`)
- **Evidence:** `apps/server/src/app.ts:54` → `app.use("*", cors());` (Hono's `cors()` default sets `origin: "*"`, reflecting every request).
- **Why it matters:** The browser only ever talks to `:8787` through the Vite proxy on the **same origin** (`:5173`), so permissive CORS is *not needed* here. Leaving allow-all enabled means **any website the user visits while the app is running can call every API endpoint** (`/api/llm/chat`, `/api/generate`, `/api/history`, `/api/history/:runId/images/:file`) and *read responses* — history, prompts, conversation text, and generated images. It turns a locally-private tool into a drive-by-readable service. The lack of cookie-based auth makes this the browser-visible crux of the whole threat model.
- **Fix:** Remove the global `app.use("*", cors())` and either (a) serve the built SPA from the same origin (Hono static), or (b) if cross-origin is truly required, scope CORS to the exact app origin, e.g. `origin: "http://127.0.0.1:5173"` with `credentials` only if used. Prefer (a).

#### M-2 — Known vulnerabilities in `react-router-dom` (direct production dep)
- **Location:** `apps/web/package.json` (`"react-router-dom": "^6.30.4"`).
- **`npm audit`:** **2 moderate**, both via `react-router-dom`:
  - **GHSA-337j-9hxr-rhxg (CWE-470)** — Arbitrary Constructor Injection via `deserializeErrors()` in SSR hydration; CVSS 6.1, range `>=6.4.0 <7.18.0`.
  - **GHSA-wrjc-x8rr-h8h slang (= GHSA-jjmj)** — Open redirect via backslash in `<Link>`/`useNavigate` (CVE-2025-68470 bypass); range `<7.18.0` (also `6.30.2/6.30.4` range for one variant).
- **Why it matters:** These are real advisories on a direct dependency. Impact is mitigated by loopback-only + no untrusted URL navigation, but they are known and trivially fixed, and SS open-redirect/constructor-injection are the kind of thing that "explodes" once the app is ever exposed.
- **Fix:** `npm install -D react-router-dom@7.18.2` (breaking major; verify router usage still behaves), or upgrade to the latest 6.x line if a 7.x migration is not acceptable, and re-run `npm audit`.

### LOW

#### L-1 — Filesystem path disclosure in API response
- **Location:** `apps/server/src/app.ts:306-309` (`GET /api/history/:runId` returns full `detail`), sourced from `apps/server/src/db/history.ts:140-152` (`imageRowToDto` returns `localPath` and `thumbnailPath`), and served DB `images.local_path`/`thumbnail_path` (001_init.sql:17-18).
- **Why it matters:** The JSON returned to the UI includes `data/images[].localPath` / `thumbnailPath` — absolute or relative **on-disk paths** (e.g. `data/images/<run>/<file>.png`). This discloses the server's filesystem layout and DATA_DIR. For a loopback tool it's benign, but it is internal detail the client does not need.
- **Instruction:** Remove `localPath`/`thumbnailPath` from the DTO exposed by the API (compute the URL only), keeping them for internal disk writes (DB rows are fine; only the HTTP DTO leaks).

**L-2 — Verbose error envelope leaks internal internals.**
- **Location:** `apps/server/src/app.ts:57-69` (`onError` returns `err.message` as the public 500 body); `comfy.ts:123-137` errors embed `baseUrl`, `path`, `statusText`; `generation.ts:233/237` embed LLM-note exception messages into `run.error`.
- **Why it matters:** Low, loopback-only, and actually useful during local dev; but messages like `ComfyUI is unreachable at http://127.0.0.1...:` and ComfyUI node exception text include host/paths that would aid a remote attacker should the surface ever be exposed. Keep a generic 500 for non-development profiles; keep the detailed message in the run's stored `error` log instead of the HTTP body.

### INFO / suggestions

- **INFO-1 — No static serving / CSP.** `npm run build` outputs `apps/web/dist` but Hono (`app.ts`) does not serve static assets, and neither Hono nor Vite emits a Content-Security-Policy or `X-Frame-Options`. For production single-process serving, add Hono's `serveStatic` for the SPA and a restrictive CSP (`default-src 'self'`).
- **INFO-2 — Auth (item 14).** The app is a **loopback-only, single-user tool invoking a local LLM and ComfyUI**. The no-auth design is **appropriate** with implied trust-in-your-own-terminal. Do **not** add auth now. If it ever grows a network bind or multi-user feature, auth becomes mandatory — at that point also restrict the open CORS (M-1). This is documented but flagged so the guardrail (`index.ts:91-93`) is never removed silently.
- **INFO-3 — Migration uses raw `db.exec`.** `apps/server/src/db/migrate.ts:38` runs committed SQL files with `user_version` gating. Safe because SQL is static/vendor-controlled (not user input); a non-issue, noted for completeness.
- **INFO-4 — Chained upload passthrough.** `POST /api/images/upload` (`app.ts:368-383`) forwards the raw multipart to local ComfyUI. The URL is config-fixed (no SSRF); a malicious *local* process could inject bytes, but that attacker already controls the loopback host — not a boundary.
- **INFO-5 — `nanoid` declared but unused** in `apps/server/package.json` (run ids use `randomUUID`, generation uses `randomUUID`). Minor hygiene: drop the unused dependency. No security impact.

---

## Production readiness verdict: **CONDITIONALLY READY**

**Rationale.** On evidence: zero committed secrets, zero SQL injection (parametrized), zero path traversal (multi-layer), zero SSRF (fixed upstream config, sanitized filenames), zero XSS (no dangerous HTML rendering), loopback-only binds with an active guard, `shell:false` explicit-argv subprocess spawn with PID-identity-guarded kill, and correct `.gitignore` (no tracked `data/`/`,env`). `npm audit` shows **no critical/high**. The architecture is genuinely one of clean localhost tooling.

**Gate to ship —#1 and #2 must be resolved before calling it fully production-ready:**
1. Remove or scope the *open* CORS (`app.ts:54`) — this is the single most meaningful browser-exposed risk.
2. Bump `react-router-dom` past the two moderate advisories (deps `@7.18.2`).

Optional hardening before a wider LAN/internet presence (not required for loopback single-user): CSP + static serving (INFO-1), strip `localPath`/`thumbnailPath` from the API DTO (L-1), and gate error verbosity (L-2).

> Once M-1 (CORS scope) is applied and the router is upgraded, verdict upgrades to **READY** for loopback production use.

---

## Resolution (2026-08-06, commit 7b8c0eb) — VERDICT UPGRADED TO **READY**

Both MEDIUM gates shipped in one hardening commit:

1. **M-1 (CORS):** global open `app.use("*", cors())` removed; now scoped `cors({ origin: "http://127.0.0.1:5173", allowMethods, allowHeaders })` — the SPA is same-origin via the Vite proxy, so no drive-by website can read `/api/history`, prompts or images.
2. **M-2 (router):** `react-router-dom` upgraded `6.30.4 -> 7.18.2`; clears GHSA-337j-9hxr-rhxg (constructor injection, CVSS 6.1) and GHSA-wrjc-x8rr-h8h (open redirect).

`npm audit` now reports **0 vulnerabilities** (root + prod only); `npm test` 177/177 pass; `tsc` and `vite build` green.

**Final verdict: READY** for loopback production use. Optional refinements (L-1 DTO path leak strip, L-2 error envelope, INFO-1 CSP/static serving) remain documented for a future wider-presence exercise.