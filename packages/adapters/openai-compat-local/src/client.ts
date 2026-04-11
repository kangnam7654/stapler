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
