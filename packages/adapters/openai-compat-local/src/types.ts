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
  apiKey?: string;
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
