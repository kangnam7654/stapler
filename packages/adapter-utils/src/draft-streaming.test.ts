import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  streamChatCompletionSSE,
  spawnAndStreamStdout,
} from "./draft-streaming.js";

async function withMockSSE(
  body: string,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe("streamChatCompletionSSE", () => {
  it("yields deltas and stops on [DONE]", async () => {
    const body = [
      `data: {"choices":[{"delta":{"content":"hel"}}]}`,
      `data: {"choices":[{"delta":{"content":"lo"}}]}`,
      `data: [DONE]`,
      ``,
    ].join("\n\n");
    await withMockSSE(body, async (url) => {
      const chunks: string[] = [];
      for await (const c of streamChatCompletionSSE({
        baseUrl: url,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5_000,
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("hello");
    });
  });

  it("throws when aborted", async () => {
    const body = `data: {"choices":[{"delta":{"content":"x"}}]}\n\n`;
    const controller = new AbortController();
    controller.abort();
    await withMockSSE(body, async (url) => {
      const gen = streamChatCompletionSSE({
        baseUrl: url,
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5_000,
        signal: controller.signal,
      });
      await expect(async () => { for await (const _ of gen) {} }).rejects.toThrow();
    });
  });
});

describe("spawnAndStreamStdout", () => {
  it("yields stdout chunks as they arrive", async () => {
    const chunks: string[] = [];
    for await (const chunk of spawnAndStreamStdout({
      command: "node",
      args: ["-e", "process.stdout.write('foo'); process.stdout.write('bar');"],
      env: {},
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("foobar");
  });

  it("honors abort signal via SIGTERM", async () => {
    const controller = new AbortController();
    const gen = spawnAndStreamStdout({
      command: "node",
      args: ["-e", "setInterval(() => process.stdout.write('.'), 50);"],
      env: {},
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow();
  });
});
