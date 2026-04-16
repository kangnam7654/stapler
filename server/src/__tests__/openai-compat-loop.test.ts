// server/src/__tests__/openai-compat-loop.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runAgentLoop } from "@paperclipai/adapter-openai-compat-local/loop";
import type { ToolExecutor, ChatMessage } from "@paperclipai/adapter-openai-compat-local/types";

function makeSseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
  chunks.push("data: [DONE]\n\n");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeMockTool(name: string, output: string): ToolExecutor {
  return {
    name,
    definition: {
      type: "function",
      function: {
        name,
        description: `mock ${name}`,
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    execute: vi.fn(async () => output),
  };
}

describe("runAgentLoop", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 'done' when model replies without tool calls", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      makeSseResponse([
        { choices: [{ delta: { role: "assistant" } }] },
        { choices: [{ delta: { content: "ok, I'm done" } }] },
        {
          choices: [{ finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      ]),
    );

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "say hi" }],
      tools: [],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("done");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.messages.at(-1)?.content).toBe("ok, I'm done");
  });

  it("executes tool calls and feeds results back to the model", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        makeSseResponse([
          { choices: [{ delta: { role: "assistant" } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "mock_tool", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [{ finish_reason: "tool_calls" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeSseResponse([
          { choices: [{ delta: { role: "assistant" } }] },
          { choices: [{ delta: { content: "all done" } }] },
          {
            choices: [{ finish_reason: "stop" }],
            usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
          },
        ]),
      );

    const tool = makeMockTool("mock_tool", "mock output");

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "use the tool" }],
      tools: [tool],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(result.finishReason).toBe("done");
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_1", content: "mock output" }),
      ]),
    );
    expect(result.usage.inputTokens).toBe(30);  // accumulated across both calls
    expect(result.usage.outputTokens).toBe(8);
  });

  it("returns 'error' finishReason when HTTP call fails", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("server exploded", { status: 500 }));

    const result = await runAgentLoop({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      messages: [{ role: "user", content: "x" }],
      tools: [],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("error");
    expect(result.errorMessage).toMatch(/500/);
  });

  it("captures tool execution errors and feeds them back to model as tool result", async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(
        makeSseResponse([
          { choices: [{ delta: { role: "assistant" } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "c1",
                      type: "function",
                      function: { name: "broken", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          },
          { choices: [{ finish_reason: "tool_calls" }] },
        ]),
      )
      .mockResolvedValueOnce(
        makeSseResponse([
          { choices: [{ delta: { role: "assistant" } }] },
          { choices: [{ delta: { content: "done" } }] },
          { choices: [{ finish_reason: "stop" }] },
        ]),
      );

    const broken: ToolExecutor = {
      name: "broken",
      definition: {
        type: "function",
        function: {
          name: "broken",
          description: "always throws",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: vi.fn(async () => {
        throw new Error("kaboom");
      }),
    };

    const result = await runAgentLoop({
      baseUrl: "http://x",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      tools: [broken],
      timeoutMs: 5000,
      env: {},
      cwd: "/tmp",
      onLog: async () => {},
    });

    expect(result.finishReason).toBe("done");
    const toolMsg = result.messages.find((m) => m.role === "tool") as ChatMessage | undefined;
    expect(toolMsg?.content).toMatch(/kaboom/);
  });
});
