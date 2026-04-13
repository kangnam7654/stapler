import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
  const command = asString(config.command, "gemini").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for gemini_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).geminiArgsPrefix,
  )
    ? ((config as { geminiArgsPrefix?: string[] }).geminiArgsPrefix ?? [])
    : ["-p", prompt];
  if (model && !args.includes("--model")) args.push("--model", model);

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
