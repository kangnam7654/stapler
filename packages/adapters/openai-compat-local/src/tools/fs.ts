// src/tools/fs.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext, ToolExecutor } from "../types.js";

const MAX_READ_BYTES = 256 * 1024;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolvePath(inputPath: string, cwd: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(cwd, inputPath);
}

export const readFileTool: ToolExecutor = {
  name: "read_file",
  definition: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from disk. Paths are relative to the agent cwd unless absolute.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (absolute or relative to cwd)." },
        },
        required: ["path"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const p = asString((args as Record<string, unknown>).path);
    if (!p) throw new Error("read_file: missing required argument 'path'");
    const resolved = resolvePath(p, ctx.cwd);
    const buf = await fs.readFile(resolved);
    if (buf.byteLength > MAX_READ_BYTES) {
      return `${buf.subarray(0, MAX_READ_BYTES).toString("utf8")}\n[...truncated ${buf.byteLength - MAX_READ_BYTES} bytes]`;
    }
    return buf.toString("utf8");
  },
};

export const writeFileTool: ToolExecutor = {
  name: "write_file",
  definition: {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file on disk with the given content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (absolute or relative to cwd)." },
          content: { type: "string", description: "File content to write." },
        },
        required: ["path", "content"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const obj = args as Record<string, unknown>;
    const p = asString(obj.path);
    if (!p) throw new Error("write_file: missing required argument 'path'");
    if (typeof obj.content !== "string") throw new Error("write_file: missing required argument 'content'");
    const resolved = resolvePath(p, ctx.cwd);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, obj.content, "utf8");
    return `wrote ${obj.content.length} chars to ${resolved}`;
  },
};

export const listDirTool: ToolExecutor = {
  name: "list_dir",
  definition: {
    type: "function",
    function: {
      name: "list_dir",
      description: "List entries in a directory. Returns one entry per line with type markers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (absolute or relative to cwd)." },
        },
        required: ["path"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const p = asString((args as Record<string, unknown>).path);
    if (!p) throw new Error("list_dir: missing required argument 'path'");
    const resolved = resolvePath(p, ctx.cwd);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    if (entries.length === 0) return "(empty directory)";
    return entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join("\n");
  },
};
