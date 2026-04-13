import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("ollama draftText", () => {
  it("streams via /v1/chat/completions with stream=true", async () => {
    const received: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c.toString()));
      req.on("end", () => {
        received.push(body);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: {"choices":[{"delta":{"content":"he"}}]}\n\n`);
        res.write(`data: {"choices":[{"delta":{"content":"llo"}}]}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const chunks: string[] = [];
      for await (const c of draftText({
        config: { baseUrl: `http://127.0.0.1:${port}`, model: "llama3" },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("hello");
      expect(received[0]).toContain('"stream":true');
      expect(received[0]).toContain('"model":"llama3"');
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
