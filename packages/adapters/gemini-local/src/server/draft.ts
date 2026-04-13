import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils/draft-streaming";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

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

  const prefixArr = asStringArray(config.geminiArgsPrefix);
  const usingArgsPrefix = prefixArr.length > 0;
  const args: string[] = usingArgsPrefix ? prefixArr : ["-p", prompt];
  if (!usingArgsPrefix && model && !args.includes("--model")) {
    args.push("--model", model);
  }

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
