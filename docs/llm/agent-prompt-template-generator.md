# Agent Prompt Template AI Generator — LLM Design Doc

## Purpose

Add an "✨ AI로 생성" button to the Prompt Template editor on the agent create
form. Clicking opens a modal where the user types what kind of agent they
want. The server invokes the adapter **currently selected in the form** (not
yet persisted) with a meta-prompt that includes agent identity, company
context, and the user's hint. Output streams token-by-token into the modal's
preview pane. On accept, the preview replaces the Prompt Template field.

**Completion criteria:**

- Prompt Template editor shows a "✨ AI로 생성" button (create mode only, local
  adapters only).
- Button is disabled with tooltip when adapter config is incomplete (model
  missing, CLI unresolvable, etc.).
- Clicking opens a modal with: free-text hint textarea, generate button,
  streaming preview pane, accept/regenerate/cancel actions.
- Server streams generated text via SSE as tokens arrive.
- Each of the 10 local adapters (claude_local, codex_local, gemini_local,
  cursor, opencode_local, pi_local, hermes_local, ollama_local, lm_studio_local,
  openai_compat_local via openclaw_gateway) supports one-shot streaming
  generation.
- Accepting overwrites Prompt Template; confirmation dialog appears if
  existing content is non-empty.
- Regenerating returns to the input state (user may edit the hint).

---

## Architecture

```
UI: ✨ button in AgentConfigForm
  → opens PromptTemplateGenerateDialog
  → user types hint, clicks Generate
  → EventSource: POST /api/companies/:id/agents/draft-prompt-template
      body: { adapterType, adapterConfig, name, role, title, reportsTo, hint }
  → server builds meta-prompt (identity + company context + hint)
  → server dispatches to selected adapter's draftText()
  → adapter returns AsyncIterable<string> (token chunks)
  → server forwards chunks as SSE `data: {"delta":"..."}` events
  → UI appends to preview pane
  → on done, server sends `data: {"done":true}`
  → user clicks Accept → dialog closes, Prompt Template field set
```

---

## File Changes

### New files

| Path | Description |
|------|-------------|
| `ui/src/components/PromptTemplateGenerateDialog.tsx` | Modal: hint textarea, generate button, streaming preview, accept/regenerate/cancel. Uses shadcn/ui `Dialog`. |
| `ui/src/hooks/usePromptTemplateStream.ts` | EventSource wrapper. Exposes `{ status, preview, error, start, cancel }`. States: `idle | streaming | done | error | canceled`. |
| `ui/src/api/draftPromptTemplate.ts` | Typed SSE client (fetch + ReadableStream parsing — EventSource doesn't support POST bodies). |
| `server/src/routes/agent-prompt-generator.ts` | Registers `POST /api/companies/:companyId/agents/draft-prompt-template` SSE route. |
| `server/src/services/prompt-template-generator.ts` | Pure function: given `{agent identity, company context, hint}`, builds the meta-prompt (system + user messages). |
| `packages/shared/src/validators/agent-prompt-generator.ts` | Zod schema for request + SSE event shape. |
| `packages/adapters/claude-local/src/server/draft.ts` | `draftText()` using `claude --print` non-interactive mode with stdout streaming. |
| `packages/adapters/codex-local/src/server/draft.ts` | `draftText()` using `codex exec` with stdout streaming. |
| `packages/adapters/cursor-local/src/server/draft.ts` | `draftText()` using `cursor-agent --print` streaming. |
| `packages/adapters/gemini-local/src/server/draft.ts` | `draftText()` using `gemini -p` non-interactive streaming. |
| `packages/adapters/opencode-local/src/server/draft.ts` | `draftText()` using `opencode run` streaming. |
| `packages/adapters/pi-local/src/server/draft.ts` | `draftText()` using `pi` non-interactive streaming. |
| `packages/adapters/hermes-local/src/server/draft.ts` | `draftText()` using hermes non-interactive streaming. |
| `packages/adapters/ollama-local/src/server/draft.ts` | `draftText()` using `/v1/chat/completions` with `stream: true`, SSE parser. |
| `packages/adapters/lm-studio-local/src/server/draft.ts` | `draftText()` using `/v1/chat/completions` with `stream: true`, SSE parser. |
| `packages/adapters/openclaw-gateway/src/server/draft.ts` | `draftText()` forwarding to the configured gateway backend's OpenAI-compat endpoint. |
| `packages/adapter-utils/src/draft-streaming.ts` | Shared helpers: `streamChatCompletionSSE()` for HTTP adapters, `spawnAndStreamStdout()` for CLI adapters. |

### Modified files

| Path | Description |
|------|-------------|
| `packages/adapter-utils/src/types.ts` | Add optional `draftText(ctx: AdapterDraftTextContext): AsyncIterable<string>` to `ServerAdapterModule`. Add new types `AdapterDraftTextContext`, `AdapterDraftTextChunk`. |
| `packages/adapters/*/src/server/index.ts` (×10) | Wire `draftText` into each adapter module export. |
| `packages/shared/src/index.ts` | Re-export new validator from `validators/agent-prompt-generator.ts`. |
| `server/src/routes/index.ts` | Register `agent-prompt-generator` route module. |
| `ui/src/components/AgentConfigForm.tsx` | Add "✨ AI로 생성" button above the Prompt Template MarkdownEditor (create mode, `isLocal`). Wire up dialog state. |
| `ui/src/i18n/ko.json` + `en.json` | Strings: `agents.promptTemplate.aiGenerate`, `agents.promptTemplate.aiDialogTitle`, `agents.promptTemplate.aiHintPlaceholder`, `agents.promptTemplate.aiGenerating`, `agents.promptTemplate.aiAccept`, `agents.promptTemplate.aiRegenerate`, `agents.promptTemplate.aiConfirmOverwrite`, `agents.promptTemplate.aiButtonDisabledTooltip`. |

**No DB schema changes.**

---

## Implementation Order

### Step 1: Shared validator

File: `packages/shared/src/validators/agent-prompt-generator.ts`

Export:

```ts
import { adapterConfigSchema } from "./agent.js";

export const draftPromptTemplateRequestSchema = z.object({
  adapterType: z.enum(AGENT_ADAPTER_TYPES),
  adapterConfig: adapterConfigSchema,
  name: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  title: z.string().nullable().optional(),
  reportsTo: z.string().uuid().nullable().optional(),
  hint: z.string().max(2000).optional(),
});
export type DraftPromptTemplateRequest = z.infer<typeof draftPromptTemplateRequestSchema>;

export type DraftPromptTemplateEvent =
  | { kind: "delta"; delta: string }
  | { kind: "done" }
  | { kind: "error"; message: string };
```

Export from `packages/shared/src/index.ts`. Run `pnpm -r typecheck`.

### Step 2: Extend ServerAdapterModule contract

File: `packages/adapter-utils/src/types.ts`

Add to `ServerAdapterModule`:

```ts
draftText?: (ctx: AdapterDraftTextContext) => AsyncIterable<string>;
```

New types:

```ts
export interface AdapterDraftTextContext {
  adapterConfig: Record<string, unknown>;
  messages: { role: "system" | "user"; content: string }[];
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}
```

`draftText` is optional on the interface but every local adapter in this project
must implement it. HTTP-based adapters and CLI-based adapters use different
helper paths (see Step 3).

### Step 3: Shared draft streaming helpers

File: `packages/adapter-utils/src/draft-streaming.ts`

Export two helpers used by adapters:

```ts
export async function* streamChatCompletionSSE(args: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: { role: string; content: string }[];
  timeoutMs: number;
  signal: AbortSignal;
}): AsyncIterable<string>;

export async function* spawnAndStreamStdout(args: {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  stdin?: string;
  signal: AbortSignal;
}): AsyncIterable<string>;
```

- `streamChatCompletionSSE` — POST `/v1/chat/completions` with `stream: true`,
  parse `data: {...}` SSE lines, yield `choices[0].delta.content` strings.
- `spawnAndStreamStdout` — spawn child process via `child_process.spawn`,
  pipe stdout chunks as they arrive, honor abort signal (send SIGTERM).

### Step 4: HTTP adapters — ollama_local, lm_studio_local

File: `packages/adapters/ollama-local/src/server/draft.ts`

```ts
export async function* draftText(ctx: AdapterDraftTextContext): AsyncIterable<string> {
  const baseUrl = String(ctx.adapterConfig.baseUrl ?? "http://127.0.0.1:11434");
  const model = String(ctx.adapterConfig.model ?? "");
  if (!model) throw new Error("model is required");
  yield* streamChatCompletionSSE({
    baseUrl, model, messages: ctx.messages,
    timeoutMs: 120_000, signal: ctx.signal,
  });
}
```

Replicate for `lm-studio-local` with its default baseUrl.

Wire into each package's `src/server/index.ts`:

```ts
import { draftText } from "./draft.js";
export const serverAdapter: ServerAdapterModule = {
  type: "ollama_local",
  execute, testEnvironment, draftText,
  // ...
};
```

### Step 5: Claude Code CLI adapter — claude_local

File: `packages/adapters/claude-local/src/server/draft.ts`

Use `claude --print --output-format stream-json` with prompt passed on stdin.
Parse NDJSON stdout; yield `message.content[0].text` deltas.

Signature:

```ts
export async function* draftText(ctx: AdapterDraftTextContext): AsyncIterable<string> {
  const command = String(ctx.adapterConfig.command ?? "claude");
  const model = String(ctx.adapterConfig.model ?? "");
  const prompt = ctx.messages.map(m => `[${m.role}]\n${m.content}`).join("\n\n");
  const args = ["--print", "--output-format", "stream-json"];
  if (model) args.push("--model", model);
  yield* parseClaudeStreamJsonDeltas(
    spawnAndStreamStdout({ command, args, stdin: prompt, env: {...}, signal: ctx.signal })
  );
}
```

Reuse `parseClaudeStreamJson` from existing `parse.ts`; add a lightweight
`parseClaudeStreamJsonDeltas()` helper that yields text-only chunks.

### Step 6: Codex CLI adapter — codex_local

File: `packages/adapters/codex-local/src/server/draft.ts`

Use `codex exec --json <prompt>` or stdin-based equivalent. Parse stdout JSON
lines for content deltas.

### Step 7: Other CLI adapters — gemini_local, cursor, opencode_local, pi_local, hermes_local

One file each following Step 5 pattern:

- `gemini_local` — `gemini -p <prompt> --output-format json`
- `cursor` — `cursor-agent --print --output-format stream-json` (stdin prompt)
- `opencode_local` — `opencode run --json <prompt>`
- `pi_local` — use internal pi CLI non-interactive flag
- `hermes_local` — hermes CLI non-interactive streaming mode

Each verifies CLI command is resolvable (reuse `ensureCommandResolvable` from
`adapter-utils/server-utils`) before spawning.

### Step 8: Gateway adapter — openclaw_gateway

File: `packages/adapters/openclaw-gateway/src/server/draft.ts`

Forward to the gateway's OpenAI-compat endpoint. Reuse
`streamChatCompletionSSE()` with gateway's baseUrl + API key from
`ctx.adapterConfig`.

### Step 9: Meta-prompt builder

File: `server/src/services/prompt-template-generator.ts`

```ts
export interface BuildMetaPromptInput {
  agentName: string;
  agentRole: AgentRole;
  agentTitle: string | null;
  company: { name: string; description: string | null };
  otherAgents: { name: string; role: string; title: string | null }[];
  reportsTo: { name: string; role: string; title: string | null } | null;
  userHint: string | null;
}

export function buildMetaPrompt(
  input: BuildMetaPromptInput,
): { role: "system" | "user"; content: string }[];
```

System message fixes format constraints:

- Must be compact (< 400 tokens).
- Must use `{{ agent.name }}`, `{{ agent.role }}`, `{{ context.* }}`,
  `{{ run.* }}` variables where appropriate.
- Must NOT repeat stable instructions (those belong in bootstrap, not
  heartbeat template).
- Must be in the same language as `userHint` (default: Korean if ambiguous).

User message injects the structured identity + company context + hint.

### Step 10: Server route

File: `server/src/routes/agent-prompt-generator.ts`

```ts
router.post(
  "/companies/:companyId/agents/draft-prompt-template",
  validate(draftPromptTemplateRequestSchema),
  async (req, res) => {
    assertCompanyAccess(req, req.params.companyId);

    const { adapterType, adapterConfig, ...identity } = req.body;
    const adapter = getServerAdapter(adapterType);
    if (!adapter.draftText) {
      res.status(400).json({ error: "adapter does not support drafting" });
      return;
    }

    const company = await companiesSvc.get(req.params.companyId);
    const otherAgents = await agentsSvc.list(req.params.companyId);
    const reportsTo = identity.reportsTo
      ? otherAgents.find(a => a.id === identity.reportsTo) ?? null
      : null;

    const messages = buildMetaPrompt({
      agentName: identity.name,
      agentRole: identity.role,
      agentTitle: identity.title ?? null,
      company: { name: company.name, description: company.description },
      otherAgents: otherAgents.map(a => ({ name: a.name, role: a.role, title: a.title })),
      reportsTo: reportsTo ? { name: reportsTo.name, role: reportsTo.role, title: reportsTo.title } : null,
      userHint: identity.hint ?? null,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      for await (const chunk of adapter.draftText({
        adapterConfig, messages, signal: controller.signal,
      })) {
        res.write(`data: ${JSON.stringify({ kind: "delta", delta: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ kind: "done" })}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "generation failed";
      res.write(`data: ${JSON.stringify({ kind: "error", message })}\n\n`);
    } finally {
      res.end();
    }
  },
);
```

Register in `server/src/routes/index.ts`.

### Step 11: UI — SSE client + hook

File: `ui/src/api/draftPromptTemplate.ts`

Use `fetch` with `ReadableStream` (not `EventSource` — can't send POST body).

```ts
export async function* streamDraftPromptTemplate(
  companyId: string,
  body: DraftPromptTemplateRequest,
  signal: AbortSignal,
): AsyncIterable<DraftPromptTemplateEvent> {
  const response = await fetch(
    `/api/companies/${companyId}/agents/draft-prompt-template`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal },
  );
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      if (raw.startsWith("data: ")) {
        yield JSON.parse(raw.slice(6)) as DraftPromptTemplateEvent;
      }
    }
  }
}
```

File: `ui/src/hooks/usePromptTemplateStream.ts`

Exposes `{ status, preview, error, start(body), cancel() }`. Internally calls
`streamDraftPromptTemplate`, appends deltas to `preview`, transitions status
on `done`/`error`.

### Step 12: UI — modal dialog

File: `ui/src/components/PromptTemplateGenerateDialog.tsx`

```tsx
interface PromptTemplateGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  requestBase: Omit<DraftPromptTemplateRequest, "hint">;
  existingTemplate: string;
  onAccept: (generated: string) => void;
}
```

States:

1. `input` — textarea for hint + Generate button.
2. `streaming` — preview fills live; Cancel button.
3. `done` — preview shown; Accept / Regenerate / Cancel buttons.
4. `error` — error + Retry / Cancel.

On Accept: if `existingTemplate.trim().length > 0`, show an inline confirm
"Overwrite existing prompt template?" → OK calls `onAccept(preview)`.

On Regenerate from `done`/`error`: return to `input` state, preserve user's
previous hint so they can edit.

### Step 13: UI — wire into AgentConfigForm

File: `ui/src/components/AgentConfigForm.tsx`

Above the Prompt Template MarkdownEditor (inside the `isLocal && isCreate`
block around line 672), add:

```tsx
<div className="flex items-center justify-between">
  <span className="text-xs font-medium text-muted-foreground">Prompt Template</span>
  <Button
    type="button" variant="outline" size="sm"
    onClick={() => setAiDialogOpen(true)}
    disabled={!canUseAiGenerate}
    title={canUseAiGenerate ? undefined : t("agents.promptTemplate.aiButtonDisabledTooltip")}
  >
    <Sparkles className="h-3.5 w-3.5 mr-1" />
    {t("agents.promptTemplate.aiGenerate")}
  </Button>
</div>
```

`canUseAiGenerate` is true iff:

- `adapterType` is not `process` or `http` (these don't have `draftText`).
- `adapterConfig.model` is a non-empty string when the adapter requires a model
  (per the same rules as `testEnvironment`).
- `selectedCompanyId` is set.

### Step 14: Tests

Files:

- `packages/adapter-utils/src/draft-streaming.test.ts` — unit-test
  `streamChatCompletionSSE` against a mock SSE server; unit-test
  `spawnAndStreamStdout` against a fake command (node one-liner that echoes).
- `server/src/__tests__/agent-prompt-generator.test.ts` — integration: POST
  the endpoint with `adapterType: "ollama_local"` pointed at a mock HTTP
  server, assert streamed SSE payload.
- `ui/src/components/PromptTemplateGenerateDialog.test.tsx` — React Testing
  Library: state transitions input → streaming → done, accept overwrite
  confirmation.

### Step 15: i18n + DesignGuide showcase

Add Korean + English strings. Add the dialog to `ui/src/pages/DesignGuide.tsx`
under a new "AI Prompt Generator" subsection (project convention, per
`CLAUDE.md` §9 / design-guide skill).

---

## Function / API Signatures

### HTTP endpoint

```
POST /api/companies/:companyId/agents/draft-prompt-template
Content-Type: application/json

Request body: DraftPromptTemplateRequest
Response: text/event-stream
  data: {"kind":"delta","delta":"..."}
  data: {"kind":"delta","delta":"..."}
  data: {"kind":"done"}
  (or on error)
  data: {"kind":"error","message":"..."}
```

### ServerAdapterModule

```ts
interface ServerAdapterModule {
  type: string;
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  draftText?: (ctx: AdapterDraftTextContext) => AsyncIterable<string>;
  // ... (existing members)
}

interface AdapterDraftTextContext {
  adapterConfig: Record<string, unknown>;
  messages: { role: "system" | "user"; content: string }[];
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}
```

### UI hook

```ts
type PromptTemplateStreamStatus =
  | "idle" | "streaming" | "done" | "error" | "canceled";

function usePromptTemplateStream(companyId: string | null): {
  status: PromptTemplateStreamStatus;
  preview: string;
  error: string | null;
  start: (body: DraftPromptTemplateRequest) => void;
  cancel: () => void;
  reset: () => void;
};
```

---

## Constraints

1. **No new API endpoints other than the one SSE route.** Reuse existing
   company / agent fetch patterns for context.
2. **`draftText` on each adapter MUST honor `ctx.signal`.** On abort, HTTP
   adapters abort `fetch`; CLI adapters send SIGTERM then SIGKILL after 2s.
3. **CLI adapter spawn must verify command resolvability first** — reuse
   `ensureCommandResolvable()` so missing CLIs fail fast with a clear message,
   not an opaque ENOENT.
4. **No token cost accounting for drafts.** This is a meta-operation on
   behalf of the board user, not an agent run — skip activity_log and budget
   policy.
5. **No persistence of drafts.** Preview exists only in UI state; no DB row.
6. **Existing `chatCompletion()` helper in `openai-compat-local/src/client.ts`
   must not be duplicated.** The new `streamChatCompletionSSE()` helper lives
   in `adapter-utils` and is imported where needed.
7. **Meta-prompt output language follows the user's hint language.**
   `buildMetaPrompt()` passes the hint through verbatim; the LLM infers
   language. System message explicitly instructs "match the user's language".
8. **Generated template must pass the existing "replay on every heartbeat"
   warning criteria** — the system prompt enforces compactness and use of
   `{{ context.* }}` / `{{ run.* }}` variables. No automated validation; user
   reviews in the preview pane.
9. **Button visibility** — shown only in create mode for `isLocal`-family
   adapters (all 10 listed above). Not shown in edit mode; not shown for
   `process` / `http` adapter types.
10. **i18n coverage** — every new user-facing string has both Korean and
    English entries.

---

## Decisions

- **LLM source = adapter currently selected in form.**
  Rejected alternatives:
  - "Company-level generator LLM config" — adds new DB column and setup UX;
    not warranted for a secondary feature.
  - "Reuse one of the existing agents' adapters" — couples creation UX to
    existence of another agent; awkward for the first-agent case.
  - "Env-based OpenAI/Anthropic key" — pushes external config burden onto
    users and forks from the per-agent adapter model.

- **Streaming via SSE, not WebSocket.**
  SSE is one-way (server → client), which matches the flow. No existing
  WebSocket channel is suitable (the existing `LiveUpdatesProvider` is
  domain-scoped to entity events, not ad-hoc RPCs).

- **Per-adapter `draftText()` rather than a single shared implementation.**
  CLI adapters differ in invocation syntax (flags, stdin vs arg, output
  format). A shared function would become a dispatch table anyway; putting
  logic next to each adapter keeps cohesion with `execute()` and
  `testEnvironment()`.

- **Modal over inline panel.**
  Inline would grow the form noticeably; modal keeps the default form
  compact and provides a clear "preview → accept" gate.

- **Non-streaming helper (`chatCompletion`) kept as-is.**
  Adding `stream: true` would change call sites that expect a fully-buffered
  response. New `streamChatCompletionSSE()` is separate.

- **No automated validation of generated output.**
  The LLM may produce templates that violate the compactness constraint; the
  user reviews in the preview pane. Automated enforcement would require
  parsing and is out of scope.

- **No activity log entry.**
  Drafting is a UI-assist operation, not an agent action. Consistent with
  treating this as a board-side meta-call.
