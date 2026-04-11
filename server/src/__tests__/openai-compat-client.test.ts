// server/src/__tests__/openai-compat-client.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion } from "@paperclipai/adapter-openai-compat-local/client";

describe("openai-compat-local client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to /v1/chat/completions with correct body and returns parsed response", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await chatCompletion({
      baseUrl: "http://localhost:11434",
      request: {
        model: "llama3.1",
        messages: [{ role: "user", content: "hello" }],
      },
      timeoutMs: 5000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    expect(result.choices[0].message.content).toBe("hi");
    expect(result.usage?.prompt_tokens).toBe(5);
  });

  it("throws with HTTP status when response is not ok", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response("model not found", { status: 404 }),
    );

    await expect(
      chatCompletion({
        baseUrl: "http://localhost:11434",
        request: { model: "ghost", messages: [] },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/404/);
  });

  it("aborts request when timeout fires", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      chatCompletion({
        baseUrl: "http://localhost:11434",
        request: { model: "slow", messages: [] },
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });
});
