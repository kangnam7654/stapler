# Agent Prompt Template AI Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "✨ AI로 생성" button to the agent create form's Prompt Template editor that streams a generated template from the currently selected adapter.

**Architecture:** New SSE endpoint `POST /api/companies/:id/agents/draft-prompt-template` dispatches to a per-adapter `draftText()` function. HTTP adapters (Ollama, LM Studio) call `/v1/chat/completions` with `stream: true` via a shared helper. CLI adapters (Claude, Codex, Gemini, Cursor, OpenCode, Pi, Hermes) spawn the adapter's non-interactive CLI mode and stream stdout. UI opens a modal, POSTs with `fetch` + ReadableStream parsing, and renders tokens into a preview pane.

**Tech Stack:** TypeScript, Express (server), React 19 + TanStack Query (UI), Zod (validation), shadcn/ui Dialog, Node `child_process.spawn` for CLI adapters, fetch streams for SSE transport.

**Spec:** `docs/llm/agent-prompt-template-generator.md`

**Target adapter coverage:** 10 local adapter types —
`claude_local`, `codex_local`, `gemini_local`, `cursor`, `opencode_local`,
`pi_local`, `hermes_local`, `ollama_local`, `lm_studio_local`,
`openclaw_gateway`. (`process` and `http` adapter types do NOT get `draftText`.)

**Note on Hermes:** the `hermes_local` adapter source lives in an external
npm package (`hermes-paperclip-adapter`), so we cannot add `draft.ts` to that
repo. Task 20 adds a registry-level shim that spawns the Hermes CLI directly.

---

## Task 1: Shared validator for draft request & SSE event

**Files:**
- Create: `packages/shared/src/validators/agent-prompt-generator.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/validators/agent-prompt-generator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/validators/agent-prompt-generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftPromptTemplateRequestSchema } from "./agent-prompt-generator.js";

describe("draftPromptTemplateRequestSchema", () => {
  it("accepts minimal valid payload", () => {
    const parsed = draftPromptTemplateRequestSchema.parse({
      adapterType: "ollama_local",
      adapterConfig: { baseUrl: "http://127.0.0.1:11434", model: "llama3" },
      name: "CTO",
      role: "cto",
    });
    expect(parsed.hint).toBeUndefined();
    expect(parsed.title).toBeUndefined();
  });

  it("accepts full payload with hint and reportsTo", () => {
    const parsed = draftPromptTemplateRequestSchema.parse({
      adapterType: "claude_local",
      adapterConfig: { model: "claude-sonnet-4-5" },
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
      reportsTo: "11111111-1111-1111-1111-111111111111",
      hint: "tech lead who unblocks engineers quickly",
    });
    expect(parsed.hint).toBe("tech lead who unblocks engineers quickly");
  });

  it("rejects unknown adapter type", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "bogus",
        adapterConfig: {},
        name: "X",
        role: "cto",
      }),
    ).toThrow();
  });

  it("rejects hint longer than 2000 chars", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
        hint: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "",
        role: "cto",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/shared test -- agent-prompt-generator`
Expected: FAIL — cannot find module `./agent-prompt-generator.js`.

- [ ] **Step 3: Implement the validator**

Create `packages/shared/src/validators/agent-prompt-generator.ts`:

```ts
import { z } from "zod";
import { AGENT_ADAPTER_TYPES, AGENT_ROLES } from "../constants.js";

export const draftPromptTemplateRequestSchema = z.object({
  adapterType: z.enum(AGENT_ADAPTER_TYPES),
  adapterConfig: z.record(z.unknown()),
  name: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  title: z.string().nullable().optional(),
  reportsTo: z.string().uuid().nullable().optional(),
  hint: z.string().max(2000).optional(),
});

export type DraftPromptTemplateRequest = z.infer<
  typeof draftPromptTemplateRequestSchema
>;

export type DraftPromptTemplateEvent =
  | { kind: "delta"; delta: string }
  | { kind: "done" }
  | { kind: "error"; message: string };
```

- [ ] **Step 4: Re-export from shared index**

Edit `packages/shared/src/index.ts`. Find the block that exports other
validators (search for `export { ... } from "./validators/agent.js"`) and add
below it:

```ts
export {
  draftPromptTemplateRequestSchema,
  type DraftPromptTemplateRequest,
  type DraftPromptTemplateEvent,
} from "./validators/agent-prompt-generator.js";
```

- [ ] **Step 5: Run the test and typecheck**

Run: `pnpm --filter @paperclipai/shared test -- agent-prompt-generator && pnpm --filter @paperclipai/shared build`
Expected: all 5 tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```sh
git add packages/shared/src/validators/agent-prompt-generator.ts \
        packages/shared/src/validators/agent-prompt-generator.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): add DraftPromptTemplate validator and event type"
```

---

## Task 2: Extend ServerAdapterModule contract with draftText

**Files:**
- Modify: `packages/adapter-utils/src/types.ts`
- Test: `packages/adapter-utils/src/types.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `packages/adapter-utils/src/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  ServerAdapterModule,
  AdapterDraftTextContext,
} from "./types.js";

describe("ServerAdapterModule.draftText", () => {
  it("is an optional async iterable producer", () => {
    const adapter: ServerAdapterModule = {
      type: "test",
      async execute() { throw new Error(); },
      async testEnvironment() { throw new Error(); },
      async *draftText(ctx: AdapterDraftTextContext): AsyncIterable<string> {
        yield "hello";
      },
    };
    expectTypeOf(adapter.draftText).toBeFunction();
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-utils test -- types`
Expected: FAIL — types `AdapterDraftTextContext` and `draftText` do not exist.

- [ ] **Step 3: Extend the types**

Edit `packages/adapter-utils/src/types.ts`. Locate the `ServerAdapterModule`
interface (around line 265) and add `draftText?` after the existing optional
hooks. Also add the new `AdapterDraftTextContext` interface just above
`ServerAdapterModule`:

```ts
export interface AdapterDraftTextContext {
  adapterConfig: Record<string, unknown>;
  messages: { role: "system" | "user"; content: string }[];
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

export interface ServerAdapterModule {
  type: string;
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  draftText?: (ctx: AdapterDraftTextContext) => AsyncIterable<string>;
  listSkills?: (ctx: AdapterSkillContext) => Promise<AdapterSkillSnapshot>;
  // ... (leave rest unchanged)
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @paperclipai/adapter-utils test && pnpm -r typecheck`
Expected: test PASSES, typecheck succeeds across all packages (no existing
adapter breaks because `draftText` is optional).

- [ ] **Step 5: Commit**

```sh
git add packages/adapter-utils/src/types.ts \
        packages/adapter-utils/src/types.test.ts
git commit -m "feat(adapter-utils): add optional draftText to ServerAdapterModule"
```

---

## Task 3: Shared streaming helpers

**Files:**
- Create: `packages/adapter-utils/src/draft-streaming.ts`
- Modify: `packages/adapter-utils/src/index.ts`
- Test: `packages/adapter-utils/src/draft-streaming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapter-utils/src/draft-streaming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  streamChatCompletionSSE,
  spawnAndStreamStdout,
} from "./draft-streaming.js";

async function withMockSSE(
  body: string,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe("streamChatCompletionSSE", () => {
  it("yields deltas and stops on [DONE]", async () => {
    const body = [
      `data: {"choices":[{"delta":{"content":"hel"}}]}`,
      `data: {"choices":[{"delta":{"content":"lo"}}]}`,
      `data: [DONE]`,
      ``,
    ].join("\n\n");
    await withMockSSE(body, async (url) => {
      const chunks: string[] = [];
      for await (const c of streamChatCompletionSSE({
        baseUrl: url,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5_000,
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("hello");
    });
  });

  it("throws when aborted", async () => {
    const body = `data: {"choices":[{"delta":{"content":"x"}}]}\n\n`;
    const controller = new AbortController();
    controller.abort();
    await withMockSSE(body, async (url) => {
      const gen = streamChatCompletionSSE({
        baseUrl: url,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5_000,
        signal: controller.signal,
      });
      await expect(async () => { for await (const _ of gen) {} }).rejects.toThrow();
    });
  });
});

describe("spawnAndStreamStdout", () => {
  it("yields stdout chunks as they arrive", async () => {
    const chunks: string[] = [];
    for await (const chunk of spawnAndStreamStdout({
      command: "node",
      args: ["-e", "process.stdout.write('foo'); process.stdout.write('bar');"],
      env: {},
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("foobar");
  });

  it("honors abort signal via SIGTERM", async () => {
    const controller = new AbortController();
    const gen = spawnAndStreamStdout({
      command: "node",
      args: ["-e", "setInterval(() => process.stdout.write('.'), 50);"],
      env: {},
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-utils test -- draft-streaming`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement streaming helpers**

Create `packages/adapter-utils/src/draft-streaming.ts`:

```ts
import { spawn } from "node:child_process";

export interface StreamChatCompletionSSEArgs {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: { role: string; content: string }[];
  timeoutMs: number;
  signal: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export async function* streamChatCompletionSSE(
  args: StreamChatCompletionSSEArgs,
): AsyncIterable<string> {
  const url = `${args.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (args.apiKey) headers.Authorization = `Bearer ${args.apiKey}`;

  const timer = setTimeout(
    () => (args.signal as AbortSignal & { throwIfAborted?: () => void }).throwIfAborted?.(),
    args.timeoutMs,
  );

  try {
    const body = JSON.stringify({
      model: args.model,
      messages: args.messages,
      stream: true,
      ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
      ...(args.maxTokens !== undefined ? { max_tokens: args.maxTokens } : {}),
    });

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: args.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `chat completion stream failed: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) yield delta;
          } catch {
            // skip malformed line
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface SpawnAndStreamStdoutArgs {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdin?: string;
  signal: AbortSignal;
}

export async function* spawnAndStreamStdout(
  args: SpawnAndStreamStdoutArgs,
): AsyncIterable<string> {
  const child = spawn(args.command, args.args, {
    env: { ...process.env, ...(args.env ?? {}) },
    cwd: args.cwd,
    stdio: [args.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => {
    stderr += d;
  });

  const onAbort = () => {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 2000);
  };
  args.signal.addEventListener("abort", onAbort);

  if (args.stdin !== undefined && child.stdin) {
    child.stdin.write(args.stdin);
    child.stdin.end();
  }

  child.stdout.setEncoding("utf8");
  try {
    for await (const chunk of child.stdout as AsyncIterable<string>) {
      if (args.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      yield chunk;
    }
    const code: number | null = await new Promise((resolve) => {
      child.once("close", (c) => resolve(c));
    });
    if (code !== 0 && !args.signal.aborted) {
      throw new Error(
        `${args.command} exited with code ${code ?? "?"}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
      );
    }
    if (args.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  } finally {
    args.signal.removeEventListener("abort", onAbort);
    if (!child.killed) child.kill("SIGTERM");
  }
}
```

- [ ] **Step 4: Re-export from adapter-utils index**

Edit `packages/adapter-utils/src/index.ts`. Add:

```ts
export {
  streamChatCompletionSSE,
  spawnAndStreamStdout,
  type StreamChatCompletionSSEArgs,
  type SpawnAndStreamStdoutArgs,
} from "./draft-streaming.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-utils test -- draft-streaming && pnpm --filter @paperclipai/adapter-utils build`
Expected: 4 tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```sh
git add packages/adapter-utils/src/draft-streaming.ts \
        packages/adapter-utils/src/draft-streaming.test.ts \
        packages/adapter-utils/src/index.ts
git commit -m "feat(adapter-utils): add streamChatCompletionSSE and spawnAndStreamStdout"
```

---

## Task 4: Ollama adapter draftText

**Files:**
- Create: `packages/adapters/ollama-local/src/server/draft.ts`
- Modify: `packages/adapters/ollama-local/src/server/index.ts`
- Test: `packages/adapters/ollama-local/src/server/draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/ollama-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("ollama draftText", () => {
  it("streams via /v1/chat/completions with stream=true", async () => {
    const received: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c.toString()));
      req.on("end", () => {
        received.push(body);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: {"choices":[{"delta":{"content":"he"}}]}\n\n`);
        res.write(`data: {"choices":[{"delta":{"content":"llo"}}]}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const chunks: string[] = [];
      for await (const c of draftText({
        adapterConfig: { baseUrl: `http://127.0.0.1:${port}`, model: "llama3" },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("hello");
      expect(received[0]).toContain('"stream":true');
      expect(received[0]).toContain('"model":"llama3"');
    } finally {
      server.close();
    }
  });

  it("throws when model is missing", async () => {
    const gen = draftText({
      adapterConfig: { baseUrl: "http://127.0.0.1:1" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow(/model is required/);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-ollama-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement draftText**

Create `packages/adapters/ollama-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { streamChatCompletionSSE } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OLLAMA_BASE_URL } from "../index.js";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const model = asString(config.model, "").trim();
  if (!model) throw new Error("model is required for ollama_local draftText");

  yield* streamChatCompletionSSE({
    baseUrl,
    model,
    messages: ctx.messages,
    timeoutMs: 120_000,
    signal: ctx.signal,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens,
  });
}
```

- [ ] **Step 4: Wire into adapter server index**

Edit `packages/adapters/ollama-local/src/server/index.ts`. Add below the
existing `export { execute } from "./execute.js";` line:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @paperclipai/adapter-ollama-local test && pnpm --filter @paperclipai/adapter-ollama-local build`
Expected: 2 tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```sh
git add packages/adapters/ollama-local/src/server/draft.ts \
        packages/adapters/ollama-local/src/server/draft.test.ts \
        packages/adapters/ollama-local/src/server/index.ts
git commit -m "feat(ollama-local): add draftText streaming implementation"
```

---

## Task 5: LM Studio adapter draftText

**Files:**
- Create: `packages/adapters/lm-studio-local/src/server/draft.ts`
- Modify: `packages/adapters/lm-studio-local/src/server/index.ts`
- Test: `packages/adapters/lm-studio-local/src/server/draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/lm-studio-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("lm-studio draftText", () => {
  it("streams via /v1/chat/completions", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"choices":[{"delta":{"content":"ok"}}]}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const chunks: string[] = [];
      for await (const c of draftText({
        adapterConfig: {
          baseUrl: `http://127.0.0.1:${port}`,
          model: "local-model",
        },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("ok");
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-lm-studio-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement draftText**

First inspect the default base URL:

```sh
grep -n "DEFAULT_" packages/adapters/lm-studio-local/src/index.ts
```

Create `packages/adapters/lm-studio-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { streamChatCompletionSSE } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../index.js";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const baseUrl = asString(config.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);
  const model = asString(config.model, "").trim();
  if (!model) throw new Error("model is required for lm_studio_local draftText");

  yield* streamChatCompletionSSE({
    baseUrl,
    model,
    messages: ctx.messages,
    timeoutMs: 120_000,
    signal: ctx.signal,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens,
  });
}
```

If the exported constant name differs, use whatever the `grep` above surfaced.

- [ ] **Step 4: Wire into adapter server index**

Edit `packages/adapters/lm-studio-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-lm-studio-local test && pnpm --filter @paperclipai/adapter-lm-studio-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 6: Commit**

```sh
git add packages/adapters/lm-studio-local/src/server/draft.ts \
        packages/adapters/lm-studio-local/src/server/draft.test.ts \
        packages/adapters/lm-studio-local/src/server/index.ts
git commit -m "feat(lm-studio-local): add draftText streaming implementation"
```

---

## Task 6: OpenClaw Gateway adapter draftText

**Files:**
- Create: `packages/adapters/openclaw-gateway/src/server/draft.ts`
- Modify: `packages/adapters/openclaw-gateway/src/server/index.ts`
- Test: `packages/adapters/openclaw-gateway/src/server/draft.test.ts`

- [ ] **Step 1: Inspect gateway config shape**

Run:

```sh
grep -nE "baseUrl|apiKey|gateway" packages/adapters/openclaw-gateway/src/server/execute.ts | head -20
```

The gateway adapter forwards to a configured OpenAI-compat endpoint.
Identify the exact config keys (`baseUrl`, `apiKey`, `model`) used by
`execute()` and reuse the same keys in draftText.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/openclaw-gateway/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("openclaw-gateway draftText", () => {
  it("streams via gateway's OpenAI-compat endpoint", async () => {
    let sawAuth = "";
    const server = createServer((req, res) => {
      sawAuth = req.headers["authorization"] ?? "";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"choices":[{"delta":{"content":"gw"}}]}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const chunks: string[] = [];
      for await (const c of draftText({
        adapterConfig: {
          baseUrl: `http://127.0.0.1:${port}`,
          apiKey: "secret-token",
          model: "claude-sonnet-4-5",
        },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("gw");
      expect(sawAuth).toBe("Bearer secret-token");
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-openclaw-gateway test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/openclaw-gateway/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { streamChatCompletionSSE } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const baseUrl = asString(config.baseUrl, "").trim();
  const apiKey = asString(config.apiKey, "").trim() || undefined;
  const model = asString(config.model, "").trim();
  if (!baseUrl) throw new Error("baseUrl is required for openclaw_gateway draftText");
  if (!model) throw new Error("model is required for openclaw_gateway draftText");

  yield* streamChatCompletionSSE({
    baseUrl,
    apiKey,
    model,
    messages: ctx.messages,
    timeoutMs: 120_000,
    signal: ctx.signal,
    temperature: ctx.temperature,
    maxTokens: ctx.maxTokens,
  });
}
```

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/openclaw-gateway/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-openclaw-gateway test && pnpm --filter @paperclipai/adapter-openclaw-gateway build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/openclaw-gateway/src/server/draft.ts \
        packages/adapters/openclaw-gateway/src/server/draft.test.ts \
        packages/adapters/openclaw-gateway/src/server/index.ts
git commit -m "feat(openclaw-gateway): add draftText streaming implementation"
```

---

## Task 7: Meta-prompt builder

**Files:**
- Create: `server/src/services/prompt-template-generator.ts`
- Test: `server/src/__tests__/prompt-template-generator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/prompt-template-generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMetaPrompt } from "../services/prompt-template-generator.js";

describe("buildMetaPrompt", () => {
  it("produces system + user messages with identity", () => {
    const messages = buildMetaPrompt({
      agentName: "CTO",
      agentRole: "cto",
      agentTitle: "Chief Technology Officer",
      company: { name: "Acme", description: "AI startup" },
      otherAgents: [{ name: "CEO", role: "ceo", title: "Chief Executive" }],
      reportsTo: null,
      userHint: "focus on unblocking engineers",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");

    const user = messages[1].content;
    expect(user).toContain("CTO");
    expect(user).toContain("Chief Technology Officer");
    expect(user).toContain("Acme");
    expect(user).toContain("AI startup");
    expect(user).toContain("CEO");
    expect(user).toContain("focus on unblocking engineers");
  });

  it("includes reportsTo when present", () => {
    const messages = buildMetaPrompt({
      agentName: "E1",
      agentRole: "engineer",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: { name: "CTO", role: "cto", title: "Chief Technology Officer" },
      userHint: null,
    });
    expect(messages[1].content).toContain("reports to CTO");
  });

  it("system message instructs compactness and variable usage", () => {
    const messages = buildMetaPrompt({
      agentName: "X",
      agentRole: "cto",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: null,
      userHint: null,
    });
    const sys = messages[0].content;
    expect(sys).toMatch(/compact/i);
    expect(sys).toContain("{{ context.");
    expect(sys).toContain("{{ run.");
    expect(sys).toMatch(/language/i);
  });

  it("omits missing fields gracefully", () => {
    const messages = buildMetaPrompt({
      agentName: "Solo",
      agentRole: "ceo",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: null,
      userHint: null,
    });
    expect(messages[1].content).not.toContain("undefined");
    expect(messages[1].content).not.toContain("null");
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/server test -- prompt-template-generator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

Create `server/src/services/prompt-template-generator.ts`:

```ts
import type { AgentRole } from "@paperclipai/shared";

export interface BuildMetaPromptInput {
  agentName: string;
  agentRole: AgentRole;
  agentTitle: string | null;
  company: { name: string; description: string | null };
  otherAgents: { name: string; role: string; title: string | null }[];
  reportsTo: { name: string; role: string; title: string | null } | null;
  userHint: string | null;
}

const SYSTEM_INSTRUCTIONS = [
  "You draft a Prompt Template used by an AI agent on every heartbeat.",
  "",
  "Constraints:",
  "- Keep it compact. Target under 300 words.",
  "- Prefer task framing and variables over stable instructions.",
  "- Use Handlebars-style variables where appropriate:",
  "  {{ agent.name }}, {{ agent.role }}, {{ context.* }}, {{ run.* }}.",
  "- Do NOT include stable multi-paragraph instructions (those belong in bootstrap).",
  "- Do NOT wrap the output in markdown fences, JSON, or commentary.",
  "- Output ONLY the template body as plain text.",
  "- Match the language of the user's hint. If no hint language is obvious, use the language of the company name / description. If still ambiguous, use English.",
].join("\n");

export function buildMetaPrompt(
  input: BuildMetaPromptInput,
): { role: "system" | "user"; content: string }[] {
  const lines: string[] = [];
  lines.push("Design a prompt template for a new AI agent.");
  lines.push("");
  lines.push("Agent identity:");
  lines.push(`- Name: ${input.agentName}`);
  lines.push(`- Role: ${input.agentRole}`);
  if (input.agentTitle) lines.push(`- Title: ${input.agentTitle}`);
  if (input.reportsTo) {
    lines.push(
      `- Reports to: ${input.reportsTo.name} (${input.reportsTo.role}${input.reportsTo.title ? `, ${input.reportsTo.title}` : ""})`,
    );
  }

  lines.push("");
  lines.push(`Company: ${input.company.name}`);
  if (input.company.description) lines.push(`Description: ${input.company.description}`);

  if (input.otherAgents.length > 0) {
    lines.push("");
    lines.push("Other agents in the company:");
    for (const a of input.otherAgents) {
      lines.push(`- ${a.name} (${a.role}${a.title ? `, ${a.title}` : ""})`);
    }
  }

  if (input.userHint && input.userHint.trim().length > 0) {
    lines.push("");
    lines.push("User's intent for this agent:");
    lines.push(input.userHint.trim());
  }

  return [
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: lines.join("\n") },
  ];
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @paperclipai/server test -- prompt-template-generator && pnpm -r typecheck`
Expected: 4 tests PASS, typecheck succeeds.

- [ ] **Step 5: Commit**

```sh
git add server/src/services/prompt-template-generator.ts \
        server/src/__tests__/prompt-template-generator.test.ts
git commit -m "feat(server): add buildMetaPrompt for draft prompt template"
```

---

## Task 8: Server SSE route

**Files:**
- Create: `server/src/routes/agent-prompt-generator.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/src/__tests__/agent-prompt-generator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/agent-prompt-generator.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import request from "supertest";
import { buildApp, type AppDeps } from "../app.js"; // use existing helper; adjust import if path differs

// Ollama-compatible mock streaming server
let mockServer: ReturnType<typeof createServer>;
let mockUrl = "";

beforeAll(async () => {
  mockServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: {"choices":[{"delta":{"content":"draft"}}]}\n\n`);
    res.write(`data: {"choices":[{"delta":{"content":"-template"}}]}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  });
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  const { port } = mockServer.address() as AddressInfo;
  mockUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => { mockServer.close(); });

describe("POST /api/companies/:id/agents/draft-prompt-template", () => {
  it("streams SSE deltas then done", async () => {
    const { app, db, deps } = await buildTestApp(); // see project test conventions
    const company = await deps.companiesSvc.create({ name: "Acme" });

    const response = await request(app)
      .post(`/api/companies/${company.id}/agents/draft-prompt-template`)
      .set("Content-Type", "application/json")
      .send({
        adapterType: "ollama_local",
        adapterConfig: { baseUrl: mockUrl, model: "llama3" },
        name: "CTO",
        role: "cto",
        title: "Chief Technology Officer",
      })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    const body = response.body as string;
    expect(body).toContain('"kind":"delta"');
    expect(body).toContain('"delta":"draft"');
    expect(body).toContain('"delta":"-template"');
    expect(body).toContain('"kind":"done"');
  });

  it("returns 400 for adapter without draftText (process)", async () => {
    const { app, deps } = await buildTestApp();
    const company = await deps.companiesSvc.create({ name: "Acme" });

    const response = await request(app)
      .post(`/api/companies/${company.id}/agents/draft-prompt-template`)
      .send({
        adapterType: "process",
        adapterConfig: {},
        name: "X",
        role: "general",
      });
    expect(response.status).toBe(400);
  });
});
```

Notes: the exact `buildTestApp()` helper name is whatever other server tests
use — check `server/src/__tests__/*.test.ts` for the current pattern and
mirror it verbatim (search: `grep -n "describe\(" server/src/__tests__/agents.test.ts`).

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/server test -- agent-prompt-generator`
Expected: FAIL — route returns 404 "API route not found" or schema not found.

- [ ] **Step 3: Implement the route**

Create `server/src/routes/agent-prompt-generator.ts`:

```ts
import type { Router } from "express";
import { draftPromptTemplateRequestSchema } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "../middleware/access.js";
import { getServerAdapter } from "../adapters/registry.js";
import { buildMetaPrompt } from "../services/prompt-template-generator.js";
import { createCompaniesService } from "../services/companies.js";
import { createAgentsService } from "../services/agents.js";

export function registerAgentPromptGeneratorRoutes(
  router: Router,
  deps: { db: Db },
): void {
  const companiesSvc = createCompaniesService(deps.db);
  const agentsSvc = createAgentsService(deps.db);

  router.post(
    "/companies/:companyId/agents/draft-prompt-template",
    validate(draftPromptTemplateRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const { adapterType, adapterConfig, ...identity } = req.body as {
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        name: string;
        role: string;
        title?: string | null;
        reportsTo?: string | null;
        hint?: string;
      };

      const adapter = getServerAdapter(adapterType);
      if (!adapter.draftText) {
        res.status(400).json({
          error: `adapter ${adapterType} does not support draft generation`,
        });
        return;
      }

      const company = await companiesSvc.get(companyId);
      if (!company) {
        res.status(404).json({ error: "company not found" });
        return;
      }

      const otherAgents = await agentsSvc.list(companyId);
      const reportsToAgent = identity.reportsTo
        ? otherAgents.find((a) => a.id === identity.reportsTo) ?? null
        : null;

      const messages = buildMetaPrompt({
        agentName: identity.name,
        agentRole: identity.role as never,
        agentTitle: identity.title ?? null,
        company: { name: company.name, description: company.description ?? null },
        otherAgents: otherAgents
          .filter((a) => a.id !== identity.reportsTo)
          .map((a) => ({ name: a.name, role: a.role, title: a.title })),
        reportsTo: reportsToAgent
          ? {
              name: reportsToAgent.name,
              role: reportsToAgent.role,
              title: reportsToAgent.title,
            }
          : null,
        userHint: identity.hint ?? null,
      });

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      const writeEvent = (payload: unknown) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      try {
        for await (const delta of adapter.draftText({
          adapterConfig,
          messages,
          signal: controller.signal,
        })) {
          writeEvent({ kind: "delta", delta });
        }
        writeEvent({ kind: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "generation failed";
        writeEvent({ kind: "error", message });
      } finally {
        res.end();
      }
    },
  );
}
```

- [ ] **Step 4: Register the route**

Edit `server/src/routes/index.ts`. Find where other route modules are
registered (search `registerAgentsRoutes` or similar) and add alongside:

```ts
import { registerAgentPromptGeneratorRoutes } from "./agent-prompt-generator.js";
// ...
registerAgentPromptGeneratorRoutes(router, { db });
```

- [ ] **Step 5: Run the integration test**

Run: `pnpm --filter @paperclipai/server test -- agent-prompt-generator`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```sh
git add server/src/routes/agent-prompt-generator.ts \
        server/src/routes/index.ts \
        server/src/__tests__/agent-prompt-generator.test.ts
git commit -m "feat(server): add POST /agents/draft-prompt-template SSE route"
```

---

## Task 9: UI fetch-stream client

**Files:**
- Create: `ui/src/api/draftPromptTemplate.ts`
- Test: `ui/src/api/draftPromptTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/src/api/draftPromptTemplate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamDraftPromptTemplate } from "./draftPromptTemplate.js";

describe("streamDraftPromptTemplate", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("parses SSE data lines into events", async () => {
    const sse = [
      `data: {"kind":"delta","delta":"foo"}`,
      ``,
      `data: {"kind":"delta","delta":"bar"}`,
      ``,
      `data: {"kind":"done"}`,
      ``,
    ].join("\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ) as typeof fetch;

    const events: unknown[] = [];
    for await (const e of streamDraftPromptTemplate(
      "company-1",
      {
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      },
      new AbortController().signal,
    )) {
      events.push(e);
    }

    expect(events).toEqual([
      { kind: "delta", delta: "foo" },
      { kind: "delta", delta: "bar" },
      { kind: "done" },
    ]);
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("bad", { status: 400 }),
    ) as typeof fetch;

    const gen = streamDraftPromptTemplate(
      "c",
      { adapterType: "ollama_local", adapterConfig: {}, name: "x", role: "cto" },
      new AbortController().signal,
    );
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow(/HTTP 400/);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter ui test -- draftPromptTemplate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

Create `ui/src/api/draftPromptTemplate.ts`:

```ts
import type {
  DraftPromptTemplateRequest,
  DraftPromptTemplateEvent,
} from "@paperclipai/shared";

export async function* streamDraftPromptTemplate(
  companyId: string,
  body: DraftPromptTemplateRequest,
  signal: AbortSignal,
): AsyncIterable<DraftPromptTemplateEvent> {
  const response = await fetch(
    `/api/companies/${encodeURIComponent(companyId)}/agents/draft-prompt-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
      credentials: "include",
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ""}`,
    );
  }
  if (!response.body) throw new Error("response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as DraftPromptTemplateEvent;
        } catch {
          // skip malformed event
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter ui test -- draftPromptTemplate`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```sh
git add ui/src/api/draftPromptTemplate.ts ui/src/api/draftPromptTemplate.test.ts
git commit -m "feat(ui): add streamDraftPromptTemplate fetch-stream client"
```

---

## Task 10: usePromptTemplateStream hook

**Files:**
- Create: `ui/src/hooks/usePromptTemplateStream.ts`
- Test: `ui/src/hooks/usePromptTemplateStream.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `ui/src/hooks/usePromptTemplateStream.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePromptTemplateStream } from "./usePromptTemplateStream.js";
import * as apiModule from "../api/draftPromptTemplate.js";

describe("usePromptTemplateStream", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it("transitions idle → streaming → done and accumulates preview", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "hello " };
      yield { kind: "delta" as const, delta: "world" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    expect(result.current.status).toBe("idle");

    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.preview).toBe("hello world");
    expect(result.current.error).toBeNull();
  });

  it("transitions to error state on stream error", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "partial" };
      yield { kind: "error" as const, message: "boom" };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("boom");
    expect(result.current.preview).toBe("partial");
  });

  it("cancel() aborts the stream", async () => {
    async function* mockStream(signal: AbortSignal) {
      for (let i = 0; i < 100; i++) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise((r) => setTimeout(r, 10));
        yield { kind: "delta" as const, delta: "." };
      }
    }
    const fakeController = new AbortController();
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockImplementation(
      (_c, _b, signal) => mockStream(signal),
    );

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("streaming"));

    act(() => { result.current.cancel(); });

    await waitFor(() => expect(result.current.status).toBe("canceled"));
  });

  it("reset() returns to idle and clears preview", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "x" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("done"));

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe("idle");
    expect(result.current.preview).toBe("");
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `pnpm --filter ui test -- usePromptTemplateStream`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `ui/src/hooks/usePromptTemplateStream.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import type { DraftPromptTemplateRequest } from "@paperclipai/shared";
import { streamDraftPromptTemplate } from "../api/draftPromptTemplate";

export type PromptTemplateStreamStatus =
  | "idle"
  | "streaming"
  | "done"
  | "error"
  | "canceled";

export interface UsePromptTemplateStreamResult {
  status: PromptTemplateStreamStatus;
  preview: string;
  error: string | null;
  start: (body: DraftPromptTemplateRequest) => void;
  cancel: () => void;
  reset: () => void;
}

export function usePromptTemplateStream(
  companyId: string | null,
): UsePromptTemplateStreamResult {
  const [status, setStatus] = useState<PromptTemplateStreamStatus>("idle");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus((prev) => (prev === "streaming" ? "canceled" : prev));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setPreview("");
    setError(null);
    setStatus("idle");
  }, [cancel]);

  const start = useCallback(
    (body: DraftPromptTemplateRequest) => {
      if (!companyId) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setPreview("");
      setError(null);
      setStatus("streaming");

      (async () => {
        try {
          for await (const event of streamDraftPromptTemplate(
            companyId,
            body,
            controller.signal,
          )) {
            if (controller.signal.aborted) return;
            if (event.kind === "delta") {
              setPreview((prev) => prev + event.delta);
            } else if (event.kind === "done") {
              setStatus("done");
              return;
            } else if (event.kind === "error") {
              setError(event.message);
              setStatus("error");
              return;
            }
          }
          // stream ended without explicit done/error
          setStatus((prev) => (prev === "streaming" ? "done" : prev));
        } catch (err) {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "stream failed");
          setStatus("error");
        }
      })();
    },
    [companyId],
  );

  return { status, preview, error, start, cancel, reset };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter ui test -- usePromptTemplateStream`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```sh
git add ui/src/hooks/usePromptTemplateStream.ts \
        ui/src/hooks/usePromptTemplateStream.test.tsx
git commit -m "feat(ui): add usePromptTemplateStream hook"
```

---

## Task 11: PromptTemplateGenerateDialog component

**Files:**
- Create: `ui/src/components/PromptTemplateGenerateDialog.tsx`
- Test: `ui/src/components/PromptTemplateGenerateDialog.test.tsx`
- Modify: `ui/src/i18n/ko.json`, `ui/src/i18n/en.json`

- [ ] **Step 1: Add i18n strings**

Edit `ui/src/i18n/ko.json`. Inside the existing `agents` object, add under a
new `promptTemplate` sub-object (or extend an existing one if present):

```json
"promptTemplate": {
  "aiGenerate": "✨ AI로 생성",
  "aiDialogTitle": "AI로 Prompt Template 생성",
  "aiHintPlaceholder": "어떤 에이전트를 원하는지 한두 문장으로 설명해주세요 (선택)",
  "aiGenerating": "생성 중...",
  "aiAccept": "적용",
  "aiRegenerate": "다시 생성",
  "aiCancel": "취소",
  "aiConfirmOverwriteTitle": "기존 Prompt Template을 덮어쓸까요?",
  "aiConfirmOverwriteBody": "현재 입력된 내용이 사라집니다.",
  "aiConfirmOverwriteOk": "덮어쓰기",
  "aiButtonDisabledTooltip": "모델을 먼저 선택하세요",
  "aiStreamError": "생성 실패: {{message}}"
}
```

Edit `ui/src/i18n/en.json` with the parallel English strings:

```json
"promptTemplate": {
  "aiGenerate": "✨ Generate with AI",
  "aiDialogTitle": "Generate Prompt Template with AI",
  "aiHintPlaceholder": "Describe what kind of agent you want (optional)",
  "aiGenerating": "Generating...",
  "aiAccept": "Apply",
  "aiRegenerate": "Regenerate",
  "aiCancel": "Cancel",
  "aiConfirmOverwriteTitle": "Overwrite existing Prompt Template?",
  "aiConfirmOverwriteBody": "Current content will be replaced.",
  "aiConfirmOverwriteOk": "Overwrite",
  "aiButtonDisabledTooltip": "Select a model first",
  "aiStreamError": "Generation failed: {{message}}"
}
```

- [ ] **Step 2: Write the failing test**

Create `ui/src/components/PromptTemplateGenerateDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/i18n"; // adjust to actual i18n bootstrap path
import { PromptTemplateGenerateDialog } from "./PromptTemplateGenerateDialog.js";
import * as apiModule from "../api/draftPromptTemplate.js";

function renderDialog(props: Partial<React.ComponentProps<typeof PromptTemplateGenerateDialog>> = {}) {
  const defaultProps: React.ComponentProps<typeof PromptTemplateGenerateDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    companyId: "c-1",
    requestBase: {
      adapterType: "ollama_local",
      adapterConfig: { baseUrl: "http://127.0.0.1:11434", model: "llama3" },
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
    },
    existingTemplate: "",
    onAccept: vi.fn(),
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <PromptTemplateGenerateDialog {...defaultProps} {...props} />
    </I18nextProvider>,
  );
}

describe("PromptTemplateGenerateDialog", () => {
  beforeEach(() => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "draft" };
      yield { kind: "delta" as const, delta: "-body" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());
  });
  afterEach(() => vi.restoreAllMocks());

  it("starts in input state with hint textarea and Generate button", () => {
    renderDialog();
    expect(screen.getByPlaceholderText(/어떤 에이전트|describe what kind/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /생성|Generate/i })).toBeInTheDocument();
  });

  it("transitions input → streaming → done after Generate", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(
      screen.getByPlaceholderText(/어떤 에이전트|describe what kind/i),
      "unblocks engineers",
    );
    await user.click(screen.getByRole("button", { name: /생성|Generate/i }));

    await waitFor(() => {
      expect(screen.getByText("draft-body")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /적용|Apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /다시 생성|Regenerate/i })).toBeInTheDocument();
  });

  it("calls onAccept with preview when template is empty", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onAccept });
    await user.click(screen.getByRole("button", { name: /생성|Generate/i }));
    await waitFor(() => screen.getByRole("button", { name: /적용|Apply/i }));
    await user.click(screen.getByRole("button", { name: /적용|Apply/i }));
    expect(onAccept).toHaveBeenCalledWith("draft-body");
  });

  it("shows overwrite confirm when existingTemplate is non-empty", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    renderDialog({ existingTemplate: "old content", onAccept });
    await user.click(screen.getByRole("button", { name: /생성|Generate/i }));
    await waitFor(() => screen.getByRole("button", { name: /적용|Apply/i }));
    await user.click(screen.getByRole("button", { name: /적용|Apply/i }));

    expect(screen.getByText(/덮어쓸까요|Overwrite existing/i)).toBeInTheDocument();
    expect(onAccept).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^덮어쓰기$|^Overwrite$/i }));
    expect(onAccept).toHaveBeenCalledWith("draft-body");
  });

  it("Regenerate returns to input state preserving hint", async () => {
    const user = userEvent.setup();
    renderDialog();
    const textarea = screen.getByPlaceholderText(/어떤 에이전트|describe what kind/i) as HTMLTextAreaElement;
    await user.type(textarea, "focus on code review");
    await user.click(screen.getByRole("button", { name: /생성|Generate/i }));
    await waitFor(() => screen.getByRole("button", { name: /다시 생성|Regenerate/i }));
    await user.click(screen.getByRole("button", { name: /다시 생성|Regenerate/i }));

    const inputAgain = screen.getByPlaceholderText(/어떤 에이전트|describe what kind/i) as HTMLTextAreaElement;
    expect(inputAgain.value).toBe("focus on code review");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter ui test -- PromptTemplateGenerateDialog`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the dialog**

Create `ui/src/components/PromptTemplateGenerateDialog.tsx`:

```tsx
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Loader2 } from "lucide-react";
import type { DraftPromptTemplateRequest } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePromptTemplateStream } from "../hooks/usePromptTemplateStream";

export interface PromptTemplateGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  requestBase: Omit<DraftPromptTemplateRequest, "hint">;
  existingTemplate: string;
  onAccept: (generated: string) => void;
}

type Stage = "input" | "confirm-overwrite";

export function PromptTemplateGenerateDialog({
  open,
  onOpenChange,
  companyId,
  requestBase,
  existingTemplate,
  onAccept,
}: PromptTemplateGenerateDialogProps) {
  const { t } = useTranslation();
  const [hint, setHint] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const { status, preview, error, start, cancel, reset } =
    usePromptTemplateStream(companyId);

  const handleGenerate = useCallback(() => {
    start({ ...requestBase, hint: hint.trim() || undefined });
  }, [hint, requestBase, start]);

  const handleAccept = useCallback(() => {
    if (existingTemplate.trim().length > 0) {
      setStage("confirm-overwrite");
      return;
    }
    onAccept(preview);
    onOpenChange(false);
  }, [existingTemplate, onAccept, onOpenChange, preview]);

  const handleConfirmOverwrite = useCallback(() => {
    onAccept(preview);
    setStage("input");
    onOpenChange(false);
  }, [onAccept, onOpenChange, preview]);

  const handleRegenerate = useCallback(() => {
    reset();
    setStage("input");
  }, [reset]);

  const handleCancel = useCallback(() => {
    cancel();
    onOpenChange(false);
    setTimeout(() => {
      reset();
      setStage("input");
    }, 150);
  }, [cancel, onOpenChange, reset]);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) handleCancel();
      else onOpenChange(next);
    }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("agents.promptTemplate.aiDialogTitle")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {stage === "input" && status !== "streaming" && status !== "done" && status !== "error" && (
          <div className="space-y-3">
            <Textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("agents.promptTemplate.aiHintPlaceholder")}
              maxLength={2000}
              className="min-h-[100px]"
            />
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
              <Button onClick={handleGenerate}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {t("agents.promptTemplate.aiGenerate")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {status === "streaming" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("agents.promptTemplate.aiGenerating")}
            </div>
            <pre className="whitespace-pre-wrap text-sm font-mono border border-border rounded-md p-3 min-h-[140px] max-h-[360px] overflow-auto">
              {preview}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {(status === "done" || status === "error") && stage === "input" && (
          <div className="space-y-3">
            {status === "error" && (
              <p className="text-sm text-destructive">
                {t("agents.promptTemplate.aiStreamError", { message: error ?? "" })}
              </p>
            )}
            <pre className="whitespace-pre-wrap text-sm font-mono border border-border rounded-md p-3 min-h-[140px] max-h-[360px] overflow-auto">
              {preview}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
              <Button variant="outline" onClick={handleRegenerate}>
                {t("agents.promptTemplate.aiRegenerate")}
              </Button>
              <Button onClick={handleAccept} disabled={status === "error" || preview.length === 0}>
                {t("agents.promptTemplate.aiAccept")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "confirm-overwrite" && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {t("agents.promptTemplate.aiConfirmOverwriteTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("agents.promptTemplate.aiConfirmOverwriteBody")}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStage("input")}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
              <Button onClick={handleConfirmOverwrite}>
                {t("agents.promptTemplate.aiConfirmOverwriteOk")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter ui test -- PromptTemplateGenerateDialog`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```sh
git add ui/src/components/PromptTemplateGenerateDialog.tsx \
        ui/src/components/PromptTemplateGenerateDialog.test.tsx \
        ui/src/i18n/ko.json ui/src/i18n/en.json
git commit -m "feat(ui): add PromptTemplateGenerateDialog with streaming preview"
```

---

## Task 12: Wire button into AgentConfigForm

**Files:**
- Modify: `ui/src/components/AgentConfigForm.tsx`

- [ ] **Step 1: Locate the Prompt Template block**

In `ui/src/components/AgentConfigForm.tsx`, find the block that renders
`MarkdownEditor` for `val!.promptTemplate` (around lines 671–691, inside the
`isLocal && isCreate` conditional).

- [ ] **Step 2: Add imports and new state**

Near the top of the file, add:

```tsx
import { Sparkles } from "lucide-react";
import { PromptTemplateGenerateDialog } from "./PromptTemplateGenerateDialog";
```

Inside the component function body (same scope as existing state like
`modelOpen`, `thinkingEffortOpen`), add:

```tsx
const [aiDialogOpen, setAiDialogOpen] = useState(false);
```

- [ ] **Step 3: Compute `canUseAiGenerate`**

Inside the component, near the other derived values (after `currentModelId`
definition around line 406), add:

```tsx
const ADAPTERS_WITHOUT_DRAFT = new Set(["process", "http"]);
const hasModel = typeof currentModelId === "string" && currentModelId.trim().length > 0;
const canUseAiGenerate = Boolean(
  selectedCompanyId &&
  !ADAPTERS_WITHOUT_DRAFT.has(adapterType) &&
  hasModel,
);
```

- [ ] **Step 4: Inject the ✨ button above the MarkdownEditor**

Replace the `<Field label="Prompt Template" hint={help.promptTemplate}>...`
wrapper inside the `isLocal && isCreate` block with:

```tsx
<Field
  label={
    <div className="flex items-center justify-between gap-2">
      <span>Prompt Template</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => setAiDialogOpen(true)}
        disabled={!canUseAiGenerate}
        title={!canUseAiGenerate ? t("agents.promptTemplate.aiButtonDisabledTooltip") : undefined}
      >
        <Sparkles className="h-3 w-3 mr-1" />
        {t("agents.promptTemplate.aiGenerate")}
      </Button>
    </div>
  }
  hint={help.promptTemplate}
>
  <MarkdownEditor
    value={val!.promptTemplate}
    onChange={(v) => set!({ promptTemplate: v })}
    placeholder="You are agent {{ agent.name }}. Your role is {{ agent.role }}..."
    contentClassName="min-h-[88px] text-sm font-mono"
    imageUploadHandler={async (file) => {
      const namespace = "agents/drafts/prompt-template";
      const asset = await uploadMarkdownImage.mutateAsync({ file, namespace });
      return asset.contentPath;
    }}
  />
</Field>
```

If `Field`'s `label` prop is typed as `string` only, extend its type (open
`ui/src/components/AgentConfigForm.tsx` and find the `Field` component
definition) to accept `string | React.ReactNode`. Use `label: string | ReactNode`.

- [ ] **Step 5: Render the dialog alongside the form**

Inside the `isLocal && isCreate` block, AFTER the existing amber warning
box, add:

```tsx
{selectedCompanyId && (
  <PromptTemplateGenerateDialog
    open={aiDialogOpen}
    onOpenChange={setAiDialogOpen}
    companyId={selectedCompanyId}
    requestBase={{
      adapterType: adapterType as DraftPromptTemplateRequest["adapterType"],
      adapterConfig: uiAdapter.buildAdapterConfig(val!),
      name: props.mode === "create" ? (/* read from parent via values? */) : "",
      role: /* same */,
      title: /* same */,
      reportsTo: /* same */,
    }}
    existingTemplate={val!.promptTemplate}
    onAccept={(generated) => set!({ promptTemplate: generated })}
  />
)}
```

`AgentConfigForm` does NOT own `name`, `role`, `title`, `reportsTo` — those
live in the parent `NewAgent.tsx`. Extend the `AgentConfigForm` props to
accept an optional `identityForDraft: { name: string; role: string; title: string | null; reportsTo: string | null }`
and pass it from `NewAgent.tsx`. Update the types near line 60 and thread
the prop through the conditional:

```tsx
// In AgentConfigForm props:
identityForDraft?: {
  name: string;
  role: string;
  title: string | null;
  reportsTo: string | null;
};
```

Then:

```tsx
{selectedCompanyId && props.identityForDraft && (
  <PromptTemplateGenerateDialog
    open={aiDialogOpen}
    onOpenChange={setAiDialogOpen}
    companyId={selectedCompanyId}
    requestBase={{
      adapterType: adapterType as DraftPromptTemplateRequest["adapterType"],
      adapterConfig: uiAdapter.buildAdapterConfig(val!),
      name: props.identityForDraft.name,
      role: props.identityForDraft.role as DraftPromptTemplateRequest["role"],
      title: props.identityForDraft.title,
      reportsTo: props.identityForDraft.reportsTo,
    }}
    existingTemplate={val!.promptTemplate}
    onAccept={(generated) => set!({ promptTemplate: generated })}
  />
)}
```

- [ ] **Step 6: Pass identityForDraft from NewAgent.tsx**

Edit `ui/src/pages/NewAgent.tsx`. Find the `<AgentConfigForm ... />` render
(around line 286) and add:

```tsx
<AgentConfigForm
  mode="create"
  values={configValues}
  onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
  adapterModels={adapterModels}
  identityForDraft={{
    name: name.trim() || "new-agent",
    role: effectiveRole,
    title: title.trim() || null,
    reportsTo,
  }}
/>
```

- [ ] **Step 7: Run UI type + unit tests**

Run: `pnpm --filter ui typecheck && pnpm --filter ui test`
Expected: typecheck succeeds, existing AgentConfigForm tests still pass.

- [ ] **Step 8: Manual smoke (no test code — visual verification)**

Start dev server if not running:

```sh
curl -s http://localhost:3100/api/health || pnpm dev &
```

- Open `/CMPAA/agents/new` (or whichever company prefix).
- Select adapter = `ollama_local`, set a model name.
- Confirm "✨ AI로 생성" button appears above the Prompt Template editor.
- With no model selected, confirm the button is disabled with tooltip.

If an Ollama instance is available locally, click the button, enter a hint,
click Generate, and confirm the modal streams preview text. Report tokens/s
feel. This is a manual check — not automated.

- [ ] **Step 9: Commit**

```sh
git add ui/src/components/AgentConfigForm.tsx ui/src/pages/NewAgent.tsx
git commit -m "feat(ui): wire AI prompt template generator button into NewAgent form"
```

---

## Task 13: Claude Code adapter draftText

**Files:**
- Create: `packages/adapters/claude-local/src/server/draft.ts`
- Modify: `packages/adapters/claude-local/src/server/index.ts`
- Test: `packages/adapters/claude-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify Claude CLI non-interactive flags**

Claude Code supports:
- `--print` — print response and exit
- `--output-format stream-json` — NDJSON stream of events

Verify locally:

```sh
claude --help | grep -E "print|output-format"
```

If the flags differ on installed Claude version, adjust args accordingly
before writing the adapter. Document any divergence in a comment above the
spawn call.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/claude-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("claude-local draftText", () => {
  it("streams assistant text from stream-json NDJSON", async () => {
    // Fake claude binary via a node one-liner that emits stream-json events
    const fakeScript = [
      `console.log(JSON.stringify({type:"system","subtype":"init"}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"hel"}]}}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"lo"}]}}))`,
      `console.log(JSON.stringify({type:"result",subtype:"success"}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: { command: "node", model: "claude-sonnet-4-5", claudeArgsPrefix: ["-e", fakeScript, "--"] },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("hello");
  });

  it("throws when command is missing", async () => {
    const gen = draftText({
      adapterConfig: { command: "", model: "x" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow(/command/);
  });
});
```

Note: `claudeArgsPrefix` is a test-only hook to inject fake CLI args. The
production code path uses `["--print", "--output-format", "stream-json"]`.

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-claude-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/claude-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface ClaudeStreamEvent {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
}

async function* parseClaudeNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as ClaudeStreamEvent;
        if (evt.type === "assistant" && evt.message?.content) {
          for (const part of evt.message.content) {
            if (part.type === "text" && typeof part.text === "string") {
              yield part.text;
            }
          }
        }
      } catch {
        // ignore non-JSON noise
      }
    }
  }
}

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "claude").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for claude_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = [
    ...(Array.isArray((config as Record<string, unknown>).claudeArgsPrefix)
      ? ((config as { claudeArgsPrefix?: string[] }).claudeArgsPrefix ?? [])
      : ["--print", "--output-format", "stream-json"]),
  ];
  if (model && !args.includes("--model")) args.push("--model", model);

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    stdin: prompt,
    signal: ctx.signal,
  });

  yield* parseClaudeNdjson(stdoutStream);
}
```

Note: the `claudeArgsPrefix` escape hatch is for testing — when present, it
replaces the default CLI flags so a node one-liner can impersonate the
binary. Production paths always use the default `--print --output-format stream-json`.

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/claude-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-claude-local test -- draft && pnpm --filter @paperclipai/adapter-claude-local build`
Expected: 2 tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/claude-local/src/server/draft.ts \
        packages/adapters/claude-local/src/server/draft.test.ts \
        packages/adapters/claude-local/src/server/index.ts
git commit -m "feat(claude-local): add draftText via stream-json NDJSON"
```

---

## Task 14: Codex adapter draftText

**Files:**
- Create: `packages/adapters/codex-local/src/server/draft.ts`
- Modify: `packages/adapters/codex-local/src/server/index.ts`
- Test: `packages/adapters/codex-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify Codex CLI non-interactive flags**

Check:

```sh
codex --help | head -40
codex exec --help 2>&1 | head -30
```

The Codex CLI's one-shot subcommand is typically `codex exec <prompt>` with
`--json` for machine-readable output. Confirm the exact flag names and
output schema.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/codex-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("codex-local draftText", () => {
  it("streams response text from JSON events", async () => {
    // Fake codex via node one-liner emitting JSON events with content
    const fakeScript = [
      `console.log(JSON.stringify({type:"agent_message",content:"fo"}))`,
      `console.log(JSON.stringify({type:"agent_message",content:"o"}))`,
      `console.log(JSON.stringify({type:"done"}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: {
        command: "node",
        model: "gpt-5",
        codexArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("foo");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-codex-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/codex-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface CodexEvent {
  type?: string;
  content?: string;
  delta?: string;
  text?: string;
}

async function* parseCodexNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as CodexEvent;
        if (evt.type === "agent_message" || evt.type === "message_delta") {
          const text = evt.content ?? evt.delta ?? evt.text ?? "";
          if (typeof text === "string" && text.length > 0) yield text;
        }
      } catch {
        // ignore
      }
    }
  }
}

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "codex").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for codex_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).codexArgsPrefix,
  )
    ? ((config as { codexArgsPrefix?: string[] }).codexArgsPrefix ?? [])
    : ["exec", "--json"];
  if (model && args[0] === "exec" && !args.includes("--model")) {
    args.push("--model", model);
  }
  // Prompt goes at the end as positional arg
  args.push(prompt);

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });

  yield* parseCodexNdjson(stdoutStream);
}
```

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/codex-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-codex-local test -- draft && pnpm --filter @paperclipai/adapter-codex-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/codex-local/src/server/draft.ts \
        packages/adapters/codex-local/src/server/draft.test.ts \
        packages/adapters/codex-local/src/server/index.ts
git commit -m "feat(codex-local): add draftText via codex exec --json"
```

---

## Task 15: Gemini adapter draftText

**Files:**
- Create: `packages/adapters/gemini-local/src/server/draft.ts`
- Modify: `packages/adapters/gemini-local/src/server/index.ts`
- Test: `packages/adapters/gemini-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify Gemini CLI flags**

```sh
gemini --help 2>&1 | head -30
```

Gemini CLI typically supports `gemini -p <prompt>` (or `--prompt`) for
non-interactive mode. Confirm output format — plain text vs JSON — and
adjust parsing accordingly. If Gemini does not support streaming JSON,
accept plain-text stdout and yield chunks as they arrive.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/gemini-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("gemini-local draftText", () => {
  it("passes plain-text stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("gem-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: {
        command: "node",
        model: "gemini-2.0-flash",
        geminiArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("gem-out");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-gemini-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/gemini-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "gemini").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for gemini_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).geminiArgsPrefix,
  )
    ? ((config as { geminiArgsPrefix?: string[] }).geminiArgsPrefix ?? [])
    : ["-p", prompt];
  if (model && !args.includes("--model")) args.push("--model", model);

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
```

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/gemini-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-gemini-local test -- draft && pnpm --filter @paperclipai/adapter-gemini-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/gemini-local/src/server/draft.ts \
        packages/adapters/gemini-local/src/server/draft.test.ts \
        packages/adapters/gemini-local/src/server/index.ts
git commit -m "feat(gemini-local): add draftText via gemini -p"
```

---

## Task 16: Cursor adapter draftText

**Files:**
- Create: `packages/adapters/cursor-local/src/server/draft.ts`
- Modify: `packages/adapters/cursor-local/src/server/index.ts`
- Test: `packages/adapters/cursor-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify Cursor agent CLI flags**

```sh
cursor-agent --help 2>&1 | head -30
```

Expect `cursor-agent --print --output-format stream-json` or similar. Adjust
parser to whatever event shape Cursor emits (it may match Claude's
stream-json format). Reuse the Claude NDJSON parsing pattern.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/cursor-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("cursor-local draftText", () => {
  it("streams assistant text from NDJSON", async () => {
    const fakeScript = [
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"cu"}]}}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"rsor"}]}}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: {
        command: "node",
        model: "claude-sonnet-4-5",
        cursorArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("cursor");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-cursor-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/cursor-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface CursorEvent {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
}

async function* parseCursorNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as CursorEvent;
        if (evt.type === "assistant" && evt.message?.content) {
          for (const part of evt.message.content) {
            if (part.type === "text" && typeof part.text === "string") {
              yield part.text;
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }
}

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "cursor-agent").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for cursor draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).cursorArgsPrefix,
  )
    ? ((config as { cursorArgsPrefix?: string[] }).cursorArgsPrefix ?? [])
    : ["--print", "--output-format", "stream-json"];
  if (model && !args.includes("--model")) args.push("--model", model);

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    stdin: prompt,
    signal: ctx.signal,
  });

  yield* parseCursorNdjson(stdoutStream);
}
```

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/cursor-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-cursor-local test -- draft && pnpm --filter @paperclipai/adapter-cursor-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/cursor-local/src/server/draft.ts \
        packages/adapters/cursor-local/src/server/draft.test.ts \
        packages/adapters/cursor-local/src/server/index.ts
git commit -m "feat(cursor-local): add draftText via cursor-agent stream-json"
```

---

## Task 17: OpenCode adapter draftText

**Files:**
- Create: `packages/adapters/opencode-local/src/server/draft.ts`
- Modify: `packages/adapters/opencode-local/src/server/index.ts`
- Test: `packages/adapters/opencode-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify OpenCode CLI flags**

```sh
opencode --help 2>&1 | head -30
opencode run --help 2>&1 | head -30
```

OpenCode's non-interactive subcommand is typically `opencode run --json` or
similar. Confirm output format. If OpenCode emits plain text, passthrough;
if it emits structured JSON, parse content fields similarly to codex.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/opencode-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("opencode-local draftText", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("oc-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: {
        command: "node",
        model: "provider/model-id",
        opencodeArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("oc-out");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-opencode-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/opencode-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "opencode").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for opencode_local draftText");
  if (!model) throw new Error("model is required (provider/model-id format)");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).opencodeArgsPrefix,
  )
    ? ((config as { opencodeArgsPrefix?: string[] }).opencodeArgsPrefix ?? [])
    : ["run", "--model", model];
  args.push(prompt);

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
```

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/opencode-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-opencode-local test -- draft && pnpm --filter @paperclipai/adapter-opencode-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/opencode-local/src/server/draft.ts \
        packages/adapters/opencode-local/src/server/draft.test.ts \
        packages/adapters/opencode-local/src/server/index.ts
git commit -m "feat(opencode-local): add draftText via opencode run"
```

---

## Task 18: Pi adapter draftText

**Files:**
- Create: `packages/adapters/pi-local/src/server/draft.ts`
- Modify: `packages/adapters/pi-local/src/server/index.ts`
- Test: `packages/adapters/pi-local/src/server/draft.test.ts`

- [ ] **Step 1: Verify Pi CLI flags**

```sh
pi --help 2>&1 | head -30
```

Check whether Pi CLI supports `-p <prompt>` or `exec <prompt>` for
non-interactive mode. Confirm output format.

- [ ] **Step 2: Write the failing test**

Create `packages/adapters/pi-local/src/server/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("pi-local draftText", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("pi-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      adapterConfig: {
        command: "node",
        piArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("pi-out");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/adapter-pi-local test -- draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement draftText**

Create `packages/adapters/pi-local/src/server/draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "pi").trim();
  if (!command) throw new Error("command is required for pi_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).piArgsPrefix,
  )
    ? ((config as { piArgsPrefix?: string[] }).piArgsPrefix ?? [])
    : ["-p", prompt];

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
```

If Pi's actual non-interactive flag differs (e.g., `pi exec` or stdin-based),
adjust `args` to match. The test uses `piArgsPrefix` so production flag
mismatch won't break the unit test — but Task 21 E2E smoke will surface it.

- [ ] **Step 5: Wire into adapter server index**

Edit `packages/adapters/pi-local/src/server/index.ts`. Append:

```ts
export { draftText } from "./draft.js";
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @paperclipai/adapter-pi-local test -- draft && pnpm --filter @paperclipai/adapter-pi-local build`
Expected: test PASSES, build succeeds.

- [ ] **Step 7: Commit**

```sh
git add packages/adapters/pi-local/src/server/draft.ts \
        packages/adapters/pi-local/src/server/draft.test.ts \
        packages/adapters/pi-local/src/server/index.ts
git commit -m "feat(pi-local): add draftText via pi -p"
```

---

## Task 19: Registry — wire all adapter draftText exports

**Files:**
- Modify: `server/src/adapters/registry.ts`

- [ ] **Step 1: Import draftText from each adapter package**

Edit `server/src/adapters/registry.ts`. At the top of each adapter's import
group, add `draftText as <prefix>DraftText`. For example, the Claude block:

```ts
import {
  execute as claudeExecute,
  listClaudeSkills,
  syncClaudeSkills,
  testEnvironment as claudeTestEnvironment,
  sessionCodec as claudeSessionCodec,
  getQuotaWindows as claudeGetQuotaWindows,
  draftText as claudeDraftText,
} from "@paperclipai/adapter-claude-local/server";
```

Repeat the `draftText as <prefix>DraftText` import for:

- `codex-local` → `codexDraftText`
- `cursor-local` → `cursorDraftText`
- `gemini-local` → `geminiDraftText`
- `opencode-local` → `openCodeDraftText`
- `pi-local` → `piDraftText`
- `openclaw-gateway` → `openclawGatewayDraftText`
- `ollama-local` → `ollamaDraftText`
- `lm-studio-local` → `lmStudioDraftText`

- [ ] **Step 2: Attach draftText to each adapter module object**

Add a `draftText` field to each of the 9 adapter literals. Example:

```ts
const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeExecute,
  testEnvironment: claudeTestEnvironment,
  draftText: claudeDraftText,
  // ... rest unchanged
};
```

Do the same for `codexLocalAdapter`, `cursorLocalAdapter`,
`geminiLocalAdapter`, `openclawGatewayAdapter`, `openCodeLocalAdapter`,
`piLocalAdapter`, `ollamaLocalAdapter`, `lmStudioLocalAdapter`.

(The Hermes adapter is handled in Task 20.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -r typecheck`
Expected: succeeds — all 9 adapter modules now satisfy the optional `draftText`.

- [ ] **Step 4: Integration smoke — SSE route + ollama adapter**

Run: `pnpm --filter @paperclipai/server test -- agent-prompt-generator`
Expected: both SSE route tests still pass (they already use ollama which is
now fully wired).

- [ ] **Step 5: Commit**

```sh
git add server/src/adapters/registry.ts
git commit -m "feat(server): wire draftText for 9 local adapters in registry"
```

---

## Task 20: Hermes adapter draftText shim

**Files:**
- Create: `server/src/adapters/hermes-draft.ts`
- Modify: `server/src/adapters/registry.ts`
- Test: `server/src/__tests__/hermes-draft.test.ts`

**Context:** Hermes adapter lives in an external package
`hermes-paperclip-adapter` which we cannot modify. Implement `draftText` in a
local file that spawns the Hermes CLI directly.

- [ ] **Step 1: Verify Hermes CLI non-interactive flags**

```sh
hermes --help 2>&1 | head -40
```

Check the non-interactive subcommand and output format. Hermes may support
`hermes -p <prompt>` or `hermes run --json <prompt>`. Adjust args in Step 3.

- [ ] **Step 2: Write the failing test**

Create `server/src/__tests__/hermes-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { draftHermes } from "../adapters/hermes-draft.js";

describe("hermes draft shim", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("herm-out")`;
    const chunks: string[] = [];
    for await (const c of draftHermes({
      adapterConfig: {
        command: "node",
        hermesArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("herm-out");
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter @paperclipai/server test -- hermes-draft`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the shim**

Create `server/src/adapters/hermes-draft.ts`:

```ts
import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftHermes(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.adapterConfig);
  const command = asString(config.command, "hermes").trim();
  if (!command) throw new Error("command is required for hermes_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).hermesArgsPrefix,
  )
    ? ((config as { hermesArgsPrefix?: string[] }).hermesArgsPrefix ?? [])
    : ["-p", prompt];

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
```

- [ ] **Step 5: Wire into registry**

Edit `server/src/adapters/registry.ts`. Import:

```ts
import { draftHermes } from "./hermes-draft.js";
```

Add `draftText: draftHermes` to `hermesLocalAdapter`:

```ts
const hermesLocalAdapter: ServerAdapterModule = {
  type: "hermes_local",
  execute: hermesExecute,
  testEnvironment: hermesTestEnvironment,
  draftText: draftHermes,
  sessionCodec: hermesSessionCodec,
  // ... rest unchanged
};
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @paperclipai/server test -- hermes-draft && pnpm -r typecheck`
Expected: test PASSES, typecheck succeeds.

- [ ] **Step 7: Commit**

```sh
git add server/src/adapters/hermes-draft.ts \
        server/src/__tests__/hermes-draft.test.ts \
        server/src/adapters/registry.ts
git commit -m "feat(server): add hermes draftText shim"
```

---

## Task 21: DesignGuide showcase + verification gate

**Files:**
- Modify: `ui/src/pages/DesignGuide.tsx`

- [ ] **Step 1: Add a showcase entry for the dialog**

Edit `ui/src/pages/DesignGuide.tsx`. Find the existing section pattern
(search for "GettingStartedPanel" to see how components are embedded). Add a
new subsection near related form components:

```tsx
import { PromptTemplateGenerateDialog } from "@/components/PromptTemplateGenerateDialog";
// ...

function PromptTemplateGeneratorShowcase() {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">AI Prompt Template Generator</h3>
      <p className="text-xs text-muted-foreground">
        Modal dialog shown from the agent create form. Streams preview from the
        currently selected adapter.
      </p>
      <Button onClick={() => setOpen(true)}>Open generator dialog</Button>
      <PromptTemplateGenerateDialog
        open={open}
        onOpenChange={setOpen}
        companyId="showcase-company"
        requestBase={{
          adapterType: "ollama_local",
          adapterConfig: { baseUrl: "http://127.0.0.1:11434", model: "llama3" },
          name: "CTO",
          role: "cto",
          title: "Chief Technology Officer",
        }}
        existingTemplate=""
        onAccept={(text) => console.log("accepted:", text)}
      />
    </section>
  );
}
```

Add `<PromptTemplateGeneratorShowcase />` to the DesignGuide page
composition at an appropriate position (near other form-related showcases).

- [ ] **Step 2: Visual verification**

Start dev if not running, then visit `/design-guide` in the browser. Confirm
the section renders and the dialog opens.

- [ ] **Step 3: Run the full verification gate**

Per `CLAUDE.md` §7:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Expected: all three pass. If any step fails, fix before committing.

- [ ] **Step 4: Commit**

```sh
git add ui/src/pages/DesignGuide.tsx
git commit -m "docs(ui): add AI prompt generator to DesignGuide showcase"
```

- [ ] **Step 5: E2E manual smoke (report, don't automate)**

For each locally-installable adapter the engineer has available, manually:

1. Open `/CMPAA/agents/new`.
2. Select the adapter type, configure model.
3. Click ✨ button, enter a short hint, click Generate.
4. Confirm preview streams non-empty text.
5. Click Accept, confirm editor contents are overwritten.

For adapters without local CLI availability, note in the PR description which
ones were not smoke-tested. Document any CLI-flag mismatches surfaced during
smoke and open follow-up issues.

---

## Final Verification

After Task 21, run the full project gate one more time:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

Open a PR per `superpowers:finishing-a-development-branch`.
