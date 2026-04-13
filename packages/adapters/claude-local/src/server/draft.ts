import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

interface ClaudeStreamEvent {
  type?: string;
  message?: { content?: { type?: string; text?: string }[] };
}

async function* parseClaudeNdjson(
  source: AsyncIterable<string>,
): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as ClaudeStreamEvent;
        if (evt.type === "assistant" && evt.message?.content) {
          for (const part of evt.message.content) {
            if (part.type === "text" && typeof part.text === "string") {
              yield part.text;
            }
          }
        }
      } catch {
        // ignore non-JSON noise
      }
    }
  }
}

export async function* draftText(
  ctx: AdapterDraftTextContext,
): AsyncIterable<string> {
  const config = parseObject(ctx.config);
  const command = asString(config.command, "").trim();
  const model = asString(config.model, "").trim();
  if (!command) throw new Error("command is required for claude_local draftText");

  const prompt = ctx.messages
    .map((m) => `[${m.role}]\n${m.content}`)
    .join("\n\n");

  const args: string[] = [
    ...(Array.isArray((config as Record<string, unknown>).claudeArgsPrefix)
      ? ((config as { claudeArgsPrefix?: string[] }).claudeArgsPrefix ?? [])
      : ["--print", "--output-format", "stream-json"]),
  ];
  if (model && !args.includes("--model")) args.push("--model", model);

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    stdin: prompt,
    signal: ctx.signal,
  });

  yield* parseClaudeNdjson(stdoutStream);
}
