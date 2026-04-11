// server/src/__tests__/openai-compat-tools-bash.test.ts
import { describe, expect, it } from "vitest";
import { bashTool } from "@paperclipai/adapter-openai-compat-local/tools";
import os from "node:os";

describe("bash tool", () => {
  const ctx = {
    cwd: os.tmpdir(),
    env: { ...process.env } as Record<string, string>,
    onLog: async () => {},
  };

  it("has correct OpenAI tool definition", () => {
    expect(bashTool.name).toBe("bash");
    expect(bashTool.definition.function.name).toBe("bash");
    expect(bashTool.definition.function.parameters.required).toContain("command");
  });

  it("executes a simple command and returns stdout", async () => {
    const out = await bashTool.execute({ command: "echo paperclip-test-output" }, ctx);
    expect(out).toContain("paperclip-test-output");
  });

  it("captures stderr in returned output", async () => {
    const out = await bashTool.execute({ command: "ls /definitely-does-not-exist-123" }, ctx);
    expect(out.toLowerCase()).toMatch(/no such file|not found|cannot access/);
  });

  it("truncates output beyond 8KB", async () => {
    const out = await bashTool.execute(
      { command: `python3 -c "print('x' * 20000)"` },
      ctx,
    );
    expect(out.length).toBeLessThanOrEqual(8 * 1024 + 200); // truncation marker allowance
    expect(out).toMatch(/truncated/);
  });

  it("rejects missing command arg", async () => {
    await expect(bashTool.execute({}, ctx)).rejects.toThrow(/command/);
  });
});
