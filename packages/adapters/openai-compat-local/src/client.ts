// src/client.ts
import type { ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ToolCall } from "./types.js";

export interface ChatCompletionArgs {
  baseUrl: string;
  request: ChatCompletionRequest;
  timeoutMs: number;
  apiKey?: string;
}

export interface ChatCompletionStreamArgs extends ChatCompletionArgs {
  onDelta?: (delta: string) => void | Promise<void>;
}

interface StreamChoiceDelta {
  role?: ChatMessage["role"];
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: ToolCall["type"];
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface StreamChunk {
  choices?: Array<{
    index?: number;
    delta?: StreamChoiceDelta;
    finish_reason?: string | null;
  }>;
  usage?: ChatCompletionResponse["usage"];
}

interface ToolCallAccumulator {
  id?: string;
  type?: ToolCall["type"];
  function: {
    name: string;
    arguments: string;
  };
}

async function readStreamResponse(
  response: Response,
  onDelta?: (delta: string) => void | Promise<void>,
): Promise<ChatCompletionResponse> {
  if (!response.body) {
    throw new Error("chat completion stream response had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantRole: ChatMessage["role"] = "assistant";
  let content = "";
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let finishReason: string | null = null;
  let usage: ChatCompletionResponse["usage"] | undefined;

  const flushPayload = async (payload: string) => {
    if (!payload) return;
    if (payload === "[DONE]") return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(payload) as StreamChunk;
    } catch {
      return;
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      if (chunk.usage) usage = chunk.usage;
      return;
    }

    const delta = choice.delta;
    if (delta) {
      if (delta.role) assistantRole = delta.role;
      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        if (onDelta) await onDelta(delta.content);
      }
      for (const toolCall of delta.tool_calls ?? []) {
        const index = toolCall.index ?? 0;
        const current = toolCalls.get(index) ?? {
          function: { name: "", arguments: "" },
        };
        if (toolCall.id) current.id = toolCall.id;
        if (toolCall.type) current.type = toolCall.type;
        if (toolCall.function?.name) current.function.name += toolCall.function.name;
        if (toolCall.function?.arguments) current.function.arguments += toolCall.function.arguments;
        toolCalls.set(index, current);
      }
    }

    if (choice.finish_reason !== undefined) {
      finishReason = choice.finish_reason;
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) break;
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const lines = rawEvent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        await flushPayload(payload);
      }
    }
  }

  if (buffer.trim().length > 0) {
    for (const line of buffer.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      await flushPayload(payload);
    }
  }

  const orderedToolCalls = [...toolCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call], index) => ({
      id: call.id ?? `call_${index}`,
      type: call.type ?? "function",
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    }));

  return {
    choices: [
      {
        index: 0,
        message: {
          role: assistantRole,
          content: content.length > 0 ? content : null,
          ...(orderedToolCalls.length > 0 ? { tool_calls: orderedToolCalls } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
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

export async function chatCompletionStream(args: ChatCompletionStreamArgs): Promise<ChatCompletionResponse> {
  const { baseUrl, request, timeoutMs, apiKey, onDelta } = args;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (apiKey && apiKey.length > 0) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `chat completion stream failed: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      );
    }

    return await readStreamResponse(response, onDelta);
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

/**
 * Fetches available models from an OpenAI-compatible or Ollama-style server.
 * Throws on network errors (ECONNREFUSED, timeout, DNS failure) so callers can
 * distinguish "server unreachable" from "server reachable but no models".
 * Returns `[]` only when the server responded with a non-ok status or an empty list.
 */
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
  } finally {
    clearTimeout(timer);
  }
}
