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

  it("U11: cwd in projects/ subtree (managed project workspace) passes guard", async () => {
    // ensureManagedProjectWorkspace builds cwd under
    // ${INSTANCE_ROOT}/projects/{companyId}/{projectId}/{repoName or _default}
    // and heartbeat passes that as paperclipWorkspace.cwd with source "project_primary".
    // The guard must allow this — it is a legitimate Paperclip-managed project workspace,
    // distinct from the read-only instructions/ bundle that CMP-12 was about.
    const { ctx, meta } = makeCtx({
      paperclipWorkspace: {
        cwd: "/i/projects/c1/p1/_default",
        source: "project_primary",
      },
      paperclipInstanceRoot: "/i",
    });
    await execute(ctx as never);
    expect(meta.cwd).toBe("/i/projects/c1/p1/_default");
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
