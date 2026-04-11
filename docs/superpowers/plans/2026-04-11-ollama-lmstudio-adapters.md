# Ollama & LM Studio Full Agentic Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full agentic adapters for Ollama and LM Studio — locally-running OpenAI-compatible model servers — so Paperclip agents can run on zero-cost local models with Paperclip API access, shell commands, and file tools.

**Architecture:** One shared core package (`openai-compat-local`) contains the tool-use loop, tool definitions, HTTP client, and session summarization. Two thin wrapper packages (`ollama-local`, `lm-studio-local`) provide adapter metadata, default URLs, and dynamic model discovery. Each wrapper's `execute()` delegates to the shared core.

**Tech Stack:** TypeScript, Node 20+ (global `fetch`), vitest, existing `@paperclipai/adapter-utils` infrastructure. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-11-ollama-lmstudio-adapters-design.md`

---

## File Structure Overview

### New files (created)

**Shared core:**
```
packages/adapters/openai-compat-local/
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts
    ├── client.ts
    ├── tools/
    │   ├── index.ts
    │   ├── paperclip-request.ts
    │   ├── bash.ts
    │   └── fs.ts
    ├── loop.ts
    ├── summarize.ts
    └── index.ts
```

**Ollama wrapper:**
```
packages/adapters/ollama-local/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server/
    │   ├── index.ts
    │   └── execute.ts
    ├── ui/
    │   ├── index.ts
    │   └── build-config.ts
    └── cli/
        └── index.ts
```

**LM Studio wrapper:**
```
packages/adapters/lm-studio-local/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── server/
    │   ├── index.ts
    │   └── execute.ts
    ├── ui/
    │   ├── index.ts
    │   └── build-config.ts
    └── cli/
        └── index.ts
```

**UI adapters:**
```
ui/src/adapters/ollama-local/
├── index.ts
└── config-fields.tsx

ui/src/adapters/lm-studio-local/
├── index.ts
└── config-fields.tsx
```

**Server tests:**
```
server/src/__tests__/
├── openai-compat-loop.test.ts
├── openai-compat-tools.test.ts
├── ollama-local-adapter.test.ts
└── lm-studio-local-adapter.test.ts
```

### Existing files (modified)

- `server/src/adapters/registry.ts` — register both new adapters
- `ui/src/adapters/registry.ts` — register both UI adapters
- `ui/src/components/NewAgentDialog.tsx` — add adapter options
- `ui/src/components/AgentProperties.tsx` — add label mappings
- `ui/src/locales/en.json` (or equivalent) — add labels/descriptions

---

## Milestone 1 — Core Package Scaffold

### Task 1: Scaffold `openai-compat-local` package

**Files:**
- Create: `packages/adapters/openai-compat-local/package.json`
- Create: `packages/adapters/openai-compat-local/tsconfig.json`
- Create: `packages/adapters/openai-compat-local/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@paperclipai/adapter-openai-compat-local",
  "version": "0.0.1",
  "license": "MIT",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./dist/index.js",
    "./loop": "./dist/loop.js",
    "./tools": "./dist/tools/index.js",
    "./summarize": "./dist/summarize.js",
    "./client": "./dist/client.js",
    "./types": "./dist/types.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paperclipai/adapter-utils": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.6.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create empty barrel export**

```ts
// src/index.ts
export {};
```

- [ ] **Step 4: Install workspace and verify typecheck passes**

Run: `pnpm install && pnpm --filter @paperclipai/adapter-openai-compat-local typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/openai-compat-local pnpm-lock.yaml
git commit -m "feat(adapters): scaffold openai-compat-local core package"
```

---

### Task 2: Define shared types

**Files:**
- Create: `packages/adapters/openai-compat-local/src/types.ts`

- [ ] **Step 1: Write types.ts**

```ts
// src/types.ts
export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none";
  temperature?: number;
  stream?: false;
}

export interface ChatCompletionResponse {
  id?: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolContext {
  cwd: string;
  env: Record<string, string>;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}

export interface ToolExecutor {
  name: string;
  definition: ToolDefinition;
  execute(args: unknown, ctx: ToolContext): Promise<string>;
}

export interface AgentLoopOptions {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolExecutor[];
  enabledToolNames?: string[];
  timeoutMs: number;
  env: Record<string, string>;
  cwd: string;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}

export interface AgentLoopResult {
  messages: ChatMessage[];
  finishReason: "done" | "timeout" | "error";
  errorMessage: string | null;
  usage: { inputTokens: number; outputTokens: number };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/openai-compat-local/src/types.ts
git commit -m "feat(adapters): define openai-compat-local shared types"
```

---

## Milestone 2 — HTTP Client (TDD)

### Task 3: Write failing test for chat completion client

**Files:**
- Create: `server/src/__tests__/openai-compat-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/__tests__/openai-compat-client.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion } from "@paperclipai/adapter-openai-compat-local/client";

describe("openai-compat-local client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to /v1/chat/completions with correct body and returns parsed response", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await chatCompletion({
      baseUrl: "http://localhost:11434",
      request: {
        model: "llama3.1",
        messages: [{ role: "user", content: "hello" }],
      },
      timeoutMs: 5000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    expect(result.choices[0].message.content).toBe("hi");
    expect(result.usage?.prompt_tokens).toBe(5);
  });

  it("throws with HTTP status when response is not ok", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response("model not found", { status: 404 }),
    );

    await expect(
      chatCompletion({
        baseUrl: "http://localhost:11434",
        request: { model: "ghost", messages: [] },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/404/);
  });

  it("aborts request when timeout fires", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      chatCompletion({
        baseUrl: "http://localhost:11434",
        request: { model: "slow", messages: [] },
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-client.test.ts`
Expected: FAIL with "Cannot find module" or similar — `client.ts` does not exist yet.

---

### Task 4: Implement chat completion client

**Files:**
- Create: `packages/adapters/openai-compat-local/src/client.ts`

- [ ] **Step 1: Write client.ts**

```ts
// src/client.ts
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types.js";

export interface ChatCompletionArgs {
  baseUrl: string;
  request: ChatCompletionRequest;
  timeoutMs: number;
  apiKey?: string;
}

export async function chatCompletion(args: ChatCompletionArgs): Promise<ChatCompletionResponse> {
  const { baseUrl, request, timeoutMs, apiKey } = args;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey.length > 0) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `chat completion failed: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      );
    }

    return (await response.json()) as ChatCompletionResponse;
  } finally {
    clearTimeout(timer);
  }
}

export interface ListModelsArgs {
  baseUrl: string;
  timeoutMs: number;
  apiKey?: string;
  style: "openai" | "ollama";
}

export async function listRemoteModels(args: ListModelsArgs): Promise<string[]> {
  const { baseUrl, timeoutMs, apiKey, style } = args;
  const path = style === "ollama" ? "/api/tags" : "/v1/models";
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.length > 0) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (!response.ok) return [];
    const json = (await response.json()) as unknown;
    if (style === "ollama") {
      const models = (json as { models?: Array<{ name?: string }> }).models ?? [];
      return models.map((m) => m.name ?? "").filter((n) => n.length > 0);
    }
    const data = (json as { data?: Array<{ id?: string }> }).data ?? [];
    return data.map((m) => m.id ?? "").filter((n) => n.length > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Add dev dependency on core package from server**

Edit `server/package.json` to add in `devDependencies`:
```json
    "@paperclipai/adapter-openai-compat-local": "workspace:*",
```

- [ ] **Step 3: Run pnpm install and build core**

Run: `pnpm install && pnpm --filter @paperclipai/adapter-openai-compat-local build`
Expected: Build succeeds, `dist/client.js` exists.

- [ ] **Step 4: Run the client tests to verify they pass**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-client.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/openai-compat-local/src/client.ts server/package.json server/src/__tests__/openai-compat-client.test.ts pnpm-lock.yaml
git commit -m "feat(adapters): add openai-compat chat completion and model list client"
```

---

## Milestone 3 — Tools (TDD)

### Task 5: Implement and test `bash` tool

**Files:**
- Create: `packages/adapters/openai-compat-local/src/tools/bash.ts`
- Create: `server/src/__tests__/openai-compat-tools-bash.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-bash.test.ts`
Expected: FAIL — `bashTool` not exported.

- [ ] **Step 3: Write bash.ts**

```ts
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
```

- [ ] **Step 4: Create barrel export**

```ts
// src/tools/index.ts
export { bashTool } from "./bash.js";
```

- [ ] **Step 5: Build core and run tests**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local build && pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-bash.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/openai-compat-local/src/tools server/src/__tests__/openai-compat-tools-bash.test.ts
git commit -m "feat(adapters): add bash tool with execFile safety and truncation"
```

---

### Task 6: Implement and test filesystem tools (read_file, write_file, list_dir)

**Files:**
- Create: `packages/adapters/openai-compat-local/src/tools/fs.ts`
- Modify: `packages/adapters/openai-compat-local/src/tools/index.ts`
- Create: `server/src/__tests__/openai-compat-tools-fs.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-fs.test.ts`
Expected: FAIL — tools not exported.

- [ ] **Step 3: Write fs.ts**

```ts
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
```

- [ ] **Step 4: Update tools barrel export**

```ts
// src/tools/index.ts
export { bashTool } from "./bash.js";
export { readFileTool, writeFileTool, listDirTool } from "./fs.js";
```

- [ ] **Step 5: Build and run tests**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local build && pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-fs.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/openai-compat-local/src/tools server/src/__tests__/openai-compat-tools-fs.test.ts
git commit -m "feat(adapters): add read_file, write_file, list_dir tools"
```

---

### Task 7: Implement and test `paperclip_request` tool

**Files:**
- Create: `packages/adapters/openai-compat-local/src/tools/paperclip-request.ts`
- Modify: `packages/adapters/openai-compat-local/src/tools/index.ts`
- Create: `server/src/__tests__/openai-compat-tools-paperclip.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/src/__tests__/openai-compat-tools-paperclip.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { paperclipRequestTool } from "@paperclipai/adapter-openai-compat-local/tools";

describe("paperclip_request tool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const ctxWithEnv = (env: Record<string, string>) => ({
    cwd: "/tmp",
    env,
    onLog: async () => {},
  });

  it("has correct tool definition", () => {
    expect(paperclipRequestTool.definition.function.name).toBe("paperclip_request");
    expect(paperclipRequestTool.definition.function.parameters.required).toContain("method");
    expect(paperclipRequestTool.definition.function.parameters.required).toContain("path");
  });

  it("issues GET request with Authorization header from env", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "agent-1", name: "CEO" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const out = await paperclipRequestTool.execute(
      { method: "GET", path: "/api/agents/me" },
      ctxWithEnv({ PAPERCLIP_API_URL: "https://pc.example", PAPERCLIP_API_KEY: "secret-abc" }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://pc.example/api/agents/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer secret-abc" }),
      }),
    );
    expect(out).toContain("agent-1");
  });

  it("serializes body for POST", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));

    await paperclipRequestTool.execute(
      { method: "POST", path: "/api/issues/abc/comments", body: { body: "hello" } },
      ctxWithEnv({ PAPERCLIP_API_URL: "http://localhost:3100", PAPERCLIP_API_KEY: "k" }),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ body: "hello" }));
  });

  it("returns non-2xx status in response text", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response('{"error":"not found"}', { status: 404 }));

    const out = await paperclipRequestTool.execute(
      { method: "GET", path: "/api/issues/missing" },
      ctxWithEnv({ PAPERCLIP_API_URL: "http://x", PAPERCLIP_API_KEY: "k" }),
    );

    expect(out).toMatch(/404/);
    expect(out).toMatch(/not found/);
  });

  it("throws when PAPERCLIP_API_URL is missing from env", async () => {
    await expect(
      paperclipRequestTool.execute(
        { method: "GET", path: "/api/health" },
        ctxWithEnv({ PAPERCLIP_API_KEY: "k" }),
      ),
    ).rejects.toThrow(/PAPERCLIP_API_URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-paperclip.test.ts`
Expected: FAIL — tool not exported.

- [ ] **Step 3: Write paperclip-request.ts**

```ts
// src/tools/paperclip-request.ts
import type { ToolContext, ToolExecutor } from "../types.js";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "PUT"]);

export const paperclipRequestTool: ToolExecutor = {
  name: "paperclip_request",
  definition: {
    type: "function",
    function: {
      name: "paperclip_request",
      description:
        "Make an authenticated HTTP request to the Paperclip control plane API. Uses PAPERCLIP_API_URL and PAPERCLIP_API_KEY from the agent environment.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            description: "HTTP method",
            enum: ["GET", "POST", "PATCH", "DELETE", "PUT"],
          },
          path: {
            type: "string",
            description: "URL path (must start with /api/...)",
          },
          body: {
            type: "object",
            description: "Optional JSON request body.",
          },
        },
        required: ["method", "path"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const obj = args as Record<string, unknown>;
    const method = (asString(obj.method) ?? "").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`paperclip_request: unsupported method '${method}'`);
    }
    const pth = asString(obj.path);
    if (!pth) throw new Error("paperclip_request: missing required argument 'path'");

    const apiUrl = ctx.env.PAPERCLIP_API_URL;
    if (!apiUrl) throw new Error("paperclip_request: PAPERCLIP_API_URL not set in agent environment");
    const apiKey = ctx.env.PAPERCLIP_API_KEY ?? "";

    const url = `${apiUrl.replace(/\/+$/, "")}${pth.startsWith("/") ? pth : `/${pth}`}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey.length > 0) headers.Authorization = `Bearer ${apiKey}`;

    const init: RequestInit = { method, headers };
    if (obj.body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(obj.body);
    }

    // Log request without the Authorization header value.
    await ctx.onLog(
      "stdout",
      `[paperclip_request] ${method} ${url}\n`,
    );

    const response = await fetch(url, init);
    const text = await response.text();
    if (!response.ok) {
      return `HTTP ${response.status}\n${text.slice(0, 4096)}`;
    }
    return text.slice(0, 16 * 1024);
  },
};
```

- [ ] **Step 4: Update tools barrel export**

```ts
// src/tools/index.ts
export { bashTool } from "./bash.js";
export { readFileTool, writeFileTool, listDirTool } from "./fs.js";
export { paperclipRequestTool } from "./paperclip-request.js";

import { bashTool } from "./bash.js";
import { readFileTool, writeFileTool, listDirTool } from "./fs.js";
import { paperclipRequestTool } from "./paperclip-request.js";
import type { ToolExecutor } from "../types.js";

export const DEFAULT_TOOLS: ToolExecutor[] = [
  paperclipRequestTool,
  bashTool,
  readFileTool,
  writeFileTool,
  listDirTool,
];

export function selectTools(enabled: string[] | undefined, all: ToolExecutor[] = DEFAULT_TOOLS): ToolExecutor[] {
  if (!enabled || enabled.length === 0) return all;
  const set = new Set(enabled);
  return all.filter((t) => set.has(t.name));
}
```

- [ ] **Step 5: Build and run tests**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local build && pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-tools-paperclip.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/openai-compat-local/src/tools server/src/__tests__/openai-compat-tools-paperclip.test.ts
git commit -m "feat(adapters): add paperclip_request tool with env-based auth"
```

---

## Milestone 4 — Agent Loop (TDD)

### Task 8: Write failing AgentLoop test

**Files:**
- Create: `server/src/__tests__/openai-compat-loop.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/src/__tests__/openai-compat-loop.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runAgentLoop } from "@paperclipai/adapter-openai-compat-local/loop";
import type { ToolExecutor, ChatMessage } from "@paperclipai/adapter-openai-compat-local/types";

function makeMockTool(name: string, output: string): ToolExecutor {
  return {
    name,
    definition: {
      type: "function",
      function: {
        name,
        description: `mock ${name}`,
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    execute: vi.fn(async () => output),
  };
}

describe("runAgentLoop", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 'done' when model replies without tool calls", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { index: 0, message: { role: "assistant", content: "ok, I'm done" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "say hi" }],
      tools: [],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("done");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.messages.at(-1)?.content).toBe("ok, I'm done");
  });

  it("executes tool calls and feeds results back to the model", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "mock_tool", arguments: "{}" },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "all done" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const tool = makeMockTool("mock_tool", "mock output");

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "use the tool" }],
      tools: [tool],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(result.finishReason).toBe("done");
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1", content: "mock output" }),
      ]),
    );
    expect(result.usage.inputTokens).toBe(30);  // accumulated across both calls
    expect(result.usage.outputTokens).toBe(8);
  });

  it("returns 'error' finishReason when HTTP call fails", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("server exploded", { status: 500 }));

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "x" }],
      tools: [],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("error");
    expect(result.errorMessage).toMatch(/500/);
  });

  it("captures tool execution errors and feeds them back to model as tool result", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    { id: "c1", type: "function", function: { name: "broken", arguments: "{}" } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const broken: ToolExecutor = {
      name: "broken",
      definition: {
        type: "function",
        function: {
          name: "broken",
          description: "always throws",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: vi.fn(async () => {
        throw new Error("kaboom");
      }),
    };

    const result = await runAgentLoop({
      baseUrl: "http://x",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      tools: [broken],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("done");
    const toolMsg = result.messages.find((m) => m.role === "tool") as ChatMessage | undefined;
    expect(toolMsg?.content).toMatch(/kaboom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-loop.test.ts`
Expected: FAIL — `runAgentLoop` not exported.

---

### Task 9: Implement AgentLoop

**Files:**
- Create: `packages/adapters/openai-compat-local/src/loop.ts`

- [ ] **Step 1: Write loop.ts**

```ts
// src/loop.ts
import type {
  AgentLoopOptions,
  AgentLoopResult,
  ChatMessage,
  ToolCall,
  ToolExecutor,
} from "./types.js";
import { chatCompletion } from "./client.js";

function findTool(tools: ToolExecutor[], name: string): ToolExecutor | undefined {
  return tools.find((t) => t.name === name);
}

function parseToolArgs(raw: string): unknown {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function executeToolCall(
  call: ToolCall,
  tools: ToolExecutor[],
  ctx: { cwd: string; env: Record<string, string>; onLog: AgentLoopOptions["onLog"] },
): Promise<ChatMessage> {
  const tool = findTool(tools, call.function.name);
  if (!tool) {
    return {
      role: "tool",
      tool_call_id: call.id,
      name: call.function.name,
      content: `error: tool '${call.function.name}' is not available`,
    };
  }
  try {
    await ctx.onLog("stdout", `[tool] ${tool.name}(${call.function.arguments})\n`);
    const args = parseToolArgs(call.function.arguments);
    const output = await tool.execute(args, ctx);
    return {
      role: "tool",
      tool_call_id: call.id,
      name: tool.name,
      content: output,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[tool error] ${tool.name}: ${message}\n`);
    return {
      role: "tool",
      tool_call_id: call.id,
      name: tool.name,
      content: `error: ${message}`,
    };
  }
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { baseUrl, model, tools, enabledToolNames, timeoutMs, env, cwd, onLog } = opts;
  const activeTools =
    enabledToolNames && enabledToolNames.length > 0
      ? tools.filter((t) => enabledToolNames.includes(t.name))
      : tools;
  const toolDefs = activeTools.map((t) => t.definition);

  const messages: ChatMessage[] = [...opts.messages];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const deadline = Date.now() + timeoutMs;
  const toolCtx = { cwd, env, onLog };

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return {
        messages,
        finishReason: "timeout",
        errorMessage: `AgentLoop timed out after ${timeoutMs}ms`,
        usage,
      };
    }

    let response;
    try {
      response = await chatCompletion({
        baseUrl,
        request: {
          model,
          messages,
          ...(toolDefs.length > 0 ? { tools: toolDefs, tool_choice: "auto" as const } : {}),
        },
        timeoutMs: remaining,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        messages,
        finishReason: "error",
        errorMessage: message,
        usage,
      };
    }

    if (response.usage) {
      usage.inputTokens += response.usage.prompt_tokens ?? 0;
      usage.outputTokens += response.usage.completion_tokens ?? 0;
    }

    const choice = response.choices[0];
    if (!choice) {
      return {
        messages,
        finishReason: "error",
        errorMessage: "chat completion response had no choices",
        usage,
      };
    }

    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { messages, finishReason: "done", errorMessage: null, usage };
    }

    for (const call of toolCalls) {
      const toolResult = await executeToolCall(call, activeTools, toolCtx);
      messages.push(toolResult);
    }
  }
}
```

- [ ] **Step 2: Build and run tests**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local build && pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-loop.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/openai-compat-local/src/loop.ts server/src/__tests__/openai-compat-loop.test.ts
git commit -m "feat(adapters): implement agent tool-use loop with timeout + error capture"
```

---

## Milestone 5 — Session Summarization (TDD)

### Task 10: Write and implement `summarize.ts`

**Files:**
- Create: `packages/adapters/openai-compat-local/src/summarize.ts`
- Create: `server/src/__tests__/openai-compat-summarize.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/src/__tests__/openai-compat-summarize.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { summarizeSession } from "@paperclipai/adapter-openai-compat-local/summarize";

describe("summarizeSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns model summary text", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "- checked out task X\n- posted comment" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [
        { role: "user", content: "do stuff" },
        { role: "assistant", content: "did stuff" },
      ],
      timeoutMs: 5000,
    });

    expect(summary).toMatch(/checked out task X/);
  });

  it("returns null when request fails", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("boom", { status: 500 }));

    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [],
      timeoutMs: 5000,
    });

    expect(summary).toBeNull();
  });

  it("returns null on empty messages", async () => {
    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [],
      timeoutMs: 5000,
    });
    expect(summary).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-summarize.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Write summarize.ts**

```ts
// src/summarize.ts
import type { ChatMessage } from "./types.js";
import { chatCompletion } from "./client.js";

export interface SummarizeArgs {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}

const SUMMARY_INSTRUCTION =
  "Summarize what you accomplished in this session in 3-5 bullet points. Be concise. This will be your context note for the next session. Focus on: tasks touched, decisions made, open questions.";

export async function summarizeSession(args: SummarizeArgs): Promise<string | null> {
  const { baseUrl, model, messages, timeoutMs } = args;
  if (messages.length === 0) return null;

  try {
    const response = await chatCompletion({
      baseUrl,
      request: {
        model,
        messages: [...messages, { role: "user", content: SUMMARY_INSTRUCTION }],
      },
      timeoutMs,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) return null;
    return content.trim();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Build and run tests**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local build && pnpm --filter @paperclipai/paperclip-server test:run -- openai-compat-summarize.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/openai-compat-local/src/summarize.ts server/src/__tests__/openai-compat-summarize.test.ts
git commit -m "feat(adapters): add fail-safe session summarization"
```

---

### Task 11: Finalize core package barrel export

**Files:**
- Modify: `packages/adapters/openai-compat-local/src/index.ts`

- [ ] **Step 1: Write full barrel export**

```ts
// src/index.ts
export * from "./types.js";
export { chatCompletion, listRemoteModels } from "./client.js";
export { runAgentLoop } from "./loop.js";
export { summarizeSession } from "./summarize.js";
export { DEFAULT_TOOLS, selectTools } from "./tools/index.js";
export { bashTool, readFileTool, writeFileTool, listDirTool, paperclipRequestTool } from "./tools/index.js";
```

- [ ] **Step 2: Typecheck and build**

Run: `pnpm --filter @paperclipai/adapter-openai-compat-local typecheck && pnpm --filter @paperclipai/adapter-openai-compat-local build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/openai-compat-local/src/index.ts
git commit -m "feat(adapters): finalize openai-compat-local barrel exports"
```

---

## Milestone 6 — Ollama Wrapper Package

### Task 12: Scaffold `ollama-local` package with metadata

**Files:**
- Create: `packages/adapters/ollama-local/package.json`
- Create: `packages/adapters/ollama-local/tsconfig.json`
- Create: `packages/adapters/ollama-local/src/index.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@paperclipai/adapter-ollama-local",
  "version": "0.0.1",
  "license": "MIT",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./ui": "./dist/ui/index.js",
    "./cli": "./dist/cli/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paperclipai/adapter-openai-compat-local": "workspace:*",
    "@paperclipai/adapter-utils": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.6.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write src/index.ts with adapter metadata**

```ts
// src/index.ts
export const type = "ollama_local";
export const label = "Ollama (local)";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.1";
export const PROVIDER_NAME = "ollama";

export const models: Array<{ id: string; label: string }> = [
  { id: "llama3.1", label: "Llama 3.1" },
  { id: "llama3.2", label: "Llama 3.2" },
  { id: "qwen2.5", label: "Qwen 2.5" },
  { id: "mistral", label: "Mistral" },
];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want Paperclip agents to run on a local Ollama server (zero API cost)
- You want a full agentic loop (Paperclip API + shell + file tools) driven by a local model
- Your model supports OpenAI-style tool/function calling (e.g. llama3.1+, qwen2.5, mistral)

Don't use when:
- You need a hosted / cloud model (use claude_local / gemini_local / codex_local)
- Your model does not support tool calls (the agent will not be able to act)
- You need CLI-level features like --resume or rich stdout streaming (use claude_local etc.)

Core fields:
- baseUrl (string, optional): Ollama server URL. Defaults to ${DEFAULT_OLLAMA_BASE_URL}
- model (string, optional): Ollama model id. Defaults to ${DEFAULT_OLLAMA_MODEL}
- cwd (string, optional): working directory for bash/file tools
- systemPrompt (string, optional): system message prepended to every run
- promptTemplate (string, optional): user prompt template (supports {{agent.*}} fields)
- enabledTools (string[], optional): subset of ["paperclip_request","bash","read_file","write_file","list_dir"]. Default: all
- env (object, optional): KEY=VALUE env vars passed to shell tools

Operational fields:
- timeoutSec (number, optional): run timeout (default 300)

Notes:
- The adapter implements its own tool-use loop (agent loop); the Ollama model must support tool calling.
- Costs are always reported as zero (local execution).
- Sessions are continued via a short auto-generated summary stored in sessionParams.summary.
`;
```

- [ ] **Step 4: Install and build**

Run: `pnpm install && pnpm --filter @paperclipai/adapter-ollama-local typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/ollama-local pnpm-lock.yaml
git commit -m "feat(adapters): scaffold ollama-local package with metadata"
```

---

### Task 13: Implement ollama-local server (execute + testEnvironment + listModels)

**Files:**
- Create: `packages/adapters/ollama-local/src/server/execute.ts`
- Create: `packages/adapters/ollama-local/src/server/index.ts`
- Create: `server/src/__tests__/ollama-local-adapter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/src/__tests__/ollama-local-adapter.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { testEnvironment, listModels, execute } from "@paperclipai/adapter-ollama-local/server";

describe("ollama_local testEnvironment", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 'pass' when ollama responds with model list", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ name: "llama3.1:latest" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await testEnvironment({
      adapterType: "ollama_local",
      runtimeConfig: {},
      agentConfig: { baseUrl: "http://localhost:11434" },
    });

    expect(result.status).toBe("pass");
  });

  it("returns 'fail' with descriptive message when server is not reachable", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await testEnvironment({
      adapterType: "ollama_local",
      runtimeConfig: {},
      agentConfig: { baseUrl: "http://localhost:11434" },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.message?.toLowerCase().includes("ollama"))).toBe(true);
  });
});

describe("ollama_local listModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns discovered models from /api/tags", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ name: "llama3.1:8b" }, { name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const models = await listModels();
    expect(models.map((m) => m.id)).toEqual(["llama3.1:8b", "qwen2.5:7b"]);
  });

  it("returns [] when server is down", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const models = await listModels();
    expect(models).toEqual([]);
  });
});

describe("ollama_local execute end-to-end (mocked HTTP)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs a single-turn conversation and returns summary in sessionParams", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    // First call: main loop — model responds with no tool calls
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { index: 0, message: { role: "assistant", content: "did nothing" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // Second call: summarizeSession
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "- did nothing" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const logs: string[] = [];
    const result = await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "co-1", name: "CEO" } as never,
      runtime: { sessionId: null, sessionParams: null } as never,
      config: { baseUrl: "http://localhost:11434", model: "llama3.1", cwd: "/tmp" },
      context: {} as never,
      onLog: async (_stream, chunk) => {
        logs.push(chunk);
      },
      onMeta: async () => {},
      onSpawn: () => {},
      authToken: null,
    });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.provider).toBe("ollama");
    expect(result.billingType).toBe("local");
    expect(result.sessionParams).toEqual(expect.objectContaining({ summary: expect.stringContaining("did nothing") }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- ollama-local-adapter.test.ts`
Expected: FAIL — server module not created yet.

- [ ] **Step 3: Write `src/server/execute.ts`**

```ts
// src/server/execute.ts
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
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

function buildInitialMessages(opts: {
  systemPrompt: string;
  promptTemplate: string;
  prevSummary: string;
  agent: AdapterExecutionContext["agent"];
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt.length > 0) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  if (opts.prevSummary.length > 0) {
    messages.push({
      role: "user",
      content: `Previous session summary:\n${opts.prevSummary}\n\nContinue from where you left off.`,
    });
  }
  const rendered = opts.promptTemplate
    .replace(/\{\{agent\.id\}\}/g, opts.agent.id)
    .replace(/\{\{agent\.name\}\}/g, opts.agent.name ?? opts.agent.id);
  messages.push({ role: "user", content: rendered });
  return messages;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, onLog, onMeta, authToken } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const cwd = asString(config.cwd, process.cwd());
  const systemPrompt = asString(config.systemPrompt, "");
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.name}}. Continue your Paperclip work.",
  );
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const enabledToolNames = asStringArray(config.enabledTools);

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }
  if (authToken && !env.PAPERCLIP_API_KEY) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const prevSummary = asString(parseObject(runtime.sessionParams).summary, "");
  const messages = buildInitialMessages({ systemPrompt, promptTemplate, prevSummary, agent });

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: "(http)",
      cwd,
      commandNotes: [`Calling ${baseUrl}/v1/chat/completions with model ${model}`],
      commandArgs: [],
      env: {},
      prompt: messages.at(-1)?.content ?? "",
      context: ctx.context,
    });
  }

  const selectedTools = selectTools(enabledToolNames.length > 0 ? enabledToolNames : undefined, DEFAULT_TOOLS);

  const loopResult = await runAgentLoop({
    baseUrl,
    model,
    messages,
    tools: selectedTools,
    timeoutMs: timeoutSec * 1000,
    env,
    cwd,
    onLog,
  });

  const summary = await summarizeSession({
    baseUrl,
    model,
    messages: loopResult.messages,
    timeoutMs: 60_000,
  });

  const timedOut = loopResult.finishReason === "timeout";
  const errored = loopResult.finishReason === "error";

  return {
    exitCode: errored ? 1 : 0,
    signal: null,
    timedOut,
    errorMessage: loopResult.errorMessage,
    usage: {
      inputTokens: loopResult.usage.inputTokens,
      outputTokens: loopResult.usage.outputTokens,
    },
    provider: PROVIDER_NAME,
    biller: PROVIDER_NAME,
    model,
    billingType: "local",
    costUsd: 0,
    sessionParams: summary ? { summary } : null,
    sessionDisplayId: summary ? `summary@${Date.now()}` : null,
    resultJson: {
      finishReason: loopResult.finishReason,
      messageCount: loopResult.messages.length,
    },
  };
}
```

- [ ] **Step 4: Write `src/server/index.ts`**

```ts
// src/server/index.ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterModel,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { listRemoteModels } from "@paperclipai/adapter-openai-compat-local";
import { DEFAULT_OLLAMA_BASE_URL } from "../index.js";

export { execute } from "./execute.js";

export async function listModels(): Promise<AdapterModel[]> {
  const names = await listRemoteModels({
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    timeoutMs: 3000,
    style: "ollama",
  });
  return names.map((name) => ({ id: name, label: name }));
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const agentConfig = parseObject((ctx as unknown as { agentConfig?: unknown }).agentConfig);
  const baseUrl = asString(agentConfig.baseUrl, DEFAULT_OLLAMA_BASE_URL);

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "ollama",
    });
    if (names.length > 0) {
      return {
        status: "pass",
        checks: [
          {
            code: "ollama_reachable",
            level: "info",
            message: `Ollama reachable at ${baseUrl}; ${names.length} model(s) installed.`,
          },
        ],
      };
    }
    return {
      status: "warn",
      checks: [
        {
          code: "ollama_no_models",
          level: "warn",
          message: `Ollama reachable at ${baseUrl} but no models are installed. Run: ollama pull llama3.1`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "fail",
      checks: [
        {
          code: "ollama_unreachable",
          level: "error",
          message: `Ollama server not running at ${baseUrl}: ${message}`,
        },
      ],
    };
  }
}
```

- [ ] **Step 5: Add dev dependency on ollama-local to server**

Edit `server/package.json` to add in `devDependencies`:
```json
    "@paperclipai/adapter-ollama-local": "workspace:*",
```

- [ ] **Step 6: Install, build and run tests**

Run: `pnpm install && pnpm --filter @paperclipai/adapter-ollama-local build && pnpm --filter @paperclipai/paperclip-server test:run -- ollama-local-adapter.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/ollama-local/src/server server/package.json server/src/__tests__/ollama-local-adapter.test.ts pnpm-lock.yaml
git commit -m "feat(adapters): implement ollama-local server (execute/listModels/testEnvironment)"
```

---

### Task 14: Add ollama-local UI build-config and stdout parser

**Files:**
- Create: `packages/adapters/ollama-local/src/ui/build-config.ts`
- Create: `packages/adapters/ollama-local/src/ui/index.ts`
- Create: `packages/adapters/ollama-local/src/cli/index.ts`

- [ ] **Step 1: Write `src/ui/build-config.ts`**

```ts
// src/ui/build-config.ts
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = trimmed.slice(eq + 1);
  }
  return env;
}

export function buildOllamaLocalConfig(values: CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    baseUrl: asString(values.baseUrl, DEFAULT_OLLAMA_BASE_URL),
    model: asString(values.model, DEFAULT_OLLAMA_MODEL),
  };

  const cwd = typeof values.cwd === "string" ? values.cwd.trim() : "";
  if (cwd.length > 0) config.cwd = cwd;

  const systemPrompt = typeof values.systemPrompt === "string" ? values.systemPrompt : "";
  if (systemPrompt.length > 0) config.systemPrompt = systemPrompt;

  const promptTemplate = typeof values.promptTemplate === "string" ? values.promptTemplate : "";
  if (promptTemplate.length > 0) config.promptTemplate = promptTemplate;

  const enabledTools = Array.isArray(values.enabledTools)
    ? values.enabledTools.filter((x): x is string => typeof x === "string")
    : [];
  if (enabledTools.length > 0) config.enabledTools = enabledTools;

  const timeoutSec = typeof values.timeoutSec === "number" ? values.timeoutSec : Number(values.timeoutSec);
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) config.timeoutSec = timeoutSec;

  const envText = typeof values.envText === "string" ? values.envText : "";
  const env = parseEnvLines(envText);
  if (Object.keys(env).length > 0) config.env = env;

  return config;
}

export function parseOllamaStdoutLine(line: string): { text?: string; kind?: string } | null {
  // Ollama adapter uses simple onLog calls for tool traces;
  // the UI just displays them as-is.
  if (!line || line.length === 0) return null;
  return { text: line, kind: "log" };
}
```

- [ ] **Step 2: Write `src/ui/index.ts`**

```ts
// src/ui/index.ts
export { buildOllamaLocalConfig, parseOllamaStdoutLine } from "./build-config.js";
```

- [ ] **Step 3: Write `src/cli/index.ts`**

```ts
// src/cli/index.ts
export function printOllamaStreamEvent(line: string): string {
  return line;
}
```

- [ ] **Step 4: Build and typecheck**

Run: `pnpm --filter @paperclipai/adapter-ollama-local build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/ollama-local/src/ui packages/adapters/ollama-local/src/cli
git commit -m "feat(adapters): add ollama-local UI config builder and CLI shim"
```

---

## Milestone 7 — LM Studio Wrapper Package

### Task 15: Scaffold and implement `lm-studio-local` (mirror of ollama-local)

**Files:**
- Create: `packages/adapters/lm-studio-local/package.json`
- Create: `packages/adapters/lm-studio-local/tsconfig.json`
- Create: `packages/adapters/lm-studio-local/src/index.ts`
- Create: `packages/adapters/lm-studio-local/src/server/execute.ts`
- Create: `packages/adapters/lm-studio-local/src/server/index.ts`
- Create: `packages/adapters/lm-studio-local/src/ui/build-config.ts`
- Create: `packages/adapters/lm-studio-local/src/ui/index.ts`
- Create: `packages/adapters/lm-studio-local/src/cli/index.ts`
- Create: `server/src/__tests__/lm-studio-local-adapter.test.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@paperclipai/adapter-lm-studio-local",
  "version": "0.0.1",
  "license": "MIT",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./ui": "./dist/ui/index.js",
    "./cli": "./dist/cli/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@paperclipai/adapter-openai-compat-local": "workspace:*",
    "@paperclipai/adapter-utils": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.6.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `src/index.ts`**

```ts
// src/index.ts
export const type = "lm_studio_local";
export const label = "LM Studio (local)";
export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234";
export const DEFAULT_LM_STUDIO_MODEL = "local-model";
export const PROVIDER_NAME = "lm_studio";

export const models: Array<{ id: string; label: string }> = [
  { id: "local-model", label: "Default local model" },
];

export const agentConfigurationDoc = `# lm_studio_local agent configuration

Adapter: lm_studio_local

Use when:
- You want Paperclip agents to run on a local LM Studio server (zero API cost)
- You want a full agentic loop (Paperclip API + shell + file tools) driven by a local model
- Your LM Studio model supports OpenAI-style tool/function calling

Don't use when:
- You need a hosted / cloud model (use claude_local / gemini_local / codex_local)
- Your model does not support tool calls

Core fields:
- baseUrl (string, optional): LM Studio server URL. Defaults to ${DEFAULT_LM_STUDIO_BASE_URL}
- model (string, optional): Model id. Defaults to ${DEFAULT_LM_STUDIO_MODEL}
- cwd (string, optional): working directory for bash/file tools
- systemPrompt (string, optional): system message
- promptTemplate (string, optional): user prompt template
- enabledTools (string[], optional): tool subset
- env (object, optional): KEY=VALUE env vars
- timeoutSec (number, optional): run timeout (default 300)

Notes:
- LM Studio must have "Start Server" enabled with an OpenAI-compatible endpoint.
- Costs are always reported as zero.
- Sessions are continued via short summaries.
`;
```

- [ ] **Step 4: Write `src/server/execute.ts`**

```ts
// src/server/execute.ts
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
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

function buildInitialMessages(opts: {
  systemPrompt: string;
  promptTemplate: string;
  prevSummary: string;
  agent: AdapterExecutionContext["agent"];
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt.length > 0) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  if (opts.prevSummary.length > 0) {
    messages.push({
      role: "user",
      content: `Previous session summary:\n${opts.prevSummary}\n\nContinue from where you left off.`,
    });
  }
  const rendered = opts.promptTemplate
    .replace(/\{\{agent\.id\}\}/g, opts.agent.id)
    .replace(/\{\{agent\.name\}\}/g, opts.agent.name ?? opts.agent.id);
  messages.push({ role: "user", content: rendered });
  return messages;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, onLog, onMeta, authToken } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);
  const model = asString(config.model, DEFAULT_LM_STUDIO_MODEL);
  const cwd = asString(config.cwd, process.cwd());
  const systemPrompt = asString(config.systemPrompt, "");
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.name}}. Continue your Paperclip work.",
  );
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const enabledToolNames = asStringArray(config.enabledTools);

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }
  if (authToken && !env.PAPERCLIP_API_KEY) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const prevSummary = asString(parseObject(runtime.sessionParams).summary, "");
  const messages = buildInitialMessages({ systemPrompt, promptTemplate, prevSummary, agent });

  if (onMeta) {
    await onMeta({
      adapterType: "lm_studio_local",
      command: "(http)",
      cwd,
      commandNotes: [`Calling ${baseUrl}/v1/chat/completions with model ${model}`],
      commandArgs: [],
      env: {},
      prompt: messages.at(-1)?.content ?? "",
      context: ctx.context,
    });
  }

  const selectedTools = selectTools(enabledToolNames.length > 0 ? enabledToolNames : undefined, DEFAULT_TOOLS);

  const loopResult = await runAgentLoop({
    baseUrl,
    model,
    messages,
    tools: selectedTools,
    timeoutMs: timeoutSec * 1000,
    env,
    cwd,
    onLog,
  });

  const summary = await summarizeSession({
    baseUrl,
    model,
    messages: loopResult.messages,
    timeoutMs: 60_000,
  });

  const timedOut = loopResult.finishReason === "timeout";
  const errored = loopResult.finishReason === "error";

  return {
    exitCode: errored ? 1 : 0,
    signal: null,
    timedOut,
    errorMessage: loopResult.errorMessage,
    usage: {
      inputTokens: loopResult.usage.inputTokens,
      outputTokens: loopResult.usage.outputTokens,
    },
    provider: PROVIDER_NAME,
    biller: PROVIDER_NAME,
    model,
    billingType: "local",
    costUsd: 0,
    sessionParams: summary ? { summary } : null,
    sessionDisplayId: summary ? `summary@${Date.now()}` : null,
    resultJson: {
      finishReason: loopResult.finishReason,
      messageCount: loopResult.messages.length,
    },
  };
}
```

- [ ] **Step 5: Write `src/server/index.ts`**

```ts
// src/server/index.ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterModel,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { listRemoteModels } from "@paperclipai/adapter-openai-compat-local";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../index.js";

export { execute } from "./execute.js";

export async function listModels(): Promise<AdapterModel[]> {
  const names = await listRemoteModels({
    baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
    timeoutMs: 3000,
    style: "openai",
  });
  return names.map((name) => ({ id: name, label: name }));
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const agentConfig = parseObject((ctx as unknown as { agentConfig?: unknown }).agentConfig);
  const baseUrl = asString(agentConfig.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "openai",
    });
    if (names.length > 0) {
      return {
        status: "pass",
        checks: [
          {
            code: "lm_studio_reachable",
            level: "info",
            message: `LM Studio reachable at ${baseUrl}; ${names.length} model(s) loaded.`,
          },
        ],
      };
    }
    return {
      status: "warn",
      checks: [
        {
          code: "lm_studio_no_models",
          level: "warn",
          message: `LM Studio reachable at ${baseUrl} but no models are loaded. Load a model in LM Studio first.`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "fail",
      checks: [
        {
          code: "lm_studio_unreachable",
          level: "error",
          message: `LM Studio server not running at ${baseUrl}: ${message}. Enable "Start Server" in LM Studio.`,
        },
      ],
    };
  }
}
```

- [ ] **Step 6: Write `src/ui/build-config.ts`**

```ts
// src/ui/build-config.ts
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_LM_STUDIO_BASE_URL, DEFAULT_LM_STUDIO_MODEL } from "../index.js";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = trimmed.slice(eq + 1);
  }
  return env;
}

export function buildLmStudioLocalConfig(values: CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    baseUrl: asString(values.baseUrl, DEFAULT_LM_STUDIO_BASE_URL),
    model: asString(values.model, DEFAULT_LM_STUDIO_MODEL),
  };

  const cwd = typeof values.cwd === "string" ? values.cwd.trim() : "";
  if (cwd.length > 0) config.cwd = cwd;

  const systemPrompt = typeof values.systemPrompt === "string" ? values.systemPrompt : "";
  if (systemPrompt.length > 0) config.systemPrompt = systemPrompt;

  const promptTemplate = typeof values.promptTemplate === "string" ? values.promptTemplate : "";
  if (promptTemplate.length > 0) config.promptTemplate = promptTemplate;

  const enabledTools = Array.isArray(values.enabledTools)
    ? values.enabledTools.filter((x): x is string => typeof x === "string")
    : [];
  if (enabledTools.length > 0) config.enabledTools = enabledTools;

  const timeoutSec = typeof values.timeoutSec === "number" ? values.timeoutSec : Number(values.timeoutSec);
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) config.timeoutSec = timeoutSec;

  const envText = typeof values.envText === "string" ? values.envText : "";
  const env = parseEnvLines(envText);
  if (Object.keys(env).length > 0) config.env = env;

  return config;
}

export function parseLmStudioStdoutLine(line: string): { text?: string; kind?: string } | null {
  if (!line || line.length === 0) return null;
  return { text: line, kind: "log" };
}
```

- [ ] **Step 7: Write `src/ui/index.ts` and `src/cli/index.ts`**

```ts
// src/ui/index.ts
export { buildLmStudioLocalConfig, parseLmStudioStdoutLine } from "./build-config.js";
```

```ts
// src/cli/index.ts
export function printLmStudioStreamEvent(line: string): string {
  return line;
}
```

- [ ] **Step 8: Write the LM Studio adapter test**

```ts
// server/src/__tests__/lm-studio-local-adapter.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { testEnvironment, listModels, execute } from "@paperclipai/adapter-lm-studio-local/server";

describe("lm_studio_local testEnvironment", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 'pass' when LM Studio responds with a model", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "mistral-7b-instruct" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await testEnvironment({
      adapterType: "lm_studio_local",
      runtimeConfig: {},
      agentConfig: { baseUrl: "http://localhost:1234" },
    });
    expect(result.status).toBe("pass");
  });

  it("returns 'fail' when LM Studio is unreachable", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await testEnvironment({
      adapterType: "lm_studio_local",
      runtimeConfig: {},
      agentConfig: { baseUrl: "http://localhost:1234" },
    });
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.message?.toLowerCase().includes("lm studio"))).toBe(true);
  });
});

describe("lm_studio_local listModels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns discovered models from /v1/models", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const models = await listModels();
    expect(models.map((m) => m.id)).toEqual(["model-a", "model-b"]);
  });
});

describe("lm_studio_local execute (mocked)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("completes a single turn and returns summary", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "- ok" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await execute({
      runId: "run-2",
      agent: { id: "a", companyId: "c", name: "CEO" } as never,
      runtime: { sessionId: null, sessionParams: null } as never,
      config: { baseUrl: "http://localhost:1234", model: "any" },
      context: {} as never,
      onLog: async () => {},
      onMeta: async () => {},
      onSpawn: () => {},
      authToken: null,
    });

    expect(result.provider).toBe("lm_studio");
    expect(result.costUsd).toBe(0);
    expect(result.sessionParams).toEqual(expect.objectContaining({ summary: "- ok" }));
  });
});
```

- [ ] **Step 9: Add dev dep and install**

Edit `server/package.json` devDependencies:
```json
    "@paperclipai/adapter-lm-studio-local": "workspace:*",
```

Run: `pnpm install && pnpm --filter @paperclipai/adapter-lm-studio-local build && pnpm --filter @paperclipai/paperclip-server test:run -- lm-studio-local-adapter.test.ts`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/adapters/lm-studio-local server/package.json server/src/__tests__/lm-studio-local-adapter.test.ts pnpm-lock.yaml
git commit -m "feat(adapters): add lm-studio-local full agentic adapter"
```

---

## Milestone 8 — Server Registry Integration

### Task 16: Register ollama-local and lm-studio-local in server adapter registry

**Files:**
- Modify: `server/src/adapters/registry.ts`
- Modify: `server/package.json` (already done in prior tasks)

- [x] **Step 1: Add imports to registry.ts**

At the top of `server/src/adapters/registry.ts`, after the existing adapter imports, add:

```ts
import {
  execute as ollamaExecute,
  testEnvironment as ollamaTestEnvironment,
  listModels as listOllamaModels,
} from "@paperclipai/adapter-ollama-local/server";
import {
  agentConfigurationDoc as ollamaAgentConfigurationDoc,
  models as ollamaModels,
} from "@paperclipai/adapter-ollama-local";
import {
  execute as lmStudioExecute,
  testEnvironment as lmStudioTestEnvironment,
  listModels as listLmStudioModels,
} from "@paperclipai/adapter-lm-studio-local/server";
import {
  agentConfigurationDoc as lmStudioAgentConfigurationDoc,
  models as lmStudioModels,
} from "@paperclipai/adapter-lm-studio-local";
```

- [x] **Step 2: Add adapter module definitions**

Before the `adaptersByType` Map (around line 190), add:

```ts
const ollamaLocalAdapter: ServerAdapterModule = {
  type: "ollama_local",
  execute: ollamaExecute,
  testEnvironment: ollamaTestEnvironment,
  models: ollamaModels,
  listModels: listOllamaModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: ollamaAgentConfigurationDoc,
};

const lmStudioLocalAdapter: ServerAdapterModule = {
  type: "lm_studio_local",
  execute: lmStudioExecute,
  testEnvironment: lmStudioTestEnvironment,
  models: lmStudioModels,
  listModels: listLmStudioModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: lmStudioAgentConfigurationDoc,
};
```

- [x] **Step 3: Add to the `adaptersByType` Map array**

Find the array inside `new Map<string, ServerAdapterModule>([...])` and add the two new adapters before `processAdapter`:

```ts
    openclawGatewayAdapter,
    hermesLocalAdapter,
    ollamaLocalAdapter,
    lmStudioLocalAdapter,
    processAdapter,
```

- [x] **Step 4: Typecheck**

Run: `pnpm --filter @paperclipai/paperclip-server typecheck`
Expected: No errors. **Note:** real filter name is `@paperclipai/server`, not `@paperclipai/paperclip-server`.

- [x] **Step 5: Run all adapter tests**

Run: `pnpm --filter @paperclipai/paperclip-server test:run -- adapter`
Expected: All existing tests still pass, new ollama/lm-studio tests pass. **Note:** server has no `test:run` script; use `pnpm exec vitest run --reporter=basic src/__tests__/ollama-local-adapter.test.ts src/__tests__/lm-studio-local-adapter.test.ts` from `server/`.

- [x] **Step 6: Commit**

Bundled into the combined `feat(server): register ollama-local and lm-studio-local adapters` commit that also extends `AGENT_ADAPTER_TYPES` in `packages/shared/src/constants.ts` (see Corrections Applied below).

---

## Milestone 9 — UI Integration

### Task 17: Create UI adapter modules

**Files:**
- Create: `ui/src/adapters/ollama-local/index.ts`
- Create: `ui/src/adapters/ollama-local/config-fields.tsx`
- Create: `ui/src/adapters/lm-studio-local/index.ts`
- Create: `ui/src/adapters/lm-studio-local/config-fields.tsx`

- [x] **Step 1: Add ollama-local and lm-studio-local as UI deps**

Edit `ui/package.json` devDependencies:
```json
    "@paperclipai/adapter-ollama-local": "workspace:*",
    "@paperclipai/adapter-lm-studio-local": "workspace:*",
```

- [x] **Step 2: Write `ui/src/adapters/ollama-local/index.ts`**

Read the existing gemini-local UI adapter for the shape (it uses the `UIAdapterModule` type). Then write:

```ts
// ui/src/adapters/ollama-local/index.ts
import type { UIAdapterModule } from "../types";
import { parseOllamaStdoutLine, buildOllamaLocalConfig } from "@paperclipai/adapter-ollama-local/ui";
import { OllamaLocalConfigFields } from "./config-fields";

export const ollamaLocalUIAdapter: UIAdapterModule = {
  type: "ollama_local",
  label: "Ollama (local)",
  parseStdoutLine: parseOllamaStdoutLine,
  ConfigFields: OllamaLocalConfigFields,
  buildAdapterConfig: buildOllamaLocalConfig,
};
```

- [x] **Step 3: Write `ui/src/adapters/ollama-local/config-fields.tsx`** — **Implementation deviation:** the sample code in this step is wrong. `ConfigFieldsProps` does not exist; the real type is `AdapterConfigFieldsProps` with `{ isCreate, values, set, config, eff, mark, models, hideInstructionsFile }`. Actual implementation mirrors `ui/src/adapters/gemini-local/config-fields.tsx` using `Field` + `DraftInput` primitives and binds to `values.url` / `values.model` (what `buildOllamaLocalConfig` reads).

First read `ui/src/adapters/gemini-local/config-fields.tsx` to match the existing field component patterns, then write a minimal equivalent:

```tsx
// ui/src/adapters/ollama-local/config-fields.tsx
import type { ConfigFieldsProps } from "../types";

export function OllamaLocalConfigFields(props: ConfigFieldsProps) {
  const { values, onChange } = props;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Base URL</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="http://localhost:11434"
          value={typeof values.baseUrl === "string" ? values.baseUrl : ""}
          onChange={(e) => onChange("baseUrl", e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Model</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="llama3.1"
          value={typeof values.model === "string" ? values.model : ""}
          onChange={(e) => onChange("model", e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Working directory (cwd)</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="/path/to/workspace"
          value={typeof values.cwd === "string" ? values.cwd : ""}
          onChange={(e) => onChange("cwd", e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">System prompt (optional)</label>
        <textarea
          rows={3}
          className="w-full rounded border px-2 py-1 text-sm"
          value={typeof values.systemPrompt === "string" ? values.systemPrompt : ""}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
        />
      </div>
    </div>
  );
}
```

**Note:** If `ConfigFieldsProps` has a different signature than `{ values, onChange }`, look at `gemini-local/config-fields.tsx` and match its exact props shape. Adjust accordingly before building.

- [x] **Step 4: Write `ui/src/adapters/lm-studio-local/index.ts`**

```ts
// ui/src/adapters/lm-studio-local/index.ts
import type { UIAdapterModule } from "../types";
import { parseLmStudioStdoutLine, buildLmStudioLocalConfig } from "@paperclipai/adapter-lm-studio-local/ui";
import { LmStudioLocalConfigFields } from "./config-fields";

export const lmStudioLocalUIAdapter: UIAdapterModule = {
  type: "lm_studio_local",
  label: "LM Studio (local)",
  parseStdoutLine: parseLmStudioStdoutLine,
  ConfigFields: LmStudioLocalConfigFields,
  buildAdapterConfig: buildLmStudioLocalConfig,
};
```

- [x] **Step 5: Write `ui/src/adapters/lm-studio-local/config-fields.tsx`**

Same structure as the ollama one but with `http://localhost:1234` as the placeholder and `local-model` as the model placeholder. Copy the ollama-local file and change those two strings.

- [x] **Step 6: Install and typecheck UI**

Run: `pnpm install && pnpm --filter @paperclipai/ui typecheck`
Expected: No errors. **Note:** filter name is `@paperclipai/ui`, not `@paperclipai/paperclip-ui`.

- [x] **Step 7: Commit** — Bundled into the single `feat(ui): wire up ollama-local and lm-studio-local adapter UI` commit together with Tasks 18 and 19 (see Corrections Applied below).

---

### Task 18: Register UI adapters

**Files:**
- Modify: `ui/src/adapters/registry.ts`

- [x] **Step 1: Add imports and register**

First read the existing registry file to see its pattern, then add the new imports at the top and the new adapters to the export array.

```ts
// near the other adapter imports
import { ollamaLocalUIAdapter } from "./ollama-local";
import { lmStudioLocalUIAdapter } from "./lm-studio-local";
```

Then add `ollamaLocalUIAdapter` and `lmStudioLocalUIAdapter` to whichever array is exported (likely `uiAdapters` or similar — check the existing file for the exact variable name).

- [x] **Step 2: Typecheck**

Run: `pnpm --filter @paperclipai/ui typecheck`
Expected: No errors.

- [x] **Step 3: Commit** — Bundled into single UI commit (see Corrections Applied).

---

### Task 19: Add entries to `NewAgentDialog.tsx`

**Files:**
- Modify: `ui/src/components/NewAgentDialog.tsx`

- [x] **Step 1: Extend `AdvancedAdapterType` union**

Find the type union starting around line 27-35 and add the two new types:

```ts
type AdvancedAdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "openclaw_gateway"
  | "hermes_local"
  | "ollama_local"
  | "lm_studio_local";
```

- [x] **Step 2: Add options to `ADVANCED_ADAPTER_OPTIONS`** — Used `Cpu` for Ollama and `Server` for LM Studio from `lucide-react`.

After the existing options array entries, before `openclaw_gateway` or wherever appropriate, add:

```ts
  {
    value: "ollama_local",
    label: "Ollama",
    icon: Terminal,  // or import a more suitable lucide icon like `Cpu`
    desc: "Local Ollama model (zero cost, requires tool-call-capable model)",
  },
  {
    value: "lm_studio_local",
    label: "LM Studio",
    icon: Terminal,  // or `Cpu`
    desc: "Local LM Studio model (zero cost, requires tool-call-capable model)",
  },
```

If there's no suitable icon already imported in the file, import `Cpu` from `lucide-react` at the top of the file and use that.

- [x] **Step 3: Update `AgentProperties.tsx` label mapping** — **Scope expanded:** the codebase actually has **5 separate `adapterLabels` maps** (not 1). All were updated: `AgentProperties.tsx`, `agent-config-primitives.tsx` (i18n-backed), `InviteLanding.tsx`, `OrgChart.tsx`, `Agents.tsx`. Also extended 2 allowlists (`ENABLED_ADAPTER_TYPES` in `AgentConfigForm.tsx:1025`, `ENABLED_INVITE_ADAPTERS` in `InviteLanding.tsx:28`) without which the dropdown would mark both adapters as "coming soon". Also added `adapter.ollama_local` / `adapter.lm_studio_local` + `adapter.desc.*` entries to `ui/src/i18n/ko.json`.

```ts
  gemini_local: "Gemini CLI (local)",
  ollama_local: "Ollama (local)",
  lm_studio_local: "LM Studio (local)",
```

- [x] **Step 4: Typecheck UI**

Run: `pnpm --filter @paperclipai/ui typecheck`
Expected: No errors.

- [x] **Step 5: Commit** — Bundled into single UI commit (see Corrections Applied).

---

## Milestone 10 — Final Verification

### Task 20: Run full monorepo verification gate

**Files:** (none modified)

- [x] **Step 1: Clean and reinstall** — `pnpm install` clean.

- [x] **Step 2: Typecheck entire monorepo** — `pnpm -r typecheck` clean across all 24 workspace projects.

- [x] **Step 3: Run full test suite** — `pnpm test:run` passes 720/730. 10 pre-existing failures (confirmed via `git stash` + rerun) are all Korean i18n mismatches in `costs-service`, `openclaw-invite-prompt-route`, `company-branding-route`, `company-portability-routes`, `companies-route-path-guard`, `agent-skills-routes` — completely unrelated to adapters. Zero regressions from this change. All 16 new adapter tests (`ollama-local-adapter.test.ts`: 5, `lm-studio-local-adapter.test.ts`: 4, `openai-compat-*.test.ts`: 7) pass.

- [x] **Step 4: Build entire monorepo** — `pnpm build` clean.

- [x] **Step 5: Verify adapter is reachable via API** — Actual endpoints used (the sample `/api/adapter-types` does not exist):
```bash
curl "http://localhost:3100/api/companies/$CID/adapters/ollama_local/models"
# → [{"id":"qwen3.5:4b",...},{"id":"gemma3:4b",...},{"id":"qwen3:4b",...},{"id":"qwen3-vl:2b",...}]
# (dynamic listModels() discovered 4 models from the local Ollama server)

curl -X POST "http://localhost:3100/api/companies/$CID/adapters/ollama_local/test-environment" -d '{"config":{}}'
# → {"status":"pass","checks":[{"code":"ollama_reachable","message":"Ollama reachable at http://localhost:11434; 4 model(s) installed."}]}

curl -X POST "http://localhost:3100/api/companies/$CID/adapters/lm_studio_local/test-environment" -d '{"config":{}}'
# → {"status":"fail","checks":[{"code":"lm_studio_unreachable","message":"LM Studio server not running at http://localhost:1234: fetch failed"}]}
```
The `fail` result for LM Studio is important — it proves the `listRemoteModels` error-propagation fix works end-to-end (before the fix, the unreachable case was silently swallowed and incorrectly reported as `warn` / "no models installed").

- [x] **Step 6: Commit verification note** — Pre-existing package-level blockers were uncovered during verification and fixed; these landed in the `fix(adapters)` commit rather than a separate verification-note commit (see Corrections Applied below).

---

### Task 21: Manual smoke test — Ollama agent end-to-end

**Preconditions:** Ollama must be installed and a tool-call-capable model (e.g. `llama3.1`) must be pulled.

**This task is MANUAL — no automated steps. Do not mark complete until the operator confirms success.**

- [ ] **Step 1: Verify Ollama is running**

Run: `curl http://localhost:11434/api/tags`
Expected: JSON response with at least one model name.
If not running: `ollama serve &` and `ollama pull llama3.1`.

- [ ] **Step 2: Start Paperclip dev server**

Run: `pnpm dev`
Expected: API on `:3100`, UI on `:3100`.

- [ ] **Step 3: Create a test company and a task via the UI**

- Open `http://localhost:3100` in a browser
- Create a new company "Local Model Test Co"
- Create a task with a simple description like: "Post a comment on yourself saying 'hello from local model'"

- [ ] **Step 4: Create an Ollama agent**

- New Agent → Advanced → select "Ollama"
- baseUrl: `http://localhost:11434`
- model: `llama3.1` (or whatever is installed)
- cwd: `/tmp` (or any writable dir)
- Save.

- [ ] **Step 5: Trigger a heartbeat manually**

Either from the UI ("Invoke" button) or via curl:
```bash
curl -X POST http://localhost:3100/api/agents/<agent-id>/heartbeat/invoke \
  -H "Content-Type: application/json" \
  -d '{"source":"manual"}'
```
Expected: Heartbeat run starts.

- [ ] **Step 6: Watch the run complete**

- Observe the run logs in the UI
- Expected behavior:
  - Agent sends initial prompt to `http://localhost:11434/v1/chat/completions`
  - Model uses `paperclip_request` tool to fetch its task
  - Model uses `paperclip_request` to post a comment
  - Run finishes with status `succeeded`
  - `sessionParams.summary` appears in the run detail panel

- [ ] **Step 7: Verify zero cost reported**

In the costs dashboard, confirm the run has `$0.00` cost attributed.

- [ ] **Step 8: Run a second heartbeat to verify session summary is picked up**

Trigger another heartbeat. In the logs, look for the "Previous session summary:" prefix in the outbound prompt. Confirm the model has continuity.

- [ ] **Step 9: Mark this task complete ONLY if all 8 sub-steps succeeded**

If any sub-step fails:
- Document the failure mode in a new task below this one
- Do NOT mark this task complete
- Do NOT merge the branch

---

## Self-Review Notes

**Spec Coverage:**
- Purpose & completion criteria → covered by Tasks 13, 15, 20, 21
- Package Structure → Tasks 1, 12, 15
- AgentLoop → Tasks 8, 9
- Tools (paperclip_request, bash, fs) → Tasks 5, 6, 7
- Session Summarization → Task 10
- execute() shape → Tasks 13 (ollama), 15 (lm_studio)
- Dynamic Model Listing → Tasks 4 (client), 13 (ollama), 15 (lm_studio)
- Config Fields → Tasks 14 (ollama UI build-config), 15 step 6 (lm-studio UI build-config)
- Constraints (bash execFile, auth redaction, summary fail-safe, no extra deps) → Tasks 5, 7, 10, 1/12/15 package.json scope
- Testing Strategy (unit + integration + manual smoke) → every task has TDD; Task 21 is manual smoke
- Server registry integration → Task 16
- UI registry + wizard integration → Tasks 17, 18, 19

**Placeholder scan:** clean — every step contains complete code or an exact command.

**Type consistency:** `AgentLoopOptions`, `AgentLoopResult`, `ChatMessage`, `ToolExecutor`, `ToolContext` defined once in Task 2, referenced consistently everywhere.

**Frequent commits:** Each task ends with a single `git commit`, one commit per logical unit.

---

## Corrections Applied During Execution (2026-04-12)

Milestones 8–10 were executed on 2026-04-12 after the packages from Milestones 1–7 had
already landed. Several deviations from the original plan were necessary and are documented
here so future readers understand the final shape of the code differs from the plan text
above.

### 1. Pre-existing package-level typecheck blockers (fixed in `fix(adapters)` commit)

Uncovered while running the first full `pnpm -r typecheck` on the packages that M1–M7 shipped:

- **`parseOllamaStdoutLine` / `parseLmStudioStdoutLine` signature mismatch.** Both packages
  exported `(line: string) => { text?: string; kind?: string } | null`, but `UIAdapterModule.parseStdoutLine`
  (at `ui/src/adapters/types.ts:30`) requires the `StdoutLineParser` contract from
  `@paperclipai/adapter-utils`: `(line: string, ts: string) => TranscriptEntry[]`. Rewrote both
  exports to match and to emit `{ kind: "stdout", ts, text: line }` entries.
- **`listRemoteModels` swallowed network errors.** The `catch { return []; }` around the fetch
  call in `packages/adapters/openai-compat-local/src/client.ts:75` made it impossible for
  `testEnvironment` to distinguish "server unreachable" from "server reachable but no models",
  causing both `ollama_local` and `lm_studio_local` testEnvironment tests to fail (expected
  `"fail"`, got `"warn"`). Removed the outer catch so network errors propagate, and wrapped
  the `listModels()` entry points in both adapter packages' `server/index.ts` with their own
  `try/catch { return [] }` to preserve the UI model-discovery behavior.

### 2. `AdapterConfigFieldsProps` shape (fixed in `feat(ui)` commit)

The original Task 17 Step 3 sample code used a fictional `ConfigFieldsProps` with
`{ values, onChange }`. The actual type in `ui/src/adapters/types.ts:7–25` is
`AdapterConfigFieldsProps` with `{ mode, isCreate, adapterType, values, set, config, eff, mark, models, hideInstructionsFile }`.
Both new `OllamaLocalConfigFields` / `LmStudioLocalConfigFields` components were written to
mirror `ui/src/adapters/gemini-local/config-fields.tsx` using `Field` + `DraftInput` primitives
from `ui/src/components/agent-config-primitives.tsx`, and bind to the field names that
`buildOllamaLocalConfig` / `buildLmStudioLocalConfig` actually read: `values.url` → `baseUrl`
and `values.model` → `model`.

### 3. Scope expansion: 5 `adapterLabels` maps, 2 allowlists (fixed in `feat(ui)` commit)

Task 19 Step 3 mentioned updating only `AgentProperties.tsx`. The real scope:

- **5 label maps:**
  - `ui/src/components/AgentProperties.tsx:17` (hardcoded)
  - `ui/src/components/agent-config-primitives.tsx:62` (i18n-backed via `t("adapter.*")`)
  - `ui/src/pages/InviteLanding.tsx:15` (hardcoded)
  - `ui/src/pages/OrgChart.tsx:121` (hardcoded, short labels)
  - `ui/src/pages/Agents.tsx:24` (hardcoded, short labels)
- **2 allowlist sets** (without these, both adapters are marked `"(Coming soon)"` in the dropdown
  and the invite join flow rejects them):
  - `ENABLED_ADAPTER_TYPES` at `ui/src/components/AgentConfigForm.tsx:1025`
  - `ENABLED_INVITE_ADAPTERS` at `ui/src/pages/InviteLanding.tsx:28`
- **i18n:** `ui/src/i18n/ko.json` gained `adapter.ollama_local`, `adapter.lm_studio_local`,
  and matching `adapter.desc.*` entries.

### 4. Shared constants extension (fixed in `feat(server)` commit)

Task 16 did not include extending `packages/shared/src/constants.ts` `AGENT_ADAPTER_TYPES`.
Without that, the zod validators at API boundaries would reject requests with
`adapterType: "ollama_local"` / `"lm_studio_local"`. Both entries were added to the tuple.

**Incidental fix:** `gemini_local` was also missing from `AGENT_ADAPTER_TYPES` (pre-existing
inconsistency predating this work — `gemini_local` is referenced by every other layer of the
codebase). Added in the same edit so the enum now reflects reality.

### 5. Commit structure

Original plan had 5 separate commits (one per M8/M9 task). Condensed to 3 logical commits:

| Commit | Contents |
|---|---|
| `fix(adapters): align local adapters with UI contracts and propagate probe errors` | The two pre-existing blockers from correction 1 (parseStdoutLine signatures, listRemoteModels error propagation, listModels try/catch wrappers) |
| `feat(server): register ollama-local and lm-studio-local adapters` | `server/src/adapters/registry.ts` + `packages/shared/src/constants.ts` (AGENT_ADAPTER_TYPES extension including the incidental `gemini_local` fix) |
| `feat(ui): wire up Ollama and LM Studio adapters across dialog, properties, invite, i18n` | `ui/package.json` + `pnpm-lock.yaml` + new `ui/src/adapters/{ollama,lm-studio}-local/` dirs + `ui/src/adapters/registry.ts` + `NewAgentDialog.tsx` + all 5 label maps + 2 allowlists + `ko.json` |

### 6. Task 21 (manual Ollama end-to-end smoke test)

Deferred — requires a running `ollama serve` and `ollama pull llama3.1`. Automated verification
gate (Task 20) confirms server-level routing and adapter execution paths work. Manual task
remains unchecked above; it should be executed by the operator before the next release.
