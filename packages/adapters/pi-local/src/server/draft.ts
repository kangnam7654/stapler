import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
  const command = asString(config.command, "pi").trim();
  if (!command) throw new Error("command is required for pi_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const prefixArr = asStringArray(config.piArgsPrefix);
  const usingArgsPrefix = prefixArr.length > 0;
  const args: string[] = usingArgsPrefix ? prefixArr : ["-p", prompt];

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
