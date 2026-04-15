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
- Your model supports OpenAI-style tool/function calling

Don't use when:
- You need a hosted / cloud model (use claude_local / gemini_local / codex_local)
- Your model does not support tool calls (the agent will not be able to act)

Core fields:
- baseUrl (string, optional): LM Studio server URL. When omitted, the agent inherits the company LM Studio setting.
- lmStudioBaseUrlMode (string, optional): "company" to inherit the company setting, or "custom" to use the agent's own baseUrl.
- model (string, optional): Model id as shown in LM Studio. Defaults to local-model
- cwd (string, optional): working directory for bash/file tools
- systemPrompt (string, optional): system message prepended to every run
- promptTemplate (string, optional): user prompt template (supports {{agent.*}} fields)
- enabledTools (string[], optional): subset of ["paperclip_request","bash","read_file","write_file","list_dir"]. Default: all
- env (object, optional): KEY=VALUE env vars passed to shell tools

Operational fields:
- timeoutSec (number, optional): run timeout (default 300)

Notes:
- The adapter uses LM Studio's OpenAI-compatible /v1/chat/completions endpoint.
- Costs are always reported as zero (local execution).
- Sessions are continued via a short auto-generated summary stored in sessionParams.summary.
`;
