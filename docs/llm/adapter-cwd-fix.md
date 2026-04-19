# Adapter cwd Resolution Fix (Phase 1)

> **Status:** Spec — awaiting implementation plan
> **Date:** 2026-04-19
> **Owner:** kangnam (LLM-driven)
> **Phase:** 1 of 2 (Phase 2 = helper extraction & adapter-utils refactor, separate doc)
> **Related incident:** CMP-12 calculator app issue — write_file calls leaked into agent instructions/ directory, caused subsequent context overflow and `This operation was aborted` failures.

## 1. Purpose

Fix a class of bugs where local-model adapters (`lm-studio-local`, `ollama-local`) write tool-call output files into the read-only AGENTS.md bundle directory (`~/.paperclip/instances/<id>/companies/.../agents/.../instructions/`) instead of the agent's intended workspace. Side effect: subsequent runs include the leaked files in the system prompt via `buildBundleTree`, causing LM Studio context-window overflow and aborts.

Fix two root causes simultaneously:
- **Bug A** — `lm-studio-local/src/server/execute.ts:115` and `ollama-local/src/server/execute.ts:114` use `instructionsRootPath` as the cwd fallback when `config.cwd` is empty. They never read `context.paperclipWorkspace.cwd`.
- **Bug B** — `server/src/services/heartbeat.ts:2151` only injects `runtimeConfig.cwd` via `applyWorkspaceCwdFallback` when both `executionProjectRow && company` are truthy. Goal-direct issues (no project) skip this branch.

Add defense-in-depth: an adapter-side guard that refuses any cwd inside `~/.paperclip/instances/<id>/` except `workspaces/<agentId>/`.

## 2. Non-goals

- DRY refactor of the 30-line cwd-resolution block currently duplicated across 6 external CLI adapters (`claude-local`, `codex-local`, `cursor-local`, `gemini-local`, `opencode-local`, `pi-local`) and now to be added to 2 local-model adapters. **Phase 2** owns this.
- Recovery of files already written to `instructions/Calculator/` for CMP-12 or other affected runs. **Separate task** — requires user judgment on retention.
- Changes to `tools/fs.ts` (read_file/write_file/list_dir). The cwd is set correctly by the time tools execute; tools themselves are not buggy.
- Modifying `instructionsRootPath` itself. It remains the read-only AGENTS.md bundle source for `buildBundleTree` / `read_file(path)` / system-prompt injection. It just stops being used as cwd.

## 3. Background — what is broken today

### 3.1 Audit of all 8 adapters

| Adapter | Reads `context.paperclipWorkspace.cwd`? | Falls back to `instructionsRootPath`? | Status |
|---|---|---|---|
| `claude-local` | ✅ | ❌ | OK |
| `codex-local` | ✅ | ❌ | OK |
| `cursor-local` | ✅ | ❌ | OK |
| `gemini-local` | ✅ | ❌ | OK |
| `opencode-local` | ✅ | ❌ | OK |
| `pi-local` | ✅ | ❌ | OK |
| **`lm-studio-local`** | ❌ | ✅ | **Bug A** |
| **`ollama-local`** | ❌ | ✅ | **Bug A** |

The 6 external CLI adapters already implement the canonical pattern at `claude-local/src/server/execute.ts:109-139`:

```ts
const workspaceContext = parseObject(context.paperclipWorkspace);
const workspaceCwd = asString(workspaceContext.cwd, "");
const workspaceSource = asString(workspaceContext.source, "");
// ... other workspace fields ...
const configuredCwd = asString(config.cwd, "");
const useConfiguredInsteadOfAgentHome =
  workspaceSource === "agent_home" && configuredCwd.length > 0;
const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
```

This pattern is the proven solution. Phase 1 replicates it into the two missing adapters; Phase 2 extracts it to `@paperclipai/adapter-utils/server-utils`.

### 3.2 Heartbeat conditional (Bug B)

`server/src/services/heartbeat.ts:2151-2158`:
```ts
const runtimeConfigWithCwd = executionProjectRow && company
  ? applyWorkspaceCwdFallback(runtimeConfig, {
      companyName: company.name,
      companyRootPath: company.workspaceRootPath ?? null,
      projectName: executionProjectRow.name,
      projectPathOverride: executionProjectRow.workspacePathOverride ?? null,
    })
  : runtimeConfig;
```

When the issue has no project (CMP-12 case: `issueContext.projectId === null`), `executionProjectRow` is null and `runtimeConfig` is passed through unchanged with no `cwd`. Adapters that read only `config.cwd` then fall through to their broken fallback chain.

After Phase 1, adapters read `paperclipWorkspace.cwd` directly so this conditional is no longer load-bearing for correctness — but it remains a hidden inconsistency. We fix it for defense-in-depth and to make the data flow uniform.

### 3.3 Symptom chain in CMP-12

```
Bug B (heartbeat skip) ─┐
                        ├─→ adapter receives config without cwd
Bug A (instructionsRootPath fallback) ─→ cwd lands in instructions/
                        │
                        ├─→ write_file resolves under instructions/Calculator/
                        │
                        ├─→ next run: buildBundleTree(instructionsRootPath)
                        │   includes Calculator/ tree in system prompt
                        │
                        └─→ LM Studio qwen context overflow
                            → "This operation was aborted"
```

Files written: `Calculator/CalculatorApp.swift`, `Calculator/CalculatorModel.swift`, `Calculator/CalculatorView.swift`, `Calculator/CalcButton.swift`, `Calculator/Assets.xcassets/`, `Calculator/Calculator.xcodeproj/project.pbxproj`. Recoverable from `~/.paperclip/instances/default/companies/8e9ea355.../agents/96c20224.../instructions/Calculator/`.

## 4. Architecture

```
heartbeat.ts
  ├─→ realizeExecutionWorkspace() returns executionWorkspace.cwd
  │   (always set; project_primary or agent_home strategy)
  │
  ├─→ context.paperclipWorkspace.cwd     [Single source of truth for adapters]
  │
  ├─→ runtimeConfig.cwd                  [Backup channel — Bug B fix]
  │   if executionProjectRow && company:
  │     applyWorkspaceCwdFallback(...)   // existing project_primary path,
  │                                       // already no-ops when config.cwd
  │                                       // is a non-empty trimmed string
  │   else:
  │     // NEW: agent_home path. Mirror applyWorkspaceCwdFallback's check:
  │     // only set when current cwd is missing/empty/whitespace.
  │     if (!isNonEmptyString(runtimeConfig.cwd)):
  │       runtimeConfig = { ...runtimeConfig, cwd: executionWorkspace.cwd }
  │
  └─→ env.PAPERCLIP_INSTANCE_ROOT        [NEW: enables adapter-side guard]
                          │
                          ▼
Adapter execute.ts (canonical pattern + guard)
  1. workspaceContext = parseObject(context.paperclipWorkspace)
  2. workspaceCwd = workspaceContext.cwd
  3. configuredCwd = config.cwd
  4. useConfiguredInsteadOfAgentHome =
       (workspaceSource === "agent_home" && configuredCwd.length > 0)
  5. cwd = (useConfiguredInsteadOfAgentHome ? "" : workspaceCwd)
            || configuredCwd
            || process.cwd()
  6. assertCwdNotInPaperclipManaged(cwd, env.PAPERCLIP_INSTANCE_ROOT)
  7. ensureAbsoluteDirectory(cwd, { createIfMissing: true })
  8. runAgentLoop({ cwd, ... })
```

### Design principles

- **Single source of truth.** `context.paperclipWorkspace.cwd` is set by heartbeat for every run. All adapters read it as the primary cwd.
- **User override preserved.** `config.cwd` still wins when the workspace strategy fell back to `agent_home` AND the user supplied an explicit override. This matches `claude-local`'s `useConfiguredInsteadOfAgentHome` behavior and avoids breaking any agents that intentionally set `config.cwd` to point outside the instance.
- **Defense in depth.** Adapter-side guard refuses any cwd that resolves inside `${PAPERCLIP_INSTANCE_ROOT}/` except `${PAPERCLIP_INSTANCE_ROOT}/workspaces/`. Catches future regressions statically.
- **No regression on the 6 external CLI adapters.** The heartbeat conditional change keeps the existing `executionProjectRow && company` truthy path identical; only the falsy path gains a new behavior. The PAPERCLIP_INSTANCE_ROOT env addition is additive and unused by existing adapters until Phase 2.
- **Phase 2 trail.** The 30-line block, after Phase 1, lives in 8 places. Phase 2 extracts `resolveAdapterWorkspace(ctx)` into `@paperclipai/adapter-utils/server-utils` and refactors all 8 adapters to use it. Phase 1 explicitly does not attempt this to keep the hotfix small and reviewable.

## 5. File changes

| # | File | Change | Responsibility |
|---|---|---|---|
| 1 | `packages/adapters/lm-studio-local/src/server/execute.ts` | Modify line ~115. Replace `const cwd = asString(config.cwd, instructionsRootPath \|\| process.cwd())` with the canonical 30-line block from `claude-local`. Add `assertCwdNotInPaperclipManaged()` call. Drop `instructionsRootPath` from cwd fallback chain entirely. | Local-model adapter cwd resolution |
| 2 | `packages/adapters/ollama-local/src/server/execute.ts` | Modify line ~114. Same change as #1. | Local-model adapter cwd resolution |
| 3 | `server/src/services/heartbeat.ts` | Modify line ~2151. Change conditional so the no-project branch also fills cwd: when `runtimeConfig.cwd` is missing/empty/whitespace, set it to `executionWorkspace.cwd`. Project branch unchanged (`applyWorkspaceCwdFallback` already no-ops on non-empty `config.cwd` to preserve user override). Add `env.PAPERCLIP_INSTANCE_ROOT = resolvePaperclipInstanceRoot()` to the env block (try/catch — log and skip on throw). | Backup cwd channel for adapters that don't read paperclipWorkspace; enable adapter-side guard |
| 4 | `packages/adapters/lm-studio-local/src/server/execute.test.ts` | Create. 10 unit tests per matrix in §7.1. | Verify cwd priority, override, guard, regression block on instructionsRootPath |
| 5 | `packages/adapters/ollama-local/src/server/execute.test.ts` | Create. Same 10 tests as #4. | Same |
| 6 | `server/src/services/heartbeat-cwd-fallback.test.ts` | Create or modify. 4 integration tests per §7.2. | Verify project / no-project / inconsistent-state branches |

No new files in `packages/adapter-utils/`. The `assertCwdNotInPaperclipManaged` helper is defined inline in each adapter for Phase 1; Phase 2 extracts it.

`packages/adapters/openai-compat-local/src/tools/fs.ts` is unchanged — tools correctly use the cwd they receive; the bug is upstream.

`packages/adapters/openai-compat-local/src/loop.ts` is unchanged — loop correctly forwards cwd to tools.

## 6. Data flow — goal-direct issue

### 6.1 After Phase 1 (no project, agent_home)

```
[heartbeat]
  executionProjectRow = null
  realizeExecutionWorkspace() → executionWorkspace.cwd
                                = "~/.paperclip/instances/default/workspaces/<agentId>"
  context.paperclipWorkspace = { cwd, source: "agent_home", ... }
  conditional (Bug B fix):
    not (executionProjectRow && company) →
      if !isNonEmptyString(runtimeConfig.cwd):
        runtimeConfig.cwd = executionWorkspace.cwd     ← NEW
  env.PAPERCLIP_INSTANCE_ROOT = "~/.paperclip/instances/default"   ← NEW
        │
        ▼
[lm-studio-local adapter]
  workspaceCwd = ".../workspaces/<agentId>"
  configuredCwd = ".../workspaces/<agentId>"   (heartbeat injected same value)
  workspaceSource = "agent_home"
  useConfiguredInsteadOfAgentHome = (agent_home && "" !== "") = TRUE
    → effectiveWorkspaceCwd = ""
  cwd = "" || configuredCwd || process.cwd()
      = ".../workspaces/<agentId>"            ✅
  assertCwdNotInPaperclipManaged: "workspaces/" prefix → PASS
  ensureAbsoluteDirectory: mkdir if missing
        │
        ▼
[runAgentLoop with cwd]
  tools/fs.ts write_file → ".../workspaces/<agentId>/Calculator/..."  ✅
        │
        ▼
[next run]
  buildBundleTree(instructionsRootPath) scans instructions/ only
  Calculator/ NOT in system prompt → no context overflow ✅
```

### 6.2 After Phase 1 (project_primary)

```
[heartbeat]
  executionProjectRow = <row>, company = <row>
  realizeExecutionWorkspace() → "~/Stapler/<company>/<project>"
  context.paperclipWorkspace = { cwd, source: "project_primary", ... }
  conditional (Bug B fix):
    (executionProjectRow && company) →
      applyWorkspaceCwdFallback(...) → runtimeConfig.cwd = "~/Stapler/..."
  env.PAPERCLIP_INSTANCE_ROOT injected
        │
        ▼
[adapter]
  workspaceCwd = "~/Stapler/..."
  configuredCwd = "~/Stapler/..."
  workspaceSource = "project_primary"
  useConfiguredInsteadOfAgentHome = FALSE
  cwd = workspaceCwd                          ✅
  assertCwdNotInPaperclipManaged: outside instance root → PASS
```

### 6.3 Sub-case — user explicitly sets config.cwd to outside

```
config.cwd = "/Users/kangnam/scratch"
workspaceSource = "agent_home"
useConfiguredInsteadOfAgentHome = TRUE → effectiveWorkspaceCwd = ""
cwd = "" || "/Users/kangnam/scratch" || process.cwd()
    = "/Users/kangnam/scratch"               ✅ user override respected
guard: outside instance root → PASS
```

## 7. Error handling

### 7.1 Adapter-side errors

| ID | Trigger | Action |
|---|---|---|
| E1 | `context.paperclipWorkspace` undefined | `parseObject(undefined)` returns `{}`. Fall through to configuredCwd → process.cwd(). Log `[paperclip] context.paperclipWorkspace not provided to adapter; falling back.` |
| E2 | Resolved cwd is inside `${PAPERCLIP_INSTANCE_ROOT}/` and NOT `${PAPERCLIP_INSTANCE_ROOT}/workspaces/...` | `assertCwdNotInPaperclipManaged()` throws. Run marked as `error`. |
| E3 | Resolved cwd does not exist or cannot be created | `ensureAbsoluteDirectory(cwd, { createIfMissing: true })` throws. Run marked as `error`. |
| E4 | `env.PAPERCLIP_INSTANCE_ROOT` empty / undefined | Guard becomes a no-op. Adapter continues. (E5 fallback path.) |

### 7.2 Heartbeat-side errors

| ID | Trigger | Action |
|---|---|---|
| E5 | `resolvePaperclipInstanceRoot()` throws (invalid `PAPERCLIP_INSTANCE_ID`) | Catch in heartbeat, log warn, skip env injection. Adapter guard becomes a no-op for this run; main path still works. |
| E6 | `executionWorkspace.cwd` is empty/null | Heartbeat throws before adapter dispatch. Run marked `error` with message `executionWorkspace produced empty cwd; refusing to start adapter`. |

### 7.3 `assertCwdNotInPaperclipManaged` exact definition

```ts
function assertCwdNotInPaperclipManaged(
  cwd: string,
  instanceRoot: string | null | undefined,
): void {
  if (!instanceRoot || instanceRoot.length === 0) return;
  const normalizedCwd = path.resolve(cwd);
  const normalizedRoot = path.resolve(instanceRoot);
  const isInsideRoot =
    normalizedCwd === normalizedRoot ||
    normalizedCwd.startsWith(normalizedRoot + path.sep);
  if (!isInsideRoot) return;
  const workspacesDir = path.resolve(normalizedRoot, "workspaces");
  const isInWorkspaces =
    normalizedCwd === workspacesDir ||
    normalizedCwd.startsWith(workspacesDir + path.sep);
  if (isInWorkspaces) return;
  throw new Error(
    `Adapter cwd cannot be inside Paperclip-managed non-workspace directory: ${normalizedCwd}. ` +
    `Expected location is under ${workspacesDir}/ or outside ${normalizedRoot}/.`,
  );
}
```

Permitted under `${PAPERCLIP_INSTANCE_ROOT}/`:
- `${root}/workspaces/<agentId>` and below (agent_home)

Refused under `${PAPERCLIP_INSTANCE_ROOT}/`:
- `${root}/companies/.../agents/.../instructions/...` (CMP-12 sink)
- `${root}/db/`
- `${root}/secrets/`
- `${root}/data/`
- `${root}/logs/`
- `${root}/projects/`
- Any other future Paperclip-managed subdirectory

Permitted unconditionally:
- Any path outside `${PAPERCLIP_INSTANCE_ROOT}/` (user workspaces, `~/Stapler/...`, `/tmp/...`, etc.)

## 8. Testing

### 8.1 Unit tests (10 cases × 2 adapters)

**Files:** `packages/adapters/lm-studio-local/src/server/execute.test.ts`, `packages/adapters/ollama-local/src/server/execute.test.ts`

| # | Scenario | paperclipWorkspace.cwd | config.cwd | source | env.PAPERCLIP_INSTANCE_ROOT | Expected |
|---|---|---|---|---|---|---|
| U1 | project_primary normal | `/Users/x/Stapler/co/proj` | (empty) | `project_primary` | `/i` | cwd = `/Users/x/Stapler/co/proj` |
| U2 | agent_home + override | `/i/workspaces/a1` | `/tmp/custom` | `agent_home` | `/i` | cwd = `/tmp/custom` |
| U3 | agent_home no override | `/i/workspaces/a1` | (empty) | `agent_home` | `/i` | cwd = `/i/workspaces/a1` |
| U4 | nothing set | (empty) | (empty) | (empty) | `/i` | cwd = `process.cwd()` |
| U5 | guard — instructions/ | `/i/companies/c/agents/a/instructions` | (empty) | `agent_home` | `/i` | throws "non-workspace directory" |
| U6 | guard — db/ | `/i/db` | (empty) | (empty) | `/i` | throws |
| U7 | guard — secrets/ | (empty) | `/i/secrets/master.key` | (empty) | `/i` | throws |
| U8 | guard pass — instance external | `/Users/x/Stapler/co/proj` | (empty) | `project_primary` | `/i` | cwd = `/Users/x/Stapler/co/proj`; no throw |
| U9 | guard disabled — env missing | `/i/instructions` | (empty) | (empty) | (empty) | cwd = `/i/instructions`; no throw (E5 fallback) |
| U10 | regression — no instructionsRootPath fallback | (empty) | (empty) | (empty) | `/i` | cwd = `process.cwd()` even if `config.instructionsRootPath = "/i/instructions"` |

Mock strategy:
- `runAgentLoop` mocked to capture `cwd` arg and not actually call HTTP
- `ensureAbsoluteDirectory` mocked to no-op
- Adapter `execute({ runId, agent, runtime, config, context, env, onLog, onMeta?, authToken? })` invoked with mock `AdapterExecutionContext`
- Assertion targets the captured cwd, or expect `.rejects.toThrow(/non-workspace/)`

### 8.2 Integration tests

**File:** `server/src/services/heartbeat-cwd-fallback.test.ts`

| # | Scenario | DB state | Expected |
|---|---|---|---|
| I1 | project + company present | `issue.projectId` set, project & company rows | `runtimeConfig.cwd === resolveForProject(...).resolvedAbsolutePath` |
| I2 | goal-direct (no project) | `issue.projectId === null` | `runtimeConfig.cwd === executionWorkspace.cwd` (NOT undefined; NOT skipped) |
| I3 | project present, company missing (defensive) | project row, no company row | warn logged; `runtimeConfig.cwd === executionWorkspace.cwd` (fallback path) |
| I4 | env.PAPERCLIP_INSTANCE_ROOT injected | any | `env.PAPERCLIP_INSTANCE_ROOT === resolvePaperclipInstanceRoot()` |

Real PGlite, no DB mocking. Stub adapter captures the `config` and `env` it receives.

### 8.3 Manual E2E (one-shot, post-merge)

1. Start dev server, open UI.
2. Hire `lm-studio-local` agent (qwen model).
3. Create company, no project. Assign goal-direct issue: "Build a calculator app in SwiftUI."
4. Wait for run completion.
5. Verify:
   - `~/.paperclip/instances/default/workspaces/<agentId>/Calculator/` exists with the SwiftUI files
   - `~/.paperclip/instances/default/companies/.../agents/.../instructions/Calculator/` does NOT exist
   - Triggering a second run on the same agent does not abort with `This operation was aborted` due to context overflow

### 8.4 Pre-existing test regression check

- `packages/adapters/openai-compat-local/src/tools/fs.test.ts` — unchanged, expected green
- All 6 external CLI adapter tests — expected green (heartbeat truthy branch unchanged)
- `pnpm -r typecheck && pnpm test:run && pnpm build` must pass before merge

## 9. TDD task ordering (pre-plan)

Plan doc (writing-plans skill output) will expand each into bite-sized steps.

```
1. RED  — write U1 + U3 in lm-studio-local/execute.test.ts (both fail today)
2. GREEN — port canonical 30-line block from claude-local; U1, U3 pass
3. RED  — add U2 (override scenario)
4. GREEN — verify useConfiguredInsteadOfAgentHome logic present; U2 passes
5. RED  — add U5, U6, U7 (guard cases)
6. GREEN — add assertCwdNotInPaperclipManaged() inline; U5/U6/U7 pass
7. RED  — add U10 (instructionsRootPath regression block)
8. GREEN — remove `instructionsRootPath ||` from cwd fallback; U10 passes
9. Repeat steps 1–8 for ollama-local
10. RED  — write I2 in heartbeat-cwd-fallback.test.ts (fails)
11. GREEN — modify heartbeat.ts:2151 conditional; inject env.PAPERCLIP_INSTANCE_ROOT; I2 passes
12. Add I1, I3, I4 alongside I2; ensure all pass
13. Run full Verification Gate: pnpm -r typecheck && pnpm test:run && pnpm build
14. Manual E2E (§8.3) by user before announcing done
```

## 10. Decisions

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D1 | Replicate canonical block inline in Phase 1; extract helper in Phase 2 | A1 (inline only forever), A2 (extract in same PR) | Smallest hotfix surface; user data leakage stops immediately; refactor risk separated from correctness fix. NEVER #5 design-doc requirement satisfied per phase. |
| D2 | Adapter-side guard, not heartbeat-side guard | Validate cwd in heartbeat before adapter dispatch | Adapter receives cwd from multiple channels (config, paperclipWorkspace, process.cwd fallback). Defense lives where decision is final. |
| D3 | Pass instance root via env var, not import | Import `resolvePaperclipInstanceRoot()` from `server/` into adapter | Adapters live in `packages/` and must not depend on `server/`. Env var is the established adapter-config channel. |
| D4 | Heartbeat fallback uses `executionWorkspace.cwd` directly when no project | Compute a different fallback per strategy | `executionWorkspace.cwd` is the realized workspace and is already what `paperclipWorkspace.cwd` is set to. Keeping the two channels in sync removes ambiguity. |
| D5 | `useConfiguredInsteadOfAgentHome` only triggers when `workspaceSource === "agent_home"` | Always let `config.cwd` override | Project workspaces are deliberately chosen by the system; user override only makes sense as an escape hatch from the auto-fallback case. Matches existing claude-local behavior. |
| D6 | Drop `instructionsRootPath` from cwd fallback completely | Keep it as a low-priority fallback | It is a read-only AGENTS.md bundle directory. Falling back to it is the bug. There is no legitimate case where it should be the cwd. |
| D7 | File recovery (`instructions/Calculator/` → workspace) is out of scope | Bundle into Phase 1 | Recovery requires user judgment (keep / discard / merge with manually-written code) and is not idempotent. Will be filed as a separate task with a checklist. |

## 11. Phase 2 preview (not in this spec)

Separate design doc: `docs/llm/adapter-resolve-workspace-helper.md` (TBD).

Scope: extract `resolveAdapterWorkspace(ctx)` and `assertCwdNotInPaperclipManaged()` into `@paperclipai/adapter-utils/server-utils`. Refactor all 8 adapters to call the helper. Inline the env-var name `PAPERCLIP_INSTANCE_ROOT` as a constant in `adapter-utils`. Reduces duplication by ~240 LOC. Higher regression surface than Phase 1 — needs its own dedicated PR + review.

## 12. Verification Gate (Definition of Done for Phase 1)

Per CLAUDE.md §10:
1. Behavior matches this spec
2. `pnpm -r typecheck && pnpm test:run && pnpm build` all pass
3. Contracts synced — only adapter and heartbeat changes; no schema/shared/UI impact
4. Manual E2E §8.3 confirmed by user
5. CMP-12 root cause filed as fixed in run-log review (separate observation)
