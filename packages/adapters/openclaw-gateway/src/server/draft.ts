import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { streamChatCompletionSSE } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
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
