import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import type { AdapterDetectionResult } from "@paperclipai/shared";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

// Helper: mock execFile for multiple CLIs
function mockMultipleWhich(
  results: Record<string, { found: boolean; version?: string }>,
) {
  mockedExecFile.mockImplementation(((
    cmd: string,
    args: string[],
    _opts: unknown,
    cb?: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    if (cmd === "which" && cb) {
      const cliName = args[0];
      const r = results[cliName];
      if (r?.found) {
        cb(null, `/usr/local/bin/${cliName}\n`, "");
      } else {
        cb(new Error(`not found: ${cliName}`), "", "");
      }
      return;
    }
    if (args[0] === "--version" && cb) {
      const r = results[cmd];
      if (r?.version) {
        cb(null, r.version, "");
      } else {
        cb(new Error("no version"), "", "");
      }
      return;
    }
    if (cb) cb(new Error("not found"), "", "");
  }) as unknown as typeof execFile);
}

describe("detectInstalledAdapters", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Lazy import to ensure mocks are in place
  async function getDetect() {
    const mod = await import("../services/adapter-detection.js");
    return mod.detectInstalledAdapters;
  }

  it("returns empty when nothing is installed", async () => {
    // All CLI checks fail
    mockedExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (cb) cb(new Error("not found"), "", "");
    }) as unknown as typeof execFile);

    // All HTTP checks fail
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const detect = await getDetect();
    const result: AdapterDetectionResult = await detect();
    expect(result.detected).toEqual([]);
    expect(result.recommended).toBeNull();
  });

  it("detects claude CLI when installed", async () => {
    mockMultipleWhich({
      claude: { found: true, version: "1.0.0" },
      codex: { found: false },
      gemini: { found: false },
      cursor: { found: false },
    });

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const detect = await getDetect();
    const result = await detect();

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].type).toBe("claude_local");
    expect(result.detected[0].name).toBe("Claude Code");
    expect(result.detected[0].defaultModel).toBe("claude-sonnet-4-20250514");
    expect(result.detected[0].connectionInfo.command).toBe("claude");
  });

  it("detects Ollama when server is reachable", async () => {
    // All CLI checks fail
    mockedExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (cb) cb(new Error("not found"), "", "");
    }) as unknown as typeof execFile);

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("11434")) {
        return Promise.resolve(
          new Response("Ollama is running", { status: 200 }),
        );
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const detect = await getDetect();
    const result = await detect();

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].type).toBe("ollama_local");
    expect(result.detected[0].name).toBe("Ollama");
    expect(result.detected[0].defaultModel).toBe("llama3.1");
    expect(result.detected[0].connectionInfo.baseUrl).toBe(
      "http://localhost:11434",
    );
  });

  it("recommends highest priority adapter when multiple detected", async () => {
    // claude and codex both installed
    mockMultipleWhich({
      claude: { found: true, version: "1.0.0" },
      codex: { found: true, version: "0.1.0" },
      gemini: { found: false },
      cursor: { found: false },
    });

    // Ollama reachable
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("11434")) {
        return Promise.resolve(
          new Response("Ollama is running", { status: 200 }),
        );
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const detect = await getDetect();
    const result = await detect();

    // Should detect all three
    expect(result.detected.length).toBe(3);

    // Should be sorted by priority: claude_local > codex_local > ollama_local
    expect(result.detected[0].type).toBe("claude_local");
    expect(result.detected[1].type).toBe("codex_local");
    expect(result.detected[2].type).toBe("ollama_local");

    // Recommended should be highest priority = claude_local
    expect(result.recommended).not.toBeNull();
    expect(result.recommended!.type).toBe("claude_local");
  });

  it("detects LM Studio when server is reachable", async () => {
    // All CLI checks fail
    mockedExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (cb) cb(new Error("not found"), "", "");
    }) as unknown as typeof execFile);

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("1234")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const detect = await getDetect();
    const result = await detect();

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].type).toBe("lm_studio_local");
    expect(result.detected[0].name).toBe("LM Studio");
    expect(result.detected[0].defaultModel).toBe("default");
    expect(result.detected[0].connectionInfo.baseUrl).toBe(
      "http://localhost:1234",
    );
  });

  it("captures version for CLI adapters when available", async () => {
    mockMultipleWhich({
      claude: { found: true, version: "claude 2.3.1" },
      codex: { found: false },
      gemini: { found: false },
      cursor: { found: false },
    });

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const detect = await getDetect();
    const result = await detect();

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].version).toBe("claude 2.3.1");
  });
});
