import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamDraftPromptTemplate } from "./draftPromptTemplate.js";

describe("streamDraftPromptTemplate", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses SSE data lines into events", async () => {
    const sse = [
      `data: {"kind":"delta","delta":"foo"}`,
      ``,
      `data: {"kind":"delta","delta":"bar"}`,
      ``,
      `data: {"kind":"done"}`,
      ``,
    ].join("\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    ) as typeof fetch;

    const events: unknown[] = [];
    for await (const e of streamDraftPromptTemplate(
      "company-1",
      {
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      },
      new AbortController().signal,
    )) {
      events.push(e);
    }

    expect(events).toEqual([
      { kind: "delta", delta: "foo" },
      { kind: "delta", delta: "bar" },
      { kind: "done" },
    ]);
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("bad", { status: 400 }),
    ) as typeof fetch;

    const gen = streamDraftPromptTemplate(
      "c",
      { adapterType: "ollama_local", adapterConfig: {}, name: "x", role: "cto" },
      new AbortController().signal,
    );
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow(/HTTP 400/);
  });
});
