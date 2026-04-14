// src/server/index.ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterModel,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { listRemoteModels } from "@paperclipai/adapter-openai-compat-local";
import { DEFAULT_OLLAMA_BASE_URL } from "../index.js";

export { execute } from "./execute.js";
export { draftText } from "./draft.js";

export async function listModels(baseUrl?: string): Promise<AdapterModel[]> {
  try {
    const names = await listRemoteModels({
      baseUrl: baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      timeoutMs: 3000,
      style: "ollama",
    });
    return names.map((name) => ({ id: name, label: name }));
  } catch {
    return [];
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseObject(ctx.config);
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const modelId = asString(config.model, "").trim();

  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let serverReachable = false;

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "ollama",
    });
    serverReachable = true;
    if (names.length > 0) {
      checks.push({
        code: "ollama_reachable",
        level: "info",
        message: `Ollama reachable at ${baseUrl}; ${names.length} model(s) installed.`,
      });
    } else {
      checks.push({
        code: "ollama_no_models",
        level: "warn",
        message: `Ollama reachable at ${baseUrl} but no models are installed. Run: ollama pull llama3.1`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "ollama_unreachable",
      level: "error",
      message: `Ollama server not running at ${baseUrl}: ${message}`,
    });
  }

  // Model hello probe — only if server is reachable and model is specified
  if (serverReachable && modelId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt: "Respond with hello.",
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        checks.push({
          code: "ollama_model_probe_passed",
          level: "info",
          message: `Model '${modelId}' responded successfully.`,
        });
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          code: "ollama_model_probe_failed",
          level: "warn",
          message: `Model '${modelId}' probe failed (HTTP ${res.status}).`,
          detail: body.slice(0, 240) || undefined,
          hint: `Run: ollama pull ${modelId}`,
        });
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.name === "AbortError";
      checks.push({
        code: isTimeout
          ? "ollama_model_probe_timed_out"
          : "ollama_model_probe_failed",
        level: "warn",
        message: isTimeout
          ? `Model '${modelId}' probe timed out (30s).`
          : `Model '${modelId}' probe failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: `Verify the model is pulled: ollama pull ${modelId}`,
      });
    }
  }

  const status = checks.some((c) => c.level === "error")
    ? "fail"
    : checks.some((c) => c.level === "warn")
      ? "warn"
      : "pass";

  return {
    adapterType: ctx.adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
