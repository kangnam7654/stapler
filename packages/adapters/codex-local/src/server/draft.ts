import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, asStringArray, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface CodexEvent {
  type?: string;
  content?: string;
  delta?: string;
  text?: string;
}

async function* parseCodexNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  function* emit(line: string): IterableIterator<string> {
    try {
      const evt = JSON.parse(line) as CodexEvent;
      if (evt.type === "agent_message" || evt.type === "message_delta") {
        const text = evt.content ?? evt.delta ?? evt.text ?? "";
        if (typeof text === "string" && text.length > 0) yield text;
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
  const command = asString(config.command, "codex").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for codex_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const prefixArr = asStringArray(config.codexArgsPrefix);
  const usingArgsPrefix = prefixArr.length > 0;
  const args: string[] = usingArgsPrefix ? prefixArr : ["exec", "--json"];
  if (!usingArgsPrefix) {
    if (model && !args.includes("--model")) args.push("--model", model);
    args.push(prompt);
  }

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });

  yield* parseCodexNdjson(stdoutStream);
}
