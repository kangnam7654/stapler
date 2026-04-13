import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils/draft-streaming";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
  const command = asString(config.command, "opencode").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for opencode_local draftText");
  if (!model) throw new Error("model is required (provider/model-id format)");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const prefixArr = asStringArray(config.opencodeArgsPrefix);
  const usingArgsPrefix = prefixArr.length > 0;
  // opencode takes prompt as positional arg (not stdin)
  const args: string[] = usingArgsPrefix ? prefixArr : ["run", "--model", model, prompt];

  yield* spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });
}
