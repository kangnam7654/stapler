import { afterEach, describe, expect, it, vi } from "vitest";
import { paperclipRequestTool } from "./paperclip-request.js";
import type { ToolContext } from "../types.js";

describe("paperclip_request tool", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("logs a compact request and result line", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const logs: string[] = [];
    const ctx: ToolContext = {
      cwd: process.cwd(),
      env: { PAPERCLIP_API_URL: "http://127.0.0.1:3100" },
      onLog: async (_stream, chunk) => {
        logs.push(chunk);
      },
    };

    const result = await paperclipRequestTool.execute({
      method: "GET",
      path: "/api/companies/co-1/issues?assigneeAgentId=agent-1&status=in_progress",
    }, ctx);

    expect(result).toBe("[]");
    expect(logs).toEqual([
      "[paperclip_request] GET http://127.0.0.1:3100/api/companies/co-1/issues?assigneeAgentId=agent-1&status=in_progress\n",
      "[paperclip_request result] GET http://127.0.0.1:3100/api/companies/co-1/issues?assigneeAgentId=agent-1&status=in_progress -> 200 []\n",
    ]);
  });
});
