// server/src/__tests__/ollama-local-adapter.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { testEnvironment, listModels, execute } from "@paperclipai/adapter-ollama-local/server";

describe("ollama_local testEnvironment", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns 'pass' when ollama responds with model list", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ models: [{ name: "llama3.1:latest" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ response: "hello", done: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: { baseUrl: "http://localhost:11434" },
    });
    expect(result.status).toBe("pass");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(mockFetch.mock.calls[1]?.[1]?.body).toContain("\"model\":\"llama3.1:latest\"");
  });

  it("returns 'fail' with descriptive message when server is not reachable", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: { baseUrl: "http://localhost:11434" },
    });
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.message?.toLowerCase().includes("ollama"))).toBe(true);
  });
});

describe("ollama_local listModels", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns discovered models from /api/tags", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ name: "llama3.1:8b" }, { name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const models = await listModels();
    expect(models.map((m) => m.id)).toEqual(["llama3.1:8b", "qwen2.5:7b"]);
  });

  it("returns [] when server is down", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const models = await listModels();
    expect(models).toEqual([]);
  });
});

describe("ollama_local execute end-to-end (mocked HTTP)", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("runs a single-turn conversation and returns summary in sessionParams", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "did nothing" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "- did nothing" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await execute({
      runId: "run-1",
      agent: { id: "agent-1", companyId: "co-1", name: "CEO", adapterType: "ollama_local", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { baseUrl: "http://localhost:11434", model: "llama3.1", cwd: "/tmp" },
      context: {},
      onLog: async () => {},
      onMeta: async () => {},
      onSpawn: async () => {},
      authToken: undefined,
    });
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.provider).toBe("ollama");
    expect(result.billingType).toBe("local");
    expect(result.sessionParams).toEqual(expect.objectContaining({ summary: expect.stringContaining("did nothing") }));
  });
});
