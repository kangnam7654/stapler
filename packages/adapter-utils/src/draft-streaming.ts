import { spawn } from "node:child_process";

export interface StreamChatCompletionSSEArgs {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  timeoutMs: number;
  signal: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export async function* streamChatCompletionSSE(
  args: StreamChatCompletionSSEArgs,
): AsyncIterable<string> {
  const url = `${args.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (args.apiKey) headers.Authorization = `Bearer ${args.apiKey}`;

  const timeoutSignal = AbortSignal.timeout(args.timeoutMs);
  const effectiveSignal = AbortSignal.any([args.signal, timeoutSignal]);

  const body = JSON.stringify({
    model: args.model,
    messages: args.messages,
    stream: true,
    ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
    ...(args.maxTokens !== undefined ? { max_tokens: args.maxTokens } : {}),
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: effectiveSignal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `chat completion stream failed: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (effectiveSignal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) yield delta;
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

export interface SpawnAndStreamStdoutArgs {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdin?: string;
  signal: AbortSignal;
}

export async function* spawnAndStreamStdout(
  args: SpawnAndStreamStdoutArgs,
): AsyncIterable<string> {
  const child = spawn(args.command, args.args, {
    env: { ...process.env, ...(args.env ?? {}) },
    cwd: args.cwd,
    stdio: [args.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
  });

  let exited = false;
  child.once("close", () => {
    exited = true;
  });

  let stderr = "";
  const childStderr = child.stderr;
  const childStdout = child.stdout;
  if (!childStderr || !childStdout) {
    throw new Error(
      `${args.command}: failed to open stdio pipes for child process`,
    );
  }
  childStderr.setEncoding("utf8");
  childStderr.on("data", (d: string) => {
    stderr += d;
  });

  const onAbort = () => {
    child.kill("SIGTERM");
    const killTimer = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 2000);
    killTimer.unref();
  };
  args.signal.addEventListener("abort", onAbort);

  if (args.stdin !== undefined && child.stdin) {
    child.stdin.write(args.stdin);
    child.stdin.end();
  }

  childStdout.setEncoding("utf8");
  try {
    for await (const chunk of childStdout as AsyncIterable<string>) {
      if (args.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      yield chunk;
    }
    const code: number | null = await new Promise((resolve) => {
      child.once("close", (c) => resolve(c));
    });
    if (code !== 0 && !args.signal.aborted) {
      // stderr may contain paths, argv, or env fragments; limit surface area
      const stderrSnippet = stderr ? `: ${stderr.slice(0, 200)}` : "";
      throw new Error(
        `${args.command} exited with code ${code ?? "?"}${stderrSnippet}`,
      );
    }
    if (args.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  } finally {
    args.signal.removeEventListener("abort", onAbort);
    if (!exited && !child.killed) child.kill("SIGTERM");
  }
}
