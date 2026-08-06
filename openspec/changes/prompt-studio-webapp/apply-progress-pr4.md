# Apply Progress — Prompt Studio (PR 4 Integration, tasks 8.1–8.2 + verify follow-ups)

- Change: `prompt-studio-webapp`
- Project: `testeo_arneses` (working dir: `testeo comfyui/prompt-studio`)
- Run: **PR 4 Integration** — tasks 8.1–8.2 + closure of the PR3 verify-report blockers/warnings
- Branch: `feature/prompt-studio-webapp`
- Mode: **Strict TDD** (`openspec/config.yaml` `testing.strict_tdd: true`, `test_command: "npm test"`)
- Date: 2026-08-06

## Summary

PR4 closes the wire-contract BLOCKER from `verify-report-pr3.md` and the P3
follow-ups, and completes the final two integration tasks:

- **8.1 E2E integration** — wired the **real** ComfyUI WebSocket relay + automatic
  `runCompletion` into the server, added boot/E2E tests that drive the full mocked
  flow (interview → generate 4 → images → history → serve → regenerate → delete,
  plus 409/422/502/503), and fixed two real bugs the E2E exposed.
- **8.2 Manual smoke + README** — README with setup/ports/success-criteria
  checklist; the smoke itself is automated against a mocked ComfyUI in `e2e.test.ts`
  (live ComfyUI validation remains a human step; documented in the README).
- **verify-report-pr3 follow-ups** — closed WARNING#1 (`?from=` regeneration
  navigation) and WARNING#2 (`getGenerateRun` poll fallback now wired as refresh
  recovery); added the first `@testing-library/react` component tests (jsdom).

## Commit Chain

| Commit | Focus |
|--------|-------|
| `08363c9` | `feat(server): wire the real WS relay + runCompletion (PR4 8.1 core)` |
| `8bc517d` | `test(server): full-journey E2E (mocked ComfyUI) + fix 2 real bugs` |
| `04324b7` | `feat(web): honor /review?from= regenerate prefill + live progress (PR4 W1)` |
| `bc0e284` | `feat(web): poll-fallback refresh recovery for ProgressView (PR4 W4)` |
| `256162c` | `docs: README setup, ports, success-criteria smoke checklist (PR4 8.2)` |
| `(artifacts)` | docs: mark 8.1/8.2 done + PR4 apply-progress + TDD table in PR3 artifact |

## TDD Cycle Evidence

| Unit | Test file | RED evidence | GREEN | Coverage highlights |
|------|-----------|--------------|-------|---------------------|
| W1 SSR/relay bridge | `apps/server/src/lib/run-events.test.ts` | ✅ observed (module missing) | ✅ 4/4 | publish/subscribe fan-out per run, terminal-frame dedupe |
| W1 boot wiring | `apps/server/src/boot.test.ts` | ✅ observed (relay disposed—no-op) | ✅ 3/3 | real relay → generate → progress/image/complete bridged + images written + busy lock released; post-cancel WS frame ignored; SSE stream live |
| W2 orchestration frames | `apps/server/src/services/generation.test.ts` | ✅ observed | ✅ 8/8 | `emit` publishes progress/image/complete + auto-runCompletion after all prompt_ids executed; per-variation failure isolation |
| W2 E2E | `apps/server/src/e2e.test.ts` | ✅ observed (flow fails without fixes) | ✅ 4/4 | chat→generate 4→image rows→detail→serve→regenerate→delete; 409 busy; 502 ComfyUnreachable; 422 convert failure |
| W3 regenerate nav | `apps/web/src/lib/reviewHydrate.test.ts` + `apps/web/src/routes/reviewView.test.tsx` | ✅ observed (`?from=` ignored) | ✅ 4 + 2 | hydrate prefills prompt/seed/steps/cfg/sampler/scheduler/width/height/variations, seeds fallback 4, missing-params no-clobber; component shows ProgressView for `?from=` and falls back to editor on 404 |
| W4 refresh recovery | `apps/web/src/lib/progress.test.ts` + `apps/web/src/components/progress/progressView.test.tsx` | ✅ observed (reconcile missing) | ✅ 4 + 2 | reconcileFromStatus marks variants complete from base images + settles terminal statuses, leaves running untouched, immutability; component reconciles finished bars on mount, tolerates status-poll failure |

## Test Summary

- **Tests written (PR 4)**: 29 new across 7 files (2 adapter tests, 4 E2E, 4 boot,
  6 unit-frame, 6 hydrate, 4 reconcile, 4 component).
- **Full suite**: **177 passing / 27 files** (`npm test` exit 0).
- **Typecheck**: `npx tsc --noEmit` root + `-p apps/web` — clean.
- **Lint**: `eslint . --quiet` — clean.
- **Build**: `npx vite build` — dist JS ~120 kB gzip (matches apply claim).

## Real Bugs Fixed (found by E2E, not fabricated)

1. **Image writer filename mismatch** — `createImageWriter` stored `<variation>_<file>` but
   DB rows/routes serve by the ComfyUI `filename`; the gallery image route returned 404.
   Fixed to write under the ComfyUI `filename` (image rows keep `variationIndex` + `kind`).
2. **Run prompt not persisted** — `generation.start()` never stored the submitted prompt in
   `createRun`, so history detail never carried the prompt. Now persisted in `params_json`/prompt
   column (history detail was already prompt-aware).

## verify-report-pr3 Closure

| # | Finding | Status |
|---|---------|--------|
| CRITICAL #1 | server runtime doesn't deliver SSE/completion flow (relay stubbed, runCompletion never called) | ✅ Closed — real `WsRelay` on `cfg.comfyWsUrl` + `RunEventHub` bridge + auto `runCompletion` (W1) |
| CRITICAL #2 | `apply-progress-pr3.md` missing TDD Cycle Evidence table | ✅ Closed — table added to PR3 artifact |
| WARNING #1 | `ReviewView` ignores `/review?from=` (regenerate navigation gap) | ✅ Closed — hydrate + active-run on `from` (W3) |
| WARNING #2 | `getGenerateRun` poll-fallback dormant | ✅ Closed — poll-fallback wired into ProgressView on mount (W4) |
| SUGGESTION | jsdom + `@testing-library/react` component tests | ✅ Done — `reviewView.test.tsx`, `progressView.test.tsx` (jsdom) plus `apps/**/*.test.tsx` glob added to vitest config |

## Files Changed (PR 4)

| File | Action |
|------|--------|
| `apps/server/src/index.ts` | Modify — real `WsRelay` on `cfg.comfyWsUrl`, real `createImageWriter`, `RunEventHub` bridge, `relay.connect()/close()` lifecycle |
| `apps/server/src/services/generation.ts` | Modify — `emit?` dep publishing progress/image/complete/failed/cancelled + auto `runCompletion`; persist run prompt |
| `apps/server/src/app.ts` | Modify — `events?` in `AppServices`, SSE route streams hub frames |
| `apps/server/src/lib/ws-relay.ts` / `run-events.ts` | Create — injectable WS relay + pub/sub event hub |
| `apps/server/src/boot.test.ts`, `e2e.test.ts`, `run-events.test.ts`, `generation.test.ts` | Create/Modify — PR4 tests |
| `apps/web/src/routes/ReviewView.tsx` | Modify — honor `/review?from=` hydrate + set active run |
| `apps/web/src/lib/reviewHydrate.ts` + `.test.ts` | Create — editor hydration helper |
| `apps/web/src/components/progress/ProgressView.tsx` | Modify — poll-fallback refresh recovery |
| `apps/web/src/lib/progress.ts` + `.test.ts` | Modify — `reconcileFromStatus` reconciler |
| `apps/web/src/routes/reviewView.test.tsx`, `components/progress/progressView.test.tsx` | Create — component tests |
| `vitest.config.ts` | Modify — include `*.test.tsx` |
| `README.md` | Create — setup, ports, success-criteria smoke checklist (8.2) |
| `openspec/changes/prompt-studio-webapp/{tasks.md, apply-progress-pr3.md}` | Modify — 8.1/8.2 `[x]`, TDD table |

## Work Unit Evidence

| Unit | Focused test command + result | Runtime harness + result | Rollback boundary |
|------|------------------------------|--------------------------|-------------------|
| W1 relay wiring | `npm test -- run-events boot` → 7/7 green | `boot.test.ts` drives real relay + mocked Comfy socket to `completed`; SSE stream live | Revert `08363c9` (server index/generation/app + run-events/ws-relay) |
| W2 E2E | `npm test -- e2e` → 4/4 green | Mocked ComfyUI full journey (chat→4→images→detail→regenerate→delete, 409/502/422) | Revert `8bc517d` (e2e.test.ts + generation.test.ts + image-writer/prompt fixes) |
| W3 regenerate nav | `npm test -- reviewView reviewHydrate` → 6/6 green | jsdom component test proves `/review?from=` shows live ProgressView | Revert `04324b7` (ReviewView, reviewHydrate) |
| W4 refresh recovery | `npm test -- progress progressView` → 10/10 green | Component test reconciles finished bars on mount; E2E unaffected | Revert `bc0e284` (progress.ts, ProgressView) + vitest tsx glob |
| W5 README | `npm test` full suite → 177/177 | `npx vite build` green (dist ~121 kB gzip) | Revert `256162c` (README only) |
| W6 artifacts | `npm test` → 177/177, typecheck/lint clean | n/a (docs only) | Revert artifacts commit (tasks.md/apply-progress docs) |

## Deviations from Design

- The manual smoke (live ComfyUI) is documented but not executed here: ComfyUI is not
  running in this environment. The full flow is proven against a mocked ComfyUI in
  `e2e.test.ts`; `verifyAgainstObjectInfo` remains available for the live cross-check.
- `params.upscale` is not part of the shared `RunDetailDto.params` type, so the W3
  hydrator does not prefill the `upscale` toggle (stays at store default `false`).
  The editor contract (`upscale` sent on POST) is unchanged and unit-tested.

## Status

PR 4 tasks 8.1–8.2 complete; full suite 177/177 green, typecheck/lint/build clean.
Ready for sdd-verify on the PR4 slice.