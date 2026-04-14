// src/summarize.ts
import type { ChatMessage } from "./types.js";
import { chatCompletion } from "./client.js";

export interface SummarizeArgs {
  baseUrl: string;
  model: string;
  apiKey?: string;
  messages: ChatMessage[];
  timeoutMs: number;
}

const SUMMARY_INSTRUCTION =
  "Summarize what you accomplished in this session in 3-5 bullet points. Be concise. This will be your context note for the next session. Focus on: tasks touched, decisions made, open questions.";

export async function summarizeSession(args: SummarizeArgs): Promise<string | null> {
  const { baseUrl, model, apiKey, messages, timeoutMs } = args;
  if (messages.length === 0) return null;

  try {
    const response = await chatCompletion({
      baseUrl,
      apiKey,
      request: {
        model,
        messages: [...messages, { role: "user", content: SUMMARY_INSTRUCTION }],
      },
      timeoutMs,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) return null;
    return content.trim();
  } catch {
    return null;
  }
}
