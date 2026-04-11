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

Core fields:
- baseUrl (string, optional): Ollama server URL. Defaults to http://localhost:11434
- model (string, optional): Ollama model id. Defaults to llama3.1
- cwd (string, optional): working directory for bash/file tools
- systemPrompt (string, optional): system message prepended to every run
- promptTemplate (string, optional): user prompt template (supports {{agent.*}} fields)
- enabledTools (string[], optional): subset of ["paperclip_request","bash","read_file","write_file","list_dir"]. Default: all
- env (object, optional): KEY=VALUE env vars passed to shell tools

Operational fields:
- timeoutSec (number, optional): run timeout (default 300)

Notes:
- The adapter implements its own tool-use loop; the Ollama model must support tool calling.
- Costs are always reported as zero (local execution).
- Sessions are continued via a short auto-generated summary stored in sessionParams.summary.
`;
