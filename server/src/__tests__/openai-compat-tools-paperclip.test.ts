// server/src/__tests__/openai-compat-tools-paperclip.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { paperclipRequestTool } from "@paperclipai/adapter-openai-compat-local/tools";

describe("paperclip_request tool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const ctxWithEnv = (env: Record<string, string>) => ({
    cwd: "/tmp",
    env,
    onLog: async () => {},
  });

  it("has correct tool definition", () => {
    expect(paperclipRequestTool.definition.function.name).toBe("paperclip_request");
    expect(paperclipRequestTool.definition.function.parameters.required).toContain("method");
    expect(paperclipRequestTool.definition.function.parameters.required).toContain("path");
  });

  it("issues GET request with Authorization header from env", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "agent-1", name: "CEO" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const out = await paperclipRequestTool.execute(
      { method: "GET", path: "/api/agents/me" },
      ctxWithEnv({ PAPERCLIP_API_URL: "https://pc.example", PAPERCLIP_API_KEY: "secret-abc" }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://pc.example/api/agents/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer secret-abc" }),
      }),
    );
    expect(out).toContain("agent-1");
  });

  it("serializes body for POST", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));

    await paperclipRequestTool.execute(
      { method: "POST", path: "/api/issues/abc/comments", body: { body: "hello" } },
      ctxWithEnv({ PAPERCLIP_API_URL: "http://localhost:3100", PAPERCLIP_API_KEY: "k" }),
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ body: "hello" }));
  });

  it("returns non-2xx status in response text", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response('{"error":"not found"}', { status: 404 }));

    const out = await paperclipRequestTool.execute(
      { method: "GET", path: "/api/issues/missing" },
      ctxWithEnv({ PAPERCLIP_API_URL: "http://x", PAPERCLIP_API_KEY: "k" }),
    );

    expect(out).toMatch(/404/);
    expect(out).toMatch(/not found/);
  });

  it("throws when PAPERCLIP_API_URL is missing from env", async () => {
    await expect(
      paperclipRequestTool.execute(
        { method: "GET", path: "/api/health" },
        ctxWithEnv({ PAPERCLIP_API_KEY: "k" }),
      ),
    ).rejects.toThrow(/PAPERCLIP_API_URL/);
  });
});
