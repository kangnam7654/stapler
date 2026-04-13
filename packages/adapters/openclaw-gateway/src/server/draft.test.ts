import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { draftText } from "./draft.js";

describe("openclaw-gateway draftText", () => {
  it("streams via gateway's OpenAI-compat endpoint", async () => {
    let sawAuth = "";
    const server = createServer((req, res) => {
      sawAuth = req.headers["authorization"] ?? "";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"choices":[{"delta":{"content":"gw"}}]}\n\n`);
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
          apiKey: "secret-token",
          model: "claude-sonnet-4-5",
        },
        messages: [{ role: "user", content: "hi" }],
        signal: new AbortController().signal,
      })) {
        chunks.push(c);
      }
      expect(chunks.join("")).toBe("gw");
      expect(sawAuth).toBe("Bearer secret-token");
    } finally {
      server.close();
    }
  });

  it("throws when baseUrl is missing", async () => {
    const gen = draftText({
      config: { apiKey: "secret", model: "claude-sonnet-4-5" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow(/baseUrl is required/);
  });

  it("throws when model is missing", async () => {
    const gen = draftText({
      config: { baseUrl: "http://127.0.0.1:1", apiKey: "secret" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow(/model is required/);
  });
});
