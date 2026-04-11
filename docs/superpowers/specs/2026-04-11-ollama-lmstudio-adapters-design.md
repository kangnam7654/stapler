# Design: Ollama & LM Studio Full Agentic Adapters

Date: 2026-04-11
Status: Approved
Author: kangnam

## Purpose

Add full agentic adapters for Ollama and LM Studio — locally-running OpenAI-compatible model servers. Motivation is cost: local models have zero API cost. Both adapters must support autonomous task execution with Paperclip API access, shell commands, and file operations.

Completion criteria:
- `ollama-local` and `lm-studio-local` adapter packages pass `testEnvironment()`
- An agent using either adapter can check out a Paperclip task, do work, and post a comment
- Dynamic model listing works when server is running; falls back gracefully when not
- Session summary is persisted across heartbeats via `sessionParams`

---

## Package Structure

```
packages/adapters/
  openai-compat-local/          ← shared core (new)
    src/
      client.ts                 ← OpenAI-compat HTTP client
      loop.ts                   ← AgentLoop: tool-use loop engine
      tools.ts                  ← tool definitions and executor
      summarize.ts              ← post-run session summarization
      types.ts                  ← shared types
      index.ts                  ← barrel exports
    package.json

  ollama-local/                 ← thin wrapper (new)
    src/
      index.ts                  ← type, label, default models, agentConfigurationDoc
      server/
        execute.ts              ← calls openai-compat-local core
        test.ts                 ← connectivity check
      ui/
        build-config.ts         ← UI config form
        index.ts
      cli/
        index.ts
    package.json

  lm-studio-local/              ← thin wrapper (new, mirrors ollama-local)
    src/
      index.ts                  ← type="lm_studio_local", baseUrl=localhost:1234
      server/execute.ts
      server/test.ts
      ui/build-config.ts
      ui/index.ts
      cli/index.ts
    package.json
```

`ollama-local` and `lm-studio-local` differ only in: adapter type name, label, default `baseUrl`, and default model list. All loop logic lives in `openai-compat-local`.

**Adapter-specific defaults:**

| | `ollama-local` | `lm-studio-local` |
|---|---|---|
| `type` | `ollama_local` | `lm_studio_local` |
| `DEFAULT_BASE_URL` | `http://localhost:11434` | `http://localhost:1234` |
| `DEFAULT_MODEL` | `llama3.1` | `local-model` |

---

## AgentLoop (loop.ts)

### Interface

```ts
interface AgentLoopOptions {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  enabledToolNames: string[];
  timeoutMs: number;
  env: Record<string, string>;
  cwd: string;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}

interface AgentLoopResult {
  messages: ChatMessage[];       // full conversation
  finishReason: "done" | "timeout" | "error";
  errorMessage: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult>
```

### Flow

```
1. POST /v1/chat/completions  { model, messages, tools }
2. Response has tool_calls?
     Yes → execute each tool → append tool results to messages → goto 1
     No  → finish (finishReason: "done")
3. Timeout reached at any await → finishReason: "timeout"
4. HTTP error / model error → finishReason: "error"
```

Each tool call is logged to `onLog("stdout", ...)` before execution. Tool results are appended as `role: "tool"` messages.

---

## Tools (tools.ts)

### Available tools

| Name | Description |
|------|-------------|
| `paperclip_request` | Paperclip REST API call. Uses `PAPERCLIP_API_URL` + `PAPERCLIP_API_KEY` from env. Params: `method`, `path`, `body?` |
| `bash` | Run shell command in `cwd`. Params: `command` (string). Executed as `execFile('bash', ['-c', command])` — no shell injection. Returns stdout + stderr combined, truncated at 8KB per call |
| `read_file` | Read file at absolute or cwd-relative path. Returns content string |
| `write_file` | Write/overwrite file. Params: `path`, `content` |
| `list_dir` | List directory entries. Params: `path` |

### Activation

Config field `enabledTools: string[]` selects which tools are exposed to the model. Default: all five. Tools not in the list are not included in the `/v1/chat/completions` request.

---

## Session Summarization (summarize.ts)

### Interface

```ts
async function summarizeSession(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<string | null>
```

### Behavior

After `runAgentLoop` completes (any finishReason), call the same model with:

```
[...messages, {
  role: "user",
  content: "Summarize what you accomplished in this session in 3-5 bullet points. Be concise. This will be your context note for the next session."
}]
```

Result is stored as `sessionParams.summary`. If summarization times out or fails, `summary` is omitted — next run starts without a summary note.

### Injection into next run

If `sessionParams.summary` is present, prepend to messages:
```ts
{
  role: "user",
  content: `Previous session summary:\n${summary}\n\nContinue from where you left off.`
}
```

---

## execute() Shape (per adapter)

```ts
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const baseUrl = asString(config.baseUrl, DEFAULT_BASE_URL);
  const model   = asString(config.model, DEFAULT_MODEL);
  const cwd     = asString(config.cwd, process.cwd());
  const timeoutSec = asNumber(config.timeoutSec, 300);

  // Build env (PAPERCLIP_* vars + config.env overrides)
  const env = { ...buildPaperclipEnv(agent), PAPERCLIP_RUN_ID: runId, ...parseObject(config.env) };

  // Build initial messages
  const prevSummary = asString(parseObject(runtime.sessionParams).summary, "");
  const messages = buildInitialMessages({ agent, context, config, prevSummary });

  // Run loop
  const result = await runAgentLoop({ baseUrl, model, messages, tools, enabledToolNames, timeoutMs: timeoutSec * 1000, env, cwd, onLog });

  // Summarize
  const summary = await summarizeSession(baseUrl, model, result.messages, 60_000);

  return {
    exitCode: result.finishReason === "error" ? 1 : 0,
    signal: null,
    timedOut: result.finishReason === "timeout",
    errorMessage: result.errorMessage,
    usage: result.usage,
    costUsd: 0,
    provider: PROVIDER_NAME,       // "ollama" | "lm_studio"
    billingType: "local",
    model,
    sessionParams: summary ? { summary } : null,
    sessionDisplayId: summary ? `summary@${Date.now()}` : null,
  };
}
```

---

## Dynamic Model Listing

### listModels()

```ts
// ollama-local
GET {baseUrl}/api/tags  →  { models: [{ name: string }] }
return models.map(m => ({ id: m.name, label: m.name }))

// lm-studio-local
GET {baseUrl}/v1/models  →  { data: [{ id: string }] }
return data.map(m => ({ id: m.id, label: m.id }))
```

Each adapter's `server/index.ts` exports both `listModels()` and `testEnvironment()`. They share the same connectivity check but have separate responsibilities. If the request fails (ECONNREFUSED, timeout), `listModels()` returns `[]` — UI renders a free-text input instead of a dropdown.

### testEnvironment()

Uses the same endpoint as `listModels()`. Returns:
- `pass` if server responds with valid model list
- `fail: "{AdapterLabel} server not running at {baseUrl}"` if connection refused
- `fail: "Unexpected response from {AdapterLabel} server"` if response is malformed

Error messages use the adapter's own label (e.g. "Ollama" vs "LM Studio") — no hardcoded strings in shared core.

---

## Config Fields Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | string | (adapter-specific) | Model server URL |
| `model` | string | (adapter-specific) | Model ID to use |
| `cwd` | string | `process.cwd()` | Working directory for bash/file tools |
| `promptTemplate` | string | (built-in) | Heartbeat prompt template (supports `{{agent.*}}`) |
| `systemPrompt` | string | `""` | System message prepended to every run |
| `enabledTools` | string[] | all 5 tools | Which tools to expose to the model |
| `timeoutSec` | number | `300` | Hard timeout for the entire run |
| `graceSec` | number | `20` | (reserved, unused in HTTP-based loop) |
| `env` | object | `{}` | Extra KEY=VALUE env vars |

---

## Constraints

- Tool `bash` must inherit the same `cwd` and `env` as the run. Always use `execFile('bash', ['-c', command], { cwd, env })` — never `exec(command)` or template-interpolate env values into the command string.
- `paperclip_request` must redact `Authorization` headers in logs.
- Summarization failure must never fail the run — catch and continue.
- `openai-compat-local` must have zero runtime dependencies beyond Node built-ins and `@paperclipai/adapter-utils`.
- All new packages follow the existing monorepo pattern: `tsconfig.json` extends root, `package.json` with `"type": "module"`.

---

## Decisions

| Decision | Chosen | Rejected |
|----------|--------|----------|
| Tool-use loop location | `openai-compat-local` shared core | Inline in each adapter (too much duplication) |
| Session continuity | Summary-based via `sessionParams` | Full message history (context window risk), none (loses context) |
| Loop termination | `timeoutSec` only | Max-turns counter (redundant with timeout) |
| Model discovery | Dynamic `listModels()` + fallback | Static list only (stale), config-only (no UX) |
| Local model billing | `costUsd: 0`, `billingType: "local"` | Skip cost reporting entirely (loses token tracking) |

---

## Testing Strategy

### Unit
- `runAgentLoop`: mock HTTP client, assert tool call → result → second request flow
- `summarizeSession`: mock HTTP client, assert summary extracted from response
- `tools.ts`: test bash output capture, file read/write, paperclip_request URL construction

### Integration
- Start local Ollama (if available in CI) → full `execute()` → assert `sessionParams.summary` set
- `testEnvironment()` against stopped server → assert `fail` status

### Manual smoke test
- Create agent with `ollama_local` adapter pointing to local Ollama
- Invoke heartbeat → agent checks out a task → posts a comment → run succeeds
