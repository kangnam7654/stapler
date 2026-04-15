import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletionStream } from "./client.js";
import { runAgentLoop } from "./loop.js";

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
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

describe("chatCompletionStream", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("assembles streamed content and tool calls", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeSseResponse([
        { choices: [{ delta: { role: "assistant" } }] },
        { choices: [{ delta: { content: "Hel" } }] },
        { choices: [{ delta: { content: "lo" } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "paperclip_request", arguments: '{"method":"' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: 'GET","path":"/api/issues"}' },
                  },
                ],
              },
            },
          ],
        },
        { choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } },
      ]),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const deltas: string[] = [];
    const response = await chatCompletionStream({
      baseUrl: "http://localhost:1234",
      apiKey: "token",
      timeoutMs: 1000,
      request: {
        model: "local-model",
        messages: [{ role: "user", content: "hi" }],
      },
      onDelta: async (delta) => {
        deltas.push(delta);
      },
    });

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(response.choices[0]?.message.content).toBe("Hello");
    expect(response.choices[0]?.message.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "paperclip_request",
          arguments: '{"method":"GET","path":"/api/issues"}',
        },
      },
    ]);
    expect(response.usage).toEqual({
      prompt_tokens: 5,
      completion_tokens: 7,
      total_tokens: 12,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect((init as RequestInit | undefined)?.method).toBe("POST");
    expect((init as RequestInit | undefined)?.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: "Bearer token",
    });
    expect(JSON.parse(String((init as RequestInit | undefined)?.body))).toMatchObject({
      model: "local-model",
      stream: true,
    });
  });
});

describe("runAgentLoop", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("streams model output through onLog before finishing", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeSseResponse([
        { choices: [{ delta: { content: "Hel" } }] },
        { choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] },
      ]),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const logs: string[] = [];
    const result = await runAgentLoop({
      baseUrl: "http://localhost:1234",
      model: "local-model",
      timeoutMs: 1000,
      env: {},
      cwd: process.cwd(),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onLog: async (_stream, chunk) => {
        logs.push(chunk);
      },
    });

    expect(result.finishReason).toBe("done");
    expect(logs).toEqual(["[model] ", "Hel", "lo", "\n", "[loop] finish_reason=stop — no tool_calls returned (tokens: in=0 out=0)\n"]);
  });
});
