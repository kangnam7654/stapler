# Adapter cwd Resolution Fix (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `lm-studio-local` and `ollama-local` adapters from writing tool-call output files into the read-only AGENTS.md bundle directory by replicating the canonical workspace-cwd resolution pattern from `claude-local`, fixing the heartbeat fallback so goal-direct issues also receive cwd, and adding an adapter-side defense-in-depth guard.

**Architecture:** Two adapters get a 30-line cwd-resolution block (paperclipWorkspace.cwd → config.cwd → process.cwd()) plus a safety guard that refuses cwd inside `~/.paperclip/instances/<id>/` except `workspaces/<agentId>/`. Heartbeat extracts the conditional-fallback into a single helper that handles both project-present and project-absent branches, and injects `PAPERCLIP_INSTANCE_ROOT` env so the adapter guard knows the boundary.

**Tech Stack:** TypeScript, Node.js, vitest (test runner), `@paperclipai/adapter-utils` (helpers like `parseObject`, `asString`, `ensureAbsoluteDirectory`).

**Spec:** `docs/llm/adapter-cwd-fix.md`

**Working dir:** `/Users/kangnam/projects/stapler` (no worktree — small focused changes)

**Pre-req — read these once before starting:**
- `docs/llm/adapter-cwd-fix.md` (the spec; especially §4, §6, §7.3)
- `packages/adapters/claude-local/src/server/execute.ts:1-160` (canonical pattern source)
- `server/src/services/heartbeat.ts:2120-2200` (heartbeat conditional area)

---

## Task 1: lm-studio-local — port canonical cwd resolution + safety guard

**Files:**
- Modify: `packages/adapters/lm-studio-local/src/server/execute.ts:1-26` (imports), `:107-115` (cwd resolution)
- Create: `packages/adapters/lm-studio-local/src/server/execute.test.ts`

### Step 1.1: Write failing tests U1, U3, U4, U10

- [ ] **Step 1.1: Write the failing tests for cwd priority (U1, U3, U4, U10)**

Create `packages/adapters/lm-studio-local/src/server/execute.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execute } from "./execute.js";

// Helper: minimal AdapterExecutionContext mock with capture of cwd via onMeta.
interface CapturedMeta {
  cwd?: string;
  envHasInstanceRoot?: string;
}
function makeCtx(opts: {
  paperclipWorkspace?: Record<string, unknown> | null;
  configCwd?: string;
  instructionsRootPath?: string;
  paperclipInstanceRoot?: string;
}) {
  const meta: CapturedMeta = {};
  const ctx = {
    runId: "run-test",
    agent: { id: "a1", companyId: "c1", name: "Tester", adapterType: "lm_studio_local", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: {
      baseUrl: "http://127.0.0.1:1",
      model: "test-model",
      timeoutSec: 1,
      ...(opts.configCwd !== undefined ? { cwd: opts.configCwd } : {}),
      ...(opts.instructionsRootPath !== undefined ? { instructionsRootPath: opts.instructionsRootPath } : {}),
      ...(opts.paperclipInstanceRoot !== undefined
        ? { env: { PAPERCLIP_INSTANCE_ROOT: opts.paperclipInstanceRoot } }
        : {}),
    },
    context: opts.paperclipWorkspace === null
      ? {}
      : { paperclipWorkspace: opts.paperclipWorkspace ?? {} },
    onLog: async () => {},
    onMeta: async (m: { cwd?: string; env?: Record<string, string> }) => {
      meta.cwd = m.cwd;
      meta.envHasInstanceRoot = m.env?.PAPERCLIP_INSTANCE_ROOT;
    },
    onSpawn: async () => {},
    authToken: undefined,
  };
  return { ctx, meta };
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("lm-studio-local execute — cwd resolution", () => {
  it("U1: project_primary uses paperclipWorkspace.cwd", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/Users/x/Stapler/co/proj", source: "project_primary" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/Users/x/Stapler/co/proj");
  });

  it("U3: agent_home with no override uses paperclipWorkspace.cwd", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/workspaces/a1", source: "agent_home" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/i/workspaces/a1");
  });

  it("U4: nothing set falls back to process.cwd()", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: null,
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe(process.cwd());
  });

  it("U10: instructionsRootPath is NOT used as cwd fallback", async () => {
    // Critical regression test: this path must never be chosen as cwd.
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: null,
      instructionsRootPath: "/i/companies/c/agents/a/instructions",
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe(process.cwd());
    expect(meta.cwd).not.toContain("/instructions");
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U1 FAIL (current code reads `config.cwd` only, gets empty/undefined → falls to `process.cwd()` not workspace), U3 FAIL (same), U4 PASS (already process.cwd), U10 FAIL (current code uses instructionsRootPath as cwd → `/i/companies/c/agents/a/instructions` returned).

If a test crashes during `await execute(...)` because `ensureAbsoluteDirectory` complains about `/Users/x/Stapler/co/proj` not existing, that's expected failure mode. Tests will pass once we add a mock for `ensureAbsoluteDirectory` (Step 1.3). For now confirm the failures are about cwd values, not setup.

### Step 1.3: Mock ensureAbsoluteDirectory in tests so cwd assertion runs

- [ ] **Step 1.3: Add ensureAbsoluteDirectory mock to test file**

Add at the top of `execute.test.ts`, just below imports:

```ts
vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return {
    ...actual,
    ensureAbsoluteDirectory: vi.fn().mockResolvedValue(undefined),
  };
});
```

Run again:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U1, U3, U10 still FAIL (cwd values wrong); U4 PASS.

### Step 1.4: Port canonical cwd block + add safety guard

- [ ] **Step 1.4: Replace cwd resolution in lm-studio-local execute.ts**

Edit `packages/adapters/lm-studio-local/src/server/execute.ts`.

First, expand the imports block. Replace lines 1-26 with:

```ts
// src/server/execute.ts
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildBundleTree,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_TOOLS,
  runAgentLoop,
  selectTools,
  summarizeSession,
  type ChatMessage,
} from "@paperclipai/adapter-openai-compat-local";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  DEFAULT_LM_STUDIO_MODEL,
  PROVIDER_NAME,
} from "../index.js";

/**
 * Refuse adapter cwd that resolves inside `${PAPERCLIP_INSTANCE_ROOT}/`
 * unless it's under `${PAPERCLIP_INSTANCE_ROOT}/workspaces/`.
 * Defense-in-depth against regressions like the CMP-12 instructionsRootPath
 * fallback that wrote tool output into the read-only AGENTS.md bundle dir.
 *
 * No-op when `instanceRoot` is empty (heartbeat couldn't resolve it). In
 * that case the main path (canonical pattern) still works.
 */
function assertCwdNotInPaperclipManaged(cwd: string, instanceRoot: string): void {
  if (instanceRoot.length === 0) return;
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

Then replace lines 110-115 (the old cwd resolution) with:

```ts
  const baseUrl = asString(config.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);
  const model = asString(config.model, DEFAULT_LM_STUDIO_MODEL);
  const lmStudioApiKey = asString(config.apiKey, "");
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  const instructionsRootPath = asString(config.instructionsRootPath, "");

  // Workspace cwd resolution — canonical pattern (mirrors claude-local).
  // Priority: paperclipWorkspace.cwd (heartbeat) > config.cwd (user override
  // when source=agent_home) > process.cwd() (last resort).
  // NOTE: instructionsRootPath is NEVER a cwd fallback. It is the read-only
  // AGENTS.md bundle directory used only for buildBundleTree below.
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome =
    workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  assertCwdNotInPaperclipManaged(
    cwd,
    asString(parseObject(config.env).PAPERCLIP_INSTANCE_ROOT, ""),
  );
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
```

The rest of the function (line 116 onward — `let systemPrompt = ...`, `if (instructionsFilePath)`, `if (instructionsRootPath)`, etc.) stays unchanged. `instructionsRootPath` is still loaded by `buildBundleTree(instructionsRootPath)` for the system prompt — that usage is correct and stays.

- [ ] **Step 1.5: Run tests — verify U1/U3/U4/U10 pass**

Run:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U1, U3, U4, U10 all PASS.

### Step 1.6: Add U2 (override) and verify

- [ ] **Step 1.6: Add U2 test for explicit config.cwd override in agent_home mode**

Append to the `describe` block in `execute.test.ts`:

```ts
  it("U2: agent_home + explicit config.cwd uses configured override", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/workspaces/a1", source: "agent_home" },
      configCwd: "/tmp/custom",
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/tmp/custom");
  });
```

Run:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U2 PASS (the `useConfiguredInsteadOfAgentHome` branch in Step 1.4 already handles it).

### Step 1.7: Add U5/U6/U7 (safety guard throws) and verify

- [ ] **Step 1.7: Add safety guard tests**

Append to the `describe` block:

```ts
  it("U5: cwd in instructions/ is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: { cwd: "/i/companies/c/agents/a/instructions", source: "agent_home" },
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(
      /non-workspace directory/,
    );
  });

  it("U6: cwd at instance/db is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: { cwd: "/i/db" },
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(/non-workspace directory/);
  });

  it("U7: cwd at instance/secrets via config.cwd is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: null,
      configCwd: "/i/secrets/master.key",
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(/non-workspace directory/);
  });
```

Run:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U5/U6/U7 PASS (the `assertCwdNotInPaperclipManaged` from Step 1.4 already handles all three cases).

### Step 1.8: Add U8/U9 (guard pass-through) and verify

- [ ] **Step 1.8: Add guard pass-through tests**

Append to the `describe` block:

```ts
  it("U8: cwd outside instance root passes guard (project workspace)", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/Users/x/Stapler/co/proj", source: "project_primary" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/Users/x/Stapler/co/proj");
  });

  it("U9: guard disabled when PAPERCLIP_INSTANCE_ROOT is empty", async () => {
    // E5 fallback: heartbeat couldn't resolve instance root, guard becomes no-op.
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/companies/c/agents/a/instructions", source: "agent_home" },
      // no paperclipInstanceRoot set — env will lack PAPERCLIP_INSTANCE_ROOT
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/i/companies/c/agents/a/instructions");
  });
```

Run:
```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
```

Expected: U8 PASS, U9 PASS. All 10 tests green.

### Step 1.9: Commit

- [ ] **Step 1.9: Commit lm-studio-local changes**

```bash
cd /Users/kangnam/projects/stapler
git add packages/adapters/lm-studio-local/src/server/execute.ts \
        packages/adapters/lm-studio-local/src/server/execute.test.ts
git commit -m "$(cat <<'EOF'
fix(lm-studio-local): use paperclipWorkspace.cwd as primary, add safety guard

Replace `config.cwd ?? instructionsRootPath ?? process.cwd()` fallback with
the canonical pattern from claude-local: paperclipWorkspace.cwd (heartbeat) →
config.cwd (user override when source=agent_home) → process.cwd(). Drop the
instructionsRootPath fallback that was leaking tool-call output files into
the read-only AGENTS.md bundle directory (CMP-12 incident).

Add adapter-side defense-in-depth: assertCwdNotInPaperclipManaged refuses any
cwd inside ${PAPERCLIP_INSTANCE_ROOT}/ except ${PAPERCLIP_INSTANCE_ROOT}/workspaces/,
catching future regressions of this bug class.

10 unit tests cover the cwd priority matrix, override semantics, guard cases,
and the no-instructionsRootPath-fallback regression.

Refs: docs/llm/adapter-cwd-fix.md
EOF
)"
```

---

## Task 2: ollama-local — port canonical cwd resolution + safety guard

**Files:**
- Modify: `packages/adapters/ollama-local/src/server/execute.ts:1-25` (imports), `:107-114` (cwd resolution)
- Create: `packages/adapters/ollama-local/src/server/execute.test.ts`

The change is identical to Task 1 except for the adapter-specific names (`PROVIDER_NAME`, `DEFAULT_OLLAMA_*`, `adapterType: "ollama_local"`). Repeating the test code in full so this task can be read independently of Task 1.

### Step 2.1: Create test file with all 10 tests

- [ ] **Step 2.1: Write all 10 tests for ollama-local upfront**

Create `packages/adapters/ollama-local/src/server/execute.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execute } from "./execute.js";

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return {
    ...actual,
    ensureAbsoluteDirectory: vi.fn().mockResolvedValue(undefined),
  };
});

interface CapturedMeta {
  cwd?: string;
}
function makeCtx(opts: {
  paperclipWorkspace?: Record<string, unknown> | null;
  configCwd?: string;
  instructionsRootPath?: string;
  paperclipInstanceRoot?: string;
}) {
  const meta: CapturedMeta = {};
  const ctx = {
    runId: "run-test",
    agent: { id: "a1", companyId: "c1", name: "Tester", adapterType: "ollama_local", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: {
      baseUrl: "http://127.0.0.1:1",
      model: "test-model",
      timeoutSec: 1,
      ...(opts.configCwd !== undefined ? { cwd: opts.configCwd } : {}),
      ...(opts.instructionsRootPath !== undefined ? { instructionsRootPath: opts.instructionsRootPath } : {}),
      ...(opts.paperclipInstanceRoot !== undefined
        ? { env: { PAPERCLIP_INSTANCE_ROOT: opts.paperclipInstanceRoot } }
        : {}),
    },
    context: opts.paperclipWorkspace === null
      ? {}
      : { paperclipWorkspace: opts.paperclipWorkspace ?? {} },
    onLog: async () => {},
    onMeta: async (m: { cwd?: string }) => {
      meta.cwd = m.cwd;
    },
    onSpawn: async () => {},
    authToken: undefined,
  };
  return { ctx, meta };
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ollama-local execute — cwd resolution", () => {
  it("U1: project_primary uses paperclipWorkspace.cwd", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/Users/x/Stapler/co/proj", source: "project_primary" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/Users/x/Stapler/co/proj");
  });

  it("U2: agent_home + explicit config.cwd uses configured override", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/workspaces/a1", source: "agent_home" },
      configCwd: "/tmp/custom",
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/tmp/custom");
  });

  it("U3: agent_home with no override uses paperclipWorkspace.cwd", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/workspaces/a1", source: "agent_home" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/i/workspaces/a1");
  });

  it("U4: nothing set falls back to process.cwd()", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: null,
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe(process.cwd());
  });

  it("U5: cwd in instructions/ is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: { cwd: "/i/companies/c/agents/a/instructions", source: "agent_home" },
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(/non-workspace directory/);
  });

  it("U6: cwd at instance/db is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: { cwd: "/i/db" },
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(/non-workspace directory/);
  });

  it("U7: cwd at instance/secrets via config.cwd is refused", async () => {
    const { ctx } = makeCtx({
      paperclipWorkspace: null,
      configCwd: "/i/secrets/master.key",
      paperclipInstanceRoot: "/i",
    });
    await expect(execute(ctx as never)).rejects.toThrow(/non-workspace directory/);
  });

  it("U8: cwd outside instance root passes guard", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/Users/x/Stapler/co/proj", source: "project_primary" },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/Users/x/Stapler/co/proj");
  });

  it("U9: guard disabled when PAPERCLIP_INSTANCE_ROOT is empty", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: { cwd: "/i/companies/c/agents/a/instructions", source: "agent_home" },
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/i/companies/c/agents/a/instructions");
  });

  it("U10: instructionsRootPath is NOT used as cwd fallback", async () => {
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: null,
      instructionsRootPath: "/i/companies/c/agents/a/instructions",
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe(process.cwd());
    expect(meta.cwd).not.toContain("/instructions");
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run:
```bash
pnpm --filter @paperclipai/adapter-ollama-local test:run
```

Expected: U1/U2/U3/U5/U6/U7/U10 FAIL (current code reads only config.cwd or falls back to instructionsRootPath); U4/U8/U9 PASS or FAIL depending on existing behavior — the important ones are the FAILs that the next step fixes.

### Step 2.3: Port canonical cwd block + safety guard

- [ ] **Step 2.3: Replace cwd resolution in ollama-local execute.ts**

Edit `packages/adapters/ollama-local/src/server/execute.ts`.

Replace lines 1-25 (imports) with:

```ts
// src/server/execute.ts
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildBundleTree,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_TOOLS,
  runAgentLoop,
  selectTools,
  summarizeSession,
  type ChatMessage,
} from "@paperclipai/adapter-openai-compat-local";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  PROVIDER_NAME,
} from "../index.js";

/**
 * Refuse adapter cwd that resolves inside `${PAPERCLIP_INSTANCE_ROOT}/`
 * unless it's under `${PAPERCLIP_INSTANCE_ROOT}/workspaces/`.
 * Defense-in-depth against regressions like the CMP-12 instructionsRootPath
 * fallback that wrote tool output into the read-only AGENTS.md bundle dir.
 */
function assertCwdNotInPaperclipManaged(cwd: string, instanceRoot: string): void {
  if (instanceRoot.length === 0) return;
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

Replace lines 110-114 (the old cwd resolution) with:

```ts
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  const instructionsRootPath = asString(config.instructionsRootPath, "");

  // Workspace cwd resolution — canonical pattern (mirrors claude-local).
  // Priority: paperclipWorkspace.cwd > config.cwd (override when agent_home) > process.cwd().
  // instructionsRootPath is NEVER a cwd fallback — only used by buildBundleTree below.
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome =
    workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  assertCwdNotInPaperclipManaged(
    cwd,
    asString(parseObject(config.env).PAPERCLIP_INSTANCE_ROOT, ""),
  );
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
```

Rest of the function unchanged.

- [ ] **Step 2.4: Run tests — verify all 10 pass**

Run:
```bash
pnpm --filter @paperclipai/adapter-ollama-local test:run
```

Expected: all 10 tests PASS.

### Step 2.5: Commit

- [ ] **Step 2.5: Commit ollama-local changes**

```bash
cd /Users/kangnam/projects/stapler
git add packages/adapters/ollama-local/src/server/execute.ts \
        packages/adapters/ollama-local/src/server/execute.test.ts
git commit -m "$(cat <<'EOF'
fix(ollama-local): use paperclipWorkspace.cwd as primary, add safety guard

Same fix as the lm-studio-local commit: replace the broken
`config.cwd ?? instructionsRootPath ?? process.cwd()` fallback with the
canonical pattern from claude-local, drop the instructionsRootPath fallback,
and add an adapter-side guard that refuses cwd inside the Paperclip instance
root unless it's under workspaces/.

Refs: docs/llm/adapter-cwd-fix.md
EOF
)"
```

---

## Task 3: heartbeat-cwd-fallback — extract single helper that handles both branches

**Files:**
- Modify: `server/src/services/heartbeat-cwd-fallback.ts`
- Create: `server/src/__tests__/heartbeat-cwd-fallback.test.ts`

### Step 3.1: Write failing tests for the new helper

- [ ] **Step 3.1: Create heartbeat-cwd-fallback.test.ts with 4 cases**

Create `server/src/__tests__/heartbeat-cwd-fallback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyWorkspaceCwdFallback,
  resolveRuntimeConfigCwd,
} from "../services/heartbeat-cwd-fallback.js";

describe("heartbeat-cwd-fallback", () => {
  describe("applyWorkspaceCwdFallback (existing)", () => {
    it("returns config unchanged when cwd already non-empty", () => {
      const result = applyWorkspaceCwdFallback(
        { cwd: "/already/set", model: "x" },
        { companyName: "Co", companyRootPath: null, projectName: "Proj", projectPathOverride: null },
      );
      expect(result.cwd).toBe("/already/set");
    });

    it("fills cwd from project resolver when missing", () => {
      const result = applyWorkspaceCwdFallback(
        { model: "x" },
        { companyName: "Co", companyRootPath: null, projectName: "Proj", projectPathOverride: null },
      );
      expect(typeof result.cwd).toBe("string");
      expect(result.cwd?.length ?? 0).toBeGreaterThan(0);
    });
  });

  describe("resolveRuntimeConfigCwd (new — handles both branches)", () => {
    it("I1: project + company present — uses project resolver", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: {
            companyName: "Co",
            companyRootPath: null,
            projectName: "Proj",
            projectPathOverride: null,
          },
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      // Resolved to project path, NOT fallbackCwd.
      expect(result.cwd).not.toBe("/i/workspaces/a1");
      expect(typeof result.cwd).toBe("string");
      expect(result.cwd?.length ?? 0).toBeGreaterThan(0);
    });

    it("I2: no project (goal-direct) — uses fallbackCwd", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: null,
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      expect(result.cwd).toBe("/i/workspaces/a1");
    });

    it("I3: no project, empty fallbackCwd — leaves config unchanged", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: null,
          fallbackCwd: "",
        },
      );
      expect(result.cwd).toBeUndefined();
    });

    it("user-set config.cwd is preserved across both branches", () => {
      const projectBranch = resolveRuntimeConfigCwd(
        { cwd: "/user/override", model: "x" },
        {
          projectCtx: {
            companyName: "Co",
            companyRootPath: null,
            projectName: "Proj",
            projectPathOverride: null,
          },
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      expect(projectBranch.cwd).toBe("/user/override");

      const noProjectBranch = resolveRuntimeConfigCwd(
        { cwd: "/user/override", model: "x" },
        { projectCtx: null, fallbackCwd: "/i/workspaces/a1" },
      );
      expect(noProjectBranch.cwd).toBe("/user/override");
    });
  });
});
```

- [ ] **Step 3.2: Run tests — verify they fail (resolveRuntimeConfigCwd doesn't exist)**

Run:
```bash
pnpm --filter "@paperclipai/server" test:run -- heartbeat-cwd-fallback
```

Expected: import error / `resolveRuntimeConfigCwd is not exported` for all `resolveRuntimeConfigCwd` tests; 2 `applyWorkspaceCwdFallback` tests PASS.

### Step 3.3: Implement resolveRuntimeConfigCwd

- [ ] **Step 3.3: Add resolveRuntimeConfigCwd to heartbeat-cwd-fallback.ts**

Replace `server/src/services/heartbeat-cwd-fallback.ts` with:

```ts
import { resolveForProject } from "./workspace-path-service.js";

export interface CwdFallbackProjectCtx {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

/**
 * Existing helper — kept for backward compatibility and direct use when
 * caller has already verified projectCtx is present.
 *
 * Returns config unchanged when `cwd` is already a non-empty trimmed string,
 * preserving any user override.
 */
export function applyWorkspaceCwdFallback<T extends Record<string, unknown> & { cwd?: string }>(
  config: T,
  projectCtx: CwdFallbackProjectCtx,
): T {
  if (typeof config.cwd === "string" && config.cwd.trim().length > 0) {
    return config;
  }
  const resolved = resolveForProject(projectCtx);
  return { ...config, cwd: resolved.resolvedAbsolutePath };
}

/**
 * Single resolver that handles both project-present and project-absent
 * branches. Goal-direct issues (no project) get cwd from `fallbackCwd`
 * (heartbeat passes `executionWorkspace.cwd` here).
 *
 * In all branches a non-empty existing `config.cwd` wins (user override).
 */
export function resolveRuntimeConfigCwd<T extends Record<string, unknown> & { cwd?: string }>(
  config: T,
  options: {
    projectCtx: CwdFallbackProjectCtx | null;
    fallbackCwd: string;
  },
): T {
  if (typeof config.cwd === "string" && config.cwd.trim().length > 0) {
    return config;
  }
  if (options.projectCtx) {
    return applyWorkspaceCwdFallback(config, options.projectCtx);
  }
  if (options.fallbackCwd.trim().length > 0) {
    return { ...config, cwd: options.fallbackCwd };
  }
  return config;
}
```

- [ ] **Step 3.4: Run tests — verify all 6 cases pass**

Run:
```bash
pnpm --filter "@paperclipai/server" test:run -- heartbeat-cwd-fallback
```

Expected: 6 cases PASS.

### Step 3.5: Commit

- [ ] **Step 3.5: Commit heartbeat-cwd-fallback changes**

```bash
cd /Users/kangnam/projects/stapler
git add server/src/services/heartbeat-cwd-fallback.ts \
        server/src/__tests__/heartbeat-cwd-fallback.test.ts
git commit -m "$(cat <<'EOF'
feat(heartbeat): add resolveRuntimeConfigCwd for both project / no-project branches

Extract the conditional cwd-fallback logic from heartbeat.ts:2151 into a
single helper that handles both branches. The no-project branch (goal-direct
issues) was previously skipped entirely, leaving runtimeConfig.cwd undefined
and forcing adapters into their own fallback chains. With this helper,
heartbeat.ts can call one function regardless of whether a project row exists.

Preserves applyWorkspaceCwdFallback for backward compatibility. The new
resolveRuntimeConfigCwd is the entry point heartbeat will call (next commit).

Refs: docs/llm/adapter-cwd-fix.md §3.2, §4
EOF
)"
```

---

## Task 4: heartbeat.ts — use resolveRuntimeConfigCwd + inject PAPERCLIP_INSTANCE_ROOT

**Files:**
- Modify: `server/src/services/heartbeat.ts:62` (import), `:2138-2158` (cwd conditional), `:adapterConfigEnv` injection point

This task changes heartbeat to call the new helper from Task 3 and injects `PAPERCLIP_INSTANCE_ROOT` into the env that adapters receive (so the safety guard added in Tasks 1 & 2 actually fires).

### Step 4.1: Locate the env-injection point

- [ ] **Step 4.1: Find where heartbeat sets the env passed to adapter**

Run:
```bash
grep -n "adapterConfig\|paperclipRuntimeSkills\|env:" /Users/kangnam/projects/stapler/server/src/services/heartbeat.ts | grep -v "^[0-9]*:.*//.*" | head -30
```

The relevant call point is the section around `runtimeConfig` (line 2131-2134) where `paperclipRuntimeSkills` is added. We'll inject `env.PAPERCLIP_INSTANCE_ROOT` into the same `runtimeConfig` object via a `env` field that the adapter merges into its own env.

Looking at the adapter code (e.g. `lm-studio-local/src/server/execute.ts:140-145`):
```ts
const envConfig = parseObject(config.env);
const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
env.PAPERCLIP_RUN_ID = runId;
for (const [k, v] of Object.entries(envConfig)) {
  if (typeof v === "string") env[k] = v;
}
```

So adapters merge `config.env` into their runtime env. We inject `PAPERCLIP_INSTANCE_ROOT` into `runtimeConfig.env`.

### Step 4.2: Modify heartbeat.ts

- [ ] **Step 4.2: Replace import + the cwd conditional + add env injection**

Edit `server/src/services/heartbeat.ts`.

**Change 1 — line 62 (import):**

Replace:
```ts
import { applyWorkspaceCwdFallback } from "./heartbeat-cwd-fallback.js";
```

with:
```ts
import { resolveRuntimeConfigCwd } from "./heartbeat-cwd-fallback.js";
```

**Change 2 — lines 33 (import) — verify resolvePaperclipInstanceRoot is importable:**

Edit line 33:
```ts
import { resolveDefaultAgentWorkspaceDir, resolveManagedProjectWorkspaceDir, resolveHomeAwarePath } from "../home-paths.js";
```

Add `resolvePaperclipInstanceRoot` to the import:
```ts
import { resolveDefaultAgentWorkspaceDir, resolveManagedProjectWorkspaceDir, resolveHomeAwarePath, resolvePaperclipInstanceRoot } from "../home-paths.js";
```

**Change 3 — lines 2131-2158 (runtimeConfig + cwd conditional):**

Find the block:
```ts
    const runtimeConfig = {
      ...resolvedConfig,
      paperclipRuntimeSkills: runtimeSkillEntries,
    };
    // Inject resolved workspace cwd when adapter config has no explicit cwd.
    // ...
    if (executionProjectRow && !company) {
      logger.warn(
        // ...
        "Skipping workspace cwd fallback: project row present but company not found",
      );
    }
    const runtimeConfigWithCwd = executionProjectRow && company
      ? applyWorkspaceCwdFallback(runtimeConfig, {
          companyName: company.name,
          companyRootPath: company.workspaceRootPath ?? null,
          projectName: executionProjectRow.name,
          projectPathOverride: executionProjectRow.workspacePathOverride ?? null,
        })
      : runtimeConfig;
```

Replace with:

```ts
    // Inject PAPERCLIP_INSTANCE_ROOT so adapter-side safety guards
    // (e.g. assertCwdNotInPaperclipManaged in lm-studio-local & ollama-local)
    // know the boundary that must not be written into. Best-effort — guard
    // becomes a no-op on resolve failure but main path still works.
    let paperclipInstanceRoot = "";
    try {
      paperclipInstanceRoot = resolvePaperclipInstanceRoot();
    } catch (instanceRootErr) {
      logger.warn(
        {
          runId: run.id,
          error: instanceRootErr instanceof Error ? instanceRootErr.message : String(instanceRootErr),
        },
        "Failed to resolve PAPERCLIP_INSTANCE_ROOT; adapter safety guard will be disabled for this run",
      );
    }
    const runtimeConfigEnv = {
      ...(parseObject((resolvedConfig as { env?: unknown }).env)),
      ...(paperclipInstanceRoot.length > 0 ? { PAPERCLIP_INSTANCE_ROOT: paperclipInstanceRoot } : {}),
    };
    const runtimeConfig = {
      ...resolvedConfig,
      paperclipRuntimeSkills: runtimeSkillEntries,
      env: runtimeConfigEnv,
    };

    if (executionProjectRow && !company) {
      // Should not happen — companyService.getById is called above for the
      // same companyId. Log so a missing company row is observable instead of
      // silently dropping the cwd fallback.
      logger.warn(
        {
          runId: run.id,
          companyId: agent.companyId,
          projectId: executionProjectId,
        },
        "Skipping workspace cwd fallback: project row present but company not found",
      );
    }

    // resolveRuntimeConfigCwd handles BOTH branches:
    // - executionProjectRow && company → resolveForProject (project workspace)
    // - else → fallbackCwd (executionWorkspace.cwd, set by realizeExecutionWorkspace below)
    // The fallbackCwd is computed AFTER realizeExecutionWorkspace, so we
    // re-apply this resolver after that call. For now compute the project
    // branch only; the no-project branch is filled in below.
    const projectCtx = (executionProjectRow && company)
      ? {
          companyName: company.name,
          companyRootPath: company.workspaceRootPath ?? null,
          projectName: executionProjectRow.name,
          projectPathOverride: executionProjectRow.workspacePathOverride ?? null,
        }
      : null;
    const runtimeConfigWithCwd = projectCtx
      ? resolveRuntimeConfigCwd(runtimeConfig, { projectCtx, fallbackCwd: "" })
      : runtimeConfig;
```

**Change 4 — after `realizeExecutionWorkspace` (around line 2213) — fill no-project branch:**

After the existing block:
```ts
    const executionWorkspace = await realizeExecutionWorkspace({
      base: { /* ... */ },
      config: runtimeConfigWithCwd,
      // ...
    });
```

Add immediately after:
```ts
    // No-project branch: fill cwd with the realized executionWorkspace.cwd
    // so adapters that fall back to config.cwd still get a valid value.
    // This was the heart of Bug B (CMP-12 incident).
    const runtimeConfigWithCwdResolved = projectCtx
      ? runtimeConfigWithCwd
      : resolveRuntimeConfigCwd(runtimeConfigWithCwd, {
          projectCtx: null,
          fallbackCwd: executionWorkspace.cwd ?? "",
        });
```

Then **find every subsequent reference to `runtimeConfigWithCwd`** in this function and replace with `runtimeConfigWithCwdResolved`. Use grep:
```bash
grep -n "runtimeConfigWithCwd" /Users/kangnam/projects/stapler/server/src/services/heartbeat.ts
```

Replace each match (except the two declarations above) with `runtimeConfigWithCwdResolved`.

### Step 4.3: Type-check the change

- [ ] **Step 4.3: Run typecheck**

```bash
cd /Users/kangnam/projects/stapler
pnpm -r typecheck
```

Expected: no type errors. If `(resolvedConfig as { env?: unknown }).env` triggers a complaint, add a comment justifying the cast or refine the type via `parseObject(resolvedConfig.env as unknown)`.

### Step 4.4: Run server tests

- [ ] **Step 4.4: Run server test suite to catch regressions**

```bash
pnpm --filter "@paperclipai/server" test:run
```

Expected: all PASS. Particularly watch:
- `heartbeat-cwd-fallback.test.ts` — still green from Task 3
- `ollama-local-adapter.test.ts` — must remain green; the test passes `cwd: "/tmp"` explicitly so the new fallback path isn't exercised

If `ollama-local-adapter.test.ts` fails because it expects `meta.env` to NOT contain `PAPERCLIP_INSTANCE_ROOT`, that's an unrelated assertion to update — but the existing test does not assert on env, so it should be fine.

### Step 4.5: Run adapter tests

- [ ] **Step 4.5: Run lm-studio-local + ollama-local tests one more time**

```bash
pnpm --filter @paperclipai/adapter-lm-studio-local test:run
pnpm --filter @paperclipai/adapter-ollama-local test:run
```

Expected: all 20 tests still PASS.

### Step 4.6: Commit

- [ ] **Step 4.6: Commit heartbeat changes**

```bash
cd /Users/kangnam/projects/stapler
git add server/src/services/heartbeat.ts
git commit -m "$(cat <<'EOF'
fix(heartbeat): inject cwd for goal-direct issues, expose PAPERCLIP_INSTANCE_ROOT

Replace the inline `executionProjectRow && company ? applyWorkspaceCwdFallback : runtimeConfig`
conditional with the new resolveRuntimeConfigCwd helper, which handles both
branches uniformly. Goal-direct issues (no project) previously skipped cwd
injection, leaving adapters to fall back to their own (sometimes broken)
defaults. Now they receive executionWorkspace.cwd as a backup channel.

Inject PAPERCLIP_INSTANCE_ROOT into the env passed to adapters so the
defense-in-depth safety guard added in lm-studio-local & ollama-local can
fire. Best-effort: a resolve failure logs a warning and disables the guard
without breaking the main path.

Resolves Bug B in docs/llm/adapter-cwd-fix.md. Together with the adapter
fixes (Bug A), CMP-12 incident chain is fully closed.

Refs: docs/llm/adapter-cwd-fix.md
EOF
)"
```

---

## Task 5: Verification Gate + manual E2E checklist

**Files:** none modified

### Step 5.1: Run full Verification Gate

- [ ] **Step 5.1: Typecheck, test, build (project §7)**

```bash
cd /Users/kangnam/projects/stapler
pnpm -r typecheck
```

Expected: no errors.

```bash
pnpm test:run
```

Expected: all PASS. New tests count: 10 (lm-studio) + 10 (ollama) + 6 (heartbeat-cwd-fallback) = 26 new green tests.

```bash
pnpm build
```

Expected: success across all workspace packages.

### Step 5.2: Smoke test — start dev server, verify clean boot

- [ ] **Step 5.2: Start dev server and confirm /api/health**

```bash
cd /Users/kangnam/projects/stapler
pnpm dev &
DEV_PID=$!
until curl -sf http://localhost:3100/api/health >/dev/null 2>&1; do sleep 2; done
curl -s http://localhost:3100/api/health
kill $DEV_PID
```

Expected: health JSON, no startup errors related to heartbeat or adapter loading.

### Step 5.3: Manual E2E checklist (run by user, not automated)

- [ ] **Step 5.3: Document E2E steps for user verification**

Per spec §8.3, the user should:

1. Start dev server: `pnpm dev`
2. Open UI at `http://localhost:3100`
3. Hire a `lm-studio-local` agent (qwen model on existing LM Studio endpoint)
4. Create company. Do NOT create a project. Assign goal-direct issue to the agent: title "Build a calculator app in SwiftUI", description with one-paragraph spec.
5. Wait for run to complete (or timeout).
6. Verify on disk:
   ```bash
   ls -la ~/.paperclip/instances/default/workspaces/<agentId>/
   ls -la ~/.paperclip/instances/default/companies/<companyId>/agents/<agentId>/instructions/
   ```
   - Calculator/ directory MUST exist under `workspaces/<agentId>/`
   - Calculator/ directory MUST NOT exist under `instructions/`
7. Trigger another run on the same agent (any small task). Confirm it does not fail with "This operation was aborted" due to context overflow.

If any of those checks fail, file findings in a follow-up issue. Do not amend Phase 1.

### Step 5.4: Final commit (if any verification fixes)

- [ ] **Step 5.4: If verification surfaced lint/format issues, commit them**

If `pnpm build` or `pnpm test:run` produced unrelated lint warnings that need addressing, fix them in a small follow-up commit. Otherwise this step is a no-op.

```bash
git status
# If clean: nothing to commit — done.
```

---

## Self-Review Checklist (the planner's, run before handoff)

**1. Spec coverage:**
- §3.1 audit findings (lm-studio + ollama broken) → Tasks 1, 2 ✅
- §3.2 heartbeat conditional → Task 4 (Change 3) ✅
- §3.3 symptom chain (CMP-12) → Tasks 1+2+4 close it; recovery is out of scope per §2 ✅
- §4 Architecture (canonical pattern + guard + heartbeat helper) → Tasks 1, 2, 3, 4 ✅
- §5 file changes table — 7 files: lm-studio execute.ts ✅, ollama execute.ts ✅, heartbeat.ts ✅, heartbeat-cwd-fallback.ts ✅ (kept + extended), 3 test files ✅
- §6 data flow — verified by I2 (Task 3) and U1/U3 (Tasks 1/2)
- §7.3 assertCwdNotInPaperclipManaged exact code → embedded in Task 1.4 and Task 2.3 ✅
- §8.1 unit matrix (10 cases × 2 adapters) → Task 1 (Steps 1.1, 1.6, 1.7, 1.8 = U1-U10) and Task 2 (Step 2.1 has all 10) ✅
- §8.2 integration (4 cases) → Task 3 covers I1, I2, I3, plus user-override case. I4 (env injection check) is implicit in Task 4.4/4.5 (server tests pass with new env field) — added as informal verification rather than explicit test
- §8.3 E2E → Task 5.3 ✅
- §9 TDD ordering → mirrored in Task structure ✅
- §11 Phase 2 — explicitly out of scope, called out in this plan's frontmatter ✅
- §12 Verification Gate → Task 5 ✅

**Gap:** §8.2 I4 ("env.PAPERCLIP_INSTANCE_ROOT injected") is not a dedicated test. The closest evidence is the adapter unit tests U5/U6/U7 which only fire because the env is set in the mock. To gain explicit coverage in heartbeat-side tests would require mocking `runChildProcess` or asserting on captured config, which adds complexity. **Decision:** ship Phase 1 without I4 explicit test; acceptable because (a) the env injection is a 3-line change, (b) the adapter side has 6 tests that exercise the env path. If a regression is later observed, Phase 2 helper extraction will absorb it into the shared helper's tests.

**2. Placeholder scan:** No "TBD", no "TODO", no "Similar to Task N" (Task 2 repeats code in full). All commit messages have actual content.

**3. Type consistency:**
- `assertCwdNotInPaperclipManaged(cwd: string, instanceRoot: string): void` — same signature in Tasks 1 and 2 ✅
- `resolveRuntimeConfigCwd<T>(config: T, options: { projectCtx: CwdFallbackProjectCtx | null; fallbackCwd: string }): T` — defined Task 3.3, used Task 4.2 with matching shape ✅
- `paperclipInstanceRoot` (string) — same name and type in Task 4.2 and adapter usage ✅
- `runtimeConfigWithCwd` → `runtimeConfigWithCwdResolved` rename in Task 4.2 — instructed to grep + replace; risk of incomplete replace flagged in step ✅
- `PAPERCLIP_INSTANCE_ROOT` env key — same string everywhere ✅

---

## Execution Handoff

Plan complete and saved to `doc/plans/2026-04-19-adapter-cwd-fix-phase-1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (Tasks 1–4 each get their own implementer + spec reviewer + code quality reviewer), I review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints for your review.

Which approach?
