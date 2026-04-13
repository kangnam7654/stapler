import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface CursorEvent {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
}

async function* parseCursorNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  function* emit(line: string): IterableIterator<string> {
    try {
      const evt = JSON.parse(line) as CursorEvent;
      if (evt.type === "assistant" && evt.message?.content) {
        for (const part of evt.message.content) {
          if (part.type === "text" && typeof part.text === "string") {
            yield part.text;
          }
        }
      }
    } catch {
      // ignore
    }
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
  const command = asString(config.command, "cursor-agent").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for cursor_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const prefixArr = asStringArray(config.cursorArgsPrefix);
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

  yield* parseCursorNdjson(stdoutStream);
}
