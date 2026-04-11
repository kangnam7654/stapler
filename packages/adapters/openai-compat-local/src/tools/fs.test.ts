import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { readFileTool, writeFileTool, listDirTool } from "./fs.js";
import type { ToolContext } from "../types.js";

describe("Filesystem Tools", () => {
  let tempDir: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = path.join(process.cwd(), `.test-fs-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    ctx = {
      cwd: tempDir,
      env: process.env as Record<string, string>,
      onLog: async () => {
        // no-op for tests
      },
    };
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("writeFileTool + readFileTool round-trip", () => {
    it("should write and read file with same content", async () => {
      const content = "Hello, World!";
      const filename = "test.txt";

      // Write file
      const writeResult = await writeFileTool.execute({ path: filename, content }, ctx);
      expect(writeResult).toContain(`wrote ${content.length} chars`);

      // Read file
      const readResult = await readFileTool.execute({ path: filename }, ctx);
      expect(readResult).toBe(content);
    });

    it("should preserve multiline content", async () => {
      const content = "line 1\nline 2\nline 3";
      const filename = "multiline.txt";

      await writeFileTool.execute({ path: filename, content }, ctx);
      const readResult = await readFileTool.execute({ path: filename }, ctx);
      expect(readResult).toBe(content);
    });

    it("should handle Unicode content", async () => {
      const content = "Hello 世界 🌍";
      const filename = "unicode.txt";

      await writeFileTool.execute({ path: filename, content }, ctx);
      const readResult = await readFileTool.execute({ path: filename }, ctx);
      expect(readResult).toBe(content);
    });
  });

  describe("readFileTool absolute path resolution", () => {
    it("should resolve relative paths against cwd", async () => {
      const content = "relative path test";
      const filename = "relative.txt";

      // cwd is tempDir, so "relative.txt" should resolve to tempDir/relative.txt
      await writeFileTool.execute({ path: filename, content }, ctx);

      const fileOnDisk = path.join(tempDir, filename);
      const stat = await fs.stat(fileOnDisk);
      expect(stat.isFile()).toBe(true);

      const readResult = await readFileTool.execute({ path: filename }, ctx);
      expect(readResult).toBe(content);
    });

    it("should handle absolute paths", async () => {
      const content = "absolute path test";
      const absolutePath = path.join(tempDir, "absolute.txt");

      // Write with absolute path (from outside cwd)
      const originalCwd = ctx.cwd;
      ctx.cwd = "/"; // Set cwd to different directory
      await writeFileTool.execute({ path: absolutePath, content }, ctx);
      ctx.cwd = originalCwd; // Restore for read

      const readResult = await readFileTool.execute({ path: absolutePath }, ctx);
      expect(readResult).toBe(content);
    });

    it("should resolve nested relative paths", async () => {
      const content = "nested content";
      const nestedPath = "subdir/nested.txt";

      // This should create subdir and the file inside
      await writeFileTool.execute({ path: nestedPath, content }, ctx);

      const readResult = await readFileTool.execute({ path: nestedPath }, ctx);
      expect(readResult).toBe(content);

      // Verify the file exists at correct location
      const fileOnDisk = path.join(tempDir, nestedPath);
      const stat = await fs.stat(fileOnDisk);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe("listDirTool directory listing", () => {
    it("should return empty directory marker for empty dir", async () => {
      const result = await listDirTool.execute({ path: "." }, ctx);
      expect(result).toBe("(empty directory)");
    });

    it("should list files and directories with type markers", async () => {
      // Create test structure
      await writeFileTool.execute({ path: "file1.txt", content: "content1" }, ctx);
      await writeFileTool.execute({ path: "file2.txt", content: "content2" }, ctx);
      await fs.mkdir(path.join(tempDir, "subdir"));

      const result = await listDirTool.execute({ path: "." }, ctx);
      const lines = result.split("\n");

      // Should have 3 entries, sorted
      expect(lines).toHaveLength(3);
      expect(lines).toContain("file1.txt");
      expect(lines).toContain("file2.txt");
      expect(lines).toContain("subdir/");

      // Verify sorting
      expect(lines[0]).toBe("file1.txt");
      expect(lines[1]).toBe("file2.txt");
      expect(lines[2]).toBe("subdir/");
    });

    it("should sort entries alphabetically", async () => {
      // Create files in non-alphabetical order
      await writeFileTool.execute({ path: "zebra.txt", content: "z" }, ctx);
      await writeFileTool.execute({ path: "apple.txt", content: "a" }, ctx);
      await writeFileTool.execute({ path: "mango.txt", content: "m" }, ctx);

      const result = await listDirTool.execute({ path: "." }, ctx);
      const lines = result.split("\n");

      expect(lines).toEqual(["apple.txt", "mango.txt", "zebra.txt"]);
    });

    it("should distinguish files from directories", async () => {
      await writeFileTool.execute({ path: "regular_file.txt", content: "file" }, ctx);
      await fs.mkdir(path.join(tempDir, "directory"));

      const result = await listDirTool.execute({ path: "." }, ctx);
      const lines = result.split("\n");

      // Directory should have trailing slash, file should not
      const dirLine = lines.find((l) => l.includes("directory"));
      const fileLine = lines.find((l) => l.includes("regular_file"));

      expect(dirLine).toBe("directory/");
      expect(fileLine).toBe("regular_file.txt");
    });

    it("should handle relative paths", async () => {
      await fs.mkdir(path.join(tempDir, "subdir"));
      await writeFileTool.execute({ path: "subdir/file.txt", content: "nested" }, ctx);

      const result = await listDirTool.execute({ path: "subdir" }, ctx);
      expect(result).toBe("file.txt");
    });
  });

  describe("Large file handling", () => {
    it("should truncate files larger than 256KB on read", async () => {
      const largeContent = "x".repeat(300 * 1024); // 300KB
      const filename = "large.txt";

      await writeFileTool.execute({ path: filename, content: largeContent }, ctx);
      const readResult = await readFileTool.execute({ path: filename }, ctx);

      // Should have truncation marker
      expect(readResult).toContain("[...truncated");
      // Should contain first 256KB worth
      expect(readResult.length).toBeLessThan(largeContent.length);
      expect(readResult.length).toBeGreaterThan(256 * 1024);
    });

    it("should not truncate files exactly at 256KB", async () => {
      const exactContent = "y".repeat(256 * 1024); // Exactly 256KB
      const filename = "exact.txt";

      await writeFileTool.execute({ path: filename, content: exactContent }, ctx);
      const readResult = await readFileTool.execute({ path: filename }, ctx);

      expect(readResult).toBe(exactContent);
      expect(readResult).not.toContain("[...truncated");
    });

    it("should handle small files without truncation", async () => {
      const smallContent = "Small content";
      const filename = "small.txt";

      await writeFileTool.execute({ path: filename, content: smallContent }, ctx);
      const readResult = await readFileTool.execute({ path: filename }, ctx);

      expect(readResult).toBe(smallContent);
      expect(readResult).not.toContain("[...truncated");
    });
  });

  describe("Missing arguments", () => {
    it("readFileTool should throw on missing path", async () => {
      await expect(readFileTool.execute({}, ctx)).rejects.toThrow(
        /read_file.*missing required argument 'path'/
      );
    });

    it("readFileTool should throw on empty path string", async () => {
      await expect(readFileTool.execute({ path: "" }, ctx)).rejects.toThrow(
        /read_file.*missing required argument 'path'/
      );
    });

    it("readFileTool should throw on null path", async () => {
      await expect(readFileTool.execute({ path: null }, ctx)).rejects.toThrow(
        /read_file.*missing required argument 'path'/
      );
    });

    it("writeFileTool should throw on missing path", async () => {
      await expect(
        writeFileTool.execute({ content: "some content" }, ctx)
      ).rejects.toThrow(/write_file.*missing required argument 'path'/);
    });

    it("writeFileTool should throw on empty path string", async () => {
      await expect(
        writeFileTool.execute({ path: "", content: "some content" }, ctx)
      ).rejects.toThrow(/write_file.*missing required argument 'path'/);
    });

    it("writeFileTool should throw on missing content", async () => {
      await expect(
        writeFileTool.execute({ path: "file.txt" }, ctx)
      ).rejects.toThrow(/write_file.*missing required argument 'content'/);
    });

    it("writeFileTool should throw on null content", async () => {
      await expect(
        writeFileTool.execute({ path: "file.txt", content: null }, ctx)
      ).rejects.toThrow(/write_file.*missing required argument 'content'/);
    });

    it("listDirTool should throw on missing path", async () => {
      await expect(listDirTool.execute({}, ctx)).rejects.toThrow(
        /list_dir.*missing required argument 'path'/
      );
    });

    it("listDirTool should throw on empty path string", async () => {
      await expect(listDirTool.execute({ path: "" }, ctx)).rejects.toThrow(
        /list_dir.*missing required argument 'path'/
      );
    });

    it("listDirTool should throw on null path", async () => {
      await expect(listDirTool.execute({ path: null }, ctx)).rejects.toThrow(
        /list_dir.*missing required argument 'path'/
      );
    });
  });

  describe("Tool properties", () => {
    it("readFileTool should have correct name", () => {
      expect(readFileTool.name).toBe("read_file");
    });

    it("writeFileTool should have correct name", () => {
      expect(writeFileTool.name).toBe("write_file");
    });

    it("listDirTool should have correct name", () => {
      expect(listDirTool.name).toBe("list_dir");
    });

    it("all tools should have ToolDefinition", () => {
      expect(readFileTool.definition).toBeDefined();
      expect(readFileTool.definition.type).toBe("function");
      expect(readFileTool.definition.function.name).toBe("read_file");

      expect(writeFileTool.definition).toBeDefined();
      expect(writeFileTool.definition.type).toBe("function");
      expect(writeFileTool.definition.function.name).toBe("write_file");

      expect(listDirTool.definition).toBeDefined();
      expect(listDirTool.definition.type).toBe("function");
      expect(listDirTool.definition.function.name).toBe("list_dir");
    });
  });
});
