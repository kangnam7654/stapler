import type { AdapterDraftTextContext } from "@paperclipai/adapter-utils";
import { spawnAndStreamStdout } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

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
  for await (const chunk of source) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
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
  }
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

  const args: string[] = Array.isArray(
    (config as Record<string, unknown>).codexArgsPrefix,
  )
    ? ((config as { codexArgsPrefix?: string[] }).codexArgsPrefix ?? [])
    : ["exec", "--json"];
  if (model && args[0] === "exec" && !args.includes("--model")) {
    args.push("--model", model);
  }
  // Prompt goes at the end as positional arg
  args.push(prompt);

  const stdoutStream = spawnAndStreamStdout({
    command,
    args,
    env: {},
    signal: ctx.signal,
  });

  yield* parseCodexNdjson(stdoutStream);
}
