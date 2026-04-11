// server/src/__tests__/openai-compat-summarize.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { summarizeSession } from "@paperclipai/adapter-openai-compat-local/summarize";

describe("summarizeSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns model summary text", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "- checked out task X\n- posted comment" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [
        { role: "user", content: "do stuff" },
        { role: "assistant", content: "did stuff" },
      ],
      timeoutMs: 5000,
    });

    expect(summary).toMatch(/checked out task X/);
  });

  it("returns null when request fails", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("boom", { status: 500 }));

    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [],
      timeoutMs: 5000,
    });

    expect(summary).toBeNull();
  });

  it("returns null on empty messages", async () => {
    const summary = await summarizeSession({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [],
      timeoutMs: 5000,
    });
    expect(summary).toBeNull();
  });
});
