// server/src/__tests__/lm-studio-local-adapter.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { testEnvironment, listModels, execute } from "@paperclipai/adapter-lm-studio-local/server";

describe("lm_studio_local testEnvironment", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns 'pass' when LM Studio responds with a model", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "mistral-7b-instruct" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "lm_studio_local",
      config: { baseUrl: "http://localhost:1234" },
    });
    expect(result.status).toBe("pass");
  });

  it("returns 'fail' when LM Studio is unreachable", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "lm_studio_local",
      config: { baseUrl: "http://localhost:1234" },
    });
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.message?.toLowerCase().includes("lm studio"))).toBe(true);
  });
});

describe("lm_studio_local listModels", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns discovered models from /v1/models", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const models = await listModels();
    expect(models.map((m) => m.id)).toEqual(["model-a", "model-b"]);
  });
});

describe("lm_studio_local execute (mocked)", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("completes a single turn and returns summary", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: "- ok" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await execute({
      runId: "run-2",
      agent: { id: "a", companyId: "c", name: "CEO", adapterType: "lm_studio_local", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { baseUrl: "http://localhost:1234", model: "any" },
      context: {},
      onLog: async () => {},
      onMeta: async () => {},
      onSpawn: async () => {},
      authToken: undefined,
    });
    expect(result.provider).toBe("lm_studio");
    expect(result.costUsd).toBe(0);
    expect(result.sessionParams).toEqual(expect.objectContaining({ summary: "- ok" }));
  });
});
