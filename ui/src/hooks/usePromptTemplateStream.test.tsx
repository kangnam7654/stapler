// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePromptTemplateStream } from "./usePromptTemplateStream.js";
import * as apiModule from "../api/draftPromptTemplate.js";

describe("usePromptTemplateStream", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("transitions idle → streaming → done and accumulates preview", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "hello " };
      yield { kind: "delta" as const, delta: "world" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    expect(result.current.status).toBe("idle");

    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.preview).toBe("hello world");
    expect(result.current.error).toBeNull();
  });

  it("transitions to error state on stream error", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "partial" };
      yield { kind: "error" as const, message: "boom" };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("boom");
    expect(result.current.preview).toBe("partial");
  });

  it("cancel() aborts the stream", async () => {
    async function* mockStream(signal: AbortSignal) {
      for (let i = 0; i < 100; i++) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise((r) => setTimeout(r, 10));
        yield { kind: "delta" as const, delta: "." };
      }
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockImplementation(
      (_c, _b, signal) => mockStream(signal),
    );

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("streaming"));

    act(() => {
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.status).toBe("canceled"));
  });

  it("reset() returns to idle and clears preview", async () => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "x" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());

    const { result } = renderHook(() => usePromptTemplateStream("c-1"));
    act(() => {
      result.current.start({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
      });
    });
    await waitFor(() => expect(result.current.status).toBe("done"));

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.preview).toBe("");
    expect(result.current.error).toBeNull();
  });
});
