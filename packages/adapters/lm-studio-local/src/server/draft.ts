import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { streamChatCompletionSSE } from "@paperclipai/adapter-utils/draft-streaming";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../index.js";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
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
