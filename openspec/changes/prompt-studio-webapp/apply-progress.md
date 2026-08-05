# Apply Progress — Prompt Studio (PR 1 Foundation, tasks 1.1–2.4)

- Change: `prompt-studio-webapp`
- Project: `testeo_arneses` (working dir: `testeo comfyui/prompt-studio`)
- Run: **PR 1 Foundation** (feature-branch-chain slice #1) — tasks 1.1–2.4
- Branch: `feature/prompt-studio-webapp` (from master `96eb95b`)
- Mode: **Strict TDD** (enabled at 1.1: `openspec/config.yaml` `testing.strict_tdd: true`, `test_command: "npm test"`)
- Date: 2026-08-04

## Summary

Scaffolded the npm-workspaces monorepo, implemented the source-only shared
package (types, DTOs, aspect map, final-prompt detection, bounds validation),
committed the byte-identical workflow template + copy pipeline, implemented the
pure UI→API converter with golden + immutability + injection + ConversionError
tests, and shipped the dev-time WIDGET_NAMES verification script — which was run
**against live ComfyUI** and reports a full match.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 scaffold | — (structural config) | Unit/N/A | N/A (new) | N/A (structural) | ✅ `npm install` ok, `npm test` exit 0, tsc 0, lint 0 | ➖ Structural only | ✅ Scripts finalized (`--passWithNoTests`, eslint ignores) |
| 1.2 types+DTOs | — (pure types) | Unit/N/A | N/A (new) | N/A (type-only) | ✅ `tsc --noEmit` exit 0 | ➖ Single (types) | ✅ Alias wired, barrel split by commit |
| 1.3 shared logic | `packages/shared/src/{aspect,detectFinalPrompt,validation}.test.ts` | Unit | N/A (new) | ✅ 3 files fail (modules missing) | ✅ 22/22 pass | ✅ 3+ cases per behavior (5 presets, ES/EN/passthrough/empty/short, bounds 0/9/2.5/whitespace) | ✅ Constants extracted, stopword sets documented |
| 2.1 template asset | `scripts/copy-template.test.mjs` | Unit | N/A (new) | ✅ 3 tests fail (script missing) | ✅ 3/3 pass; byte-identical copy; SHA-256 `8903b937…` | ✅ idempotency + sidecar cases | ✅ `.gitattributes -text` protects byte-identity |
| 2.2 converter RED | `apps/server/src/services/converter.test.ts` + golden fixture | Unit | N/A (new) | ✅ fails (converter missing) | ✅ 12/12 pass | ✅ 8 behaviors (golden, immutability, drops, keeps, injections, link refs, ConversionError, img2img) | ✅ Golden regenerated with `-u` (formatting only, semantics verified) |
| 2.3 converter impl | same file | Unit | ✅ 12/12 (from 2.2) | (RED from 2.2) | ✅ 12/12 | ✅ covered above | ✅ `WIDGET_NAMES` extended with `UpscaleModelLoader`/`LoadImage` (see deviations) |
| 2.4 verify script | `apps/server/src/scripts/verifyAgainstObjectInfo.test.ts` | Unit | N/A (new) | ✅ 4 tests fail (script missing) | ✅ 5/5 pass | ✅ drift/missing-class/optional cases | ✅ `required ∪ optional` semantics after live-ComfyUI finding |

### Test Summary
- **Total tests written**: 42 (6 test files)
- **Total tests passing**: 42 — `npm test` exit 0
- **Layers used**: Unit (42), Integration (0 — none in PR1 scope), E2E (0)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: `aspectToSize`, `detectFinalPrompt`, `validateGenerationInput`, `isValidGenerationInput`, `convert`, `verifyWidgetNames`, `copyTemplate`, `sha256Of`, `renderGolden`

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | `npm test` → **42/42 passing**, 6 files, exit 0. Also `npx vitest run packages/shared` (22), `npx vitest run apps/server/src/services/converter.test.ts` (12), `npx vitest run apps/server/src/scripts` (5) |
| Runtime harness command + result | `npm run verify:object-info` → **verified-live**: ComfyUI reachable at `127.0.0.1:8188`; "OK — WIDGET_NAMES matches live /object_info for all covered classes", exit 0 (11 classes checked) |
| Rollback boundary | Revert PR 1 branch (`git revert`/drop of `feature/prompt-studio-webapp`): removes `apps/`, `packages/shared/`, `assets/`, `scripts/`, root config; `openspec/` restored to initial commit 96eb95b. No server/UI code, no DB, no spawned processes |

## Files Created / Changed

| File | Action |
|------|--------|
| `package.json`, `package-lock.json` | Create — workspaces root, scripts, engines >=22 |
| `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `.gitattributes`, `.env.example` | Create |
| `openspec/config.yaml` | Modify — strict_tdd true, test_command `npm test` |
| `packages/shared/package.json`, `tsconfig.json`, `src/{index,types,dto,aspect,detectFinalPrompt,validation}.ts` + 3 test files | Create |
| `apps/server/package.json`, `tsconfig.json` | Create |
| `apps/server/src/services/converter.ts` + `converter.test.ts` | Create |
| `apps/server/src/scripts/verifyAgainstObjectInfo.ts` + `.test.ts` | Create |
| `apps/web/package.json`, `tsconfig.json` | Create (skeleton only — UI is PR 3) |
| `scripts/copy-template.mjs` + `.test.mjs`, `scripts/update-golden.ts` | Create |
| `assets/workflows/workflow_fotorealista_qwen.json` + `.sha256` | Create (byte-identical copy, SHA-256 `8903b93736813eb94c38945e710c63b7cfac12eab08d9bb2085738ba2e81e4bd`) |
| `assets/fixtures/fotorealista.api.golden.json` | Create (canonical converter output) |
| `openspec/changes/prompt-studio-webapp/tasks.md` | Modify — 1.1–2.4 marked `[x]` |

## Deviations from Design (noted, not silent)

1. **WIDGET_NAMES extended** with `UpscaleModelLoader: ["model_name"]` and `LoadImage: ["image"]` — design.md's table listed only 9 classes, but template nodes 12 and 16 carry widget values that must map to real ComfyUI API inputs; without them the payload/golden would be invalid. Verified live.
2. **verify script semantics**: input names checked against `required ∪ optional` (not required only) — live ComfyUI exposes `CLIPLoader.device` as optional. Confirmed by live run.
3. **Aspect test invariant**: the authoritative resolution table has 1024 on the *short* side for 4:5/9:16 (e.g. 4:5 → 1024×1280); test asserts "at least one side = 1024", per the proposal's committed table (the "1024 long side" phrasing in the proposal was loose).
4. **`npm test` uses `vitest run --passWithNoTests`** so the chain stays green between TDD commits with zero tests.
5. **Root `build` script** is `npm run typecheck` for PR 1 (vite build arrives with PR 3).

## Issues Found

- None blocking. ESLint flat-config `ignores: ["*.config.*"]` initially over-ignored everything (fixed).
- `copy-template` test skips when the source workflow is absent (manual/source machine only) — expected, source lives outside the repo by design.

## Remaining Tasks (next batch — PR 2)

- [ ] 3.1 comfy.ts HTTP client · 3.2 sse.ts + ws-relay.ts · 3.3 generation.ts orchestrator
- [ ] 4.1 RED process-lifecycle tests · 4.2 llm.ts lifecycle · 4.3 chat streaming
- [ ] 5.1 migrations · 5.2 history repository
- [ ] 6.1 config.ts + index.ts + routes
- (PR 3 web UI 7.x, PR 4 integration 8.x — later slices)

## Status

5/5 assigned tasks complete (PR 1 slice). Ready for sdd-verify on PR 1 Foundation.

## Next Slice (PR 2)

PR 1 is archived; the next slice (tasks 3.1–6.1) is tracked in
[apply-progress-pr2.md](./apply-progress-pr2.md).
