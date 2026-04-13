import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("lm-studio draftText", () => {
  it("streams via /v1/chat/completions", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"choices":[{"delta":{"content":"ok"}}]}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const chunks: string[] = [];
      for await (const c of draftText({
        config: {
          baseUrl: `http://127.0.0.1:${port}`,
          model: "local-model",
        },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("ok");
    } finally {
      server.close();
    }
  });

  it("throws when model is missing", async () => {
    const gen = draftText({
      config: { baseUrl: "http://127.0.0.1:1" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow(/model is required/);
  });
});
