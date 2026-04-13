import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils/draft-streaming";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface ClaudeStreamEvent {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
}

async function* parseClaudeNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  function* emit(line: string): IterableIterator<string> {
    try {
      const evt = JSON.parse(line) as ClaudeStreamEvent;
      if (evt.type === "assistant" && evt.message?.content) {
        for (const part of evt.message.content) {
          if (part.type === "text" && typeof part.text === "string") {
            yield part.text;
          }
        }
      }
    } catch { /* ignore non-JSON noise */ }
  }
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      yield* emit(line);
    }
  }
  const tail = buf.trim();
  if (tail) yield* emit(tail);
}

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
  const rawCommand = config.command;
  // Reject explicit empty string; fall back to "claude" only when command is omitted entirely
  if (typeof rawCommand === "string" && rawCommand.length === 0) {
    throw new Error("command is required for claude_local draftText");
  }
  const command = asString(rawCommand, "claude").trim();
  const model = asString(config.model, "").trim();

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const prefixArr = asStringArray(config.claudeArgsPrefix);
  const usingArgsPrefix = prefixArr.length > 0;
  const args: string[] = usingArgsPrefix
    ? prefixArr
    : ["--print", "--output-format", "stream-json"];
  if (!usingArgsPrefix && model && !args.includes("--model")) {
    args.push("--model", model);
  }

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    stdin: prompt,
    signal: ctx.signal,
  });

  yield* parseClaudeNdjson(stdoutStream);
}
