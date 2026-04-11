// src/tools/bash.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolExecutor } from "../types.js";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_BYTES = 8 * 1024;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return `${text.slice(0, MAX_OUTPUT_BYTES)}\n[...truncated ${text.length - MAX_OUTPUT_BYTES} bytes]`;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const bashTool: ToolExecutor = {
  name: "bash",
  definition: {
    type: "function",
    function: {
      name: "bash",
      description:
        "Execute a shell command in the agent's working directory. Returns combined stdout+stderr, truncated at 8KB.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute (run via `bash -c`).",
          },
        },
        required: ["command"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const command = asString((args as Record<string, unknown>).command);
    if (!command) throw new Error("bash: missing required argument 'command'");

    try {
      const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
        cwd: ctx.cwd,
        env: ctx.env,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000,
      });
      const combined = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`;
      return truncate(combined);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
      const combined = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}${
        e.message ? `\n[error]\n${e.message}` : ""
      }`;
      return truncate(combined || `bash exited with code ${e.code ?? -1}`);
    }
  },
};
