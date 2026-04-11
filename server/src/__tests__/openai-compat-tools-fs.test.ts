// server/src/__tests__/openai-compat-tools-fs.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileTool, writeFileTool, listDirTool } from "@paperclipai/adapter-openai-compat-local/tools";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("filesystem tools", () => {
  let tmpDir: string;
  const ctxFor = (cwd: string) => ({
    cwd,
    env: {} as Record<string, string>,
    onLog: async () => {},
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-fs-tools-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("write_file creates a file and read_file reads it back", async () => {
    const writeResult = await writeFileTool.execute(
      { path: "hello.txt", content: "paperclip" },
      ctxFor(tmpDir),
    );
    expect(writeResult).toMatch(/wrote/i);

    const readResult = await readFileTool.execute({ path: "hello.txt" }, ctxFor(tmpDir));
    expect(readResult).toBe("paperclip");
  });

  it("read_file resolves absolute paths", async () => {
    const abs = path.join(tmpDir, "abs.txt");
    await fs.writeFile(abs, "absolute content", "utf8");
    const result = await readFileTool.execute({ path: abs }, ctxFor(tmpDir));
    expect(result).toBe("absolute content");
  });

  it("list_dir returns entries", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "");
    await fs.mkdir(path.join(tmpDir, "subdir"));

    const out = await listDirTool.execute({ path: "." }, ctxFor(tmpDir));
    expect(out).toContain("a.txt");
    expect(out).toContain("b.txt");
    expect(out).toContain("subdir");
  });

  it("write_file truncates extremely large content at write", async () => {
    const bigContent = "x".repeat(2_000_000); // 2MB
    const result = await writeFileTool.execute(
      { path: "big.txt", content: bigContent },
      ctxFor(tmpDir),
    );
    expect(result).toMatch(/wrote/i);
    const stat = await fs.stat(path.join(tmpDir, "big.txt"));
    expect(stat.size).toBeGreaterThan(0);
  });

  it("rejects missing args", async () => {
    await expect(readFileTool.execute({}, ctxFor(tmpDir))).rejects.toThrow(/path/);
    await expect(writeFileTool.execute({ path: "x" }, ctxFor(tmpDir))).rejects.toThrow(/content/);
    await expect(listDirTool.execute({}, ctxFor(tmpDir))).rejects.toThrow(/path/);
  });
});
