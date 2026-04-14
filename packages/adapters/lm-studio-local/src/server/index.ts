// src/server/index.ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterModel,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { chatCompletion, listRemoteModels } from "@paperclipai/adapter-openai-compat-local";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../index.js";

export { execute } from "./execute.js";
export { draftText } from "./draft.js";

export async function listModels(baseUrl?: string, apiKey?: string): Promise<AdapterModel[]> {
  try {
    const names = await listRemoteModels({
      baseUrl: baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL,
      timeoutMs: 3000,
      style: "openai",
      apiKey,
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
  const baseUrl = asString(config.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);
  const apiKey = asString(config.apiKey, "").trim();
  const modelId = asString(config.model, "").trim();

  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let serverReachable = false;
  let discoveredModels: string[] = [];

  try {
    discoveredModels = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "openai",
      apiKey: apiKey || undefined,
    });
    serverReachable = true;
    if (discoveredModels.length > 0) {
      checks.push({
        code: "lm_studio_reachable",
        level: "info",
        message: `LM Studio reachable at ${baseUrl}; ${discoveredModels.length} model(s) loaded.`,
      });
    } else {
      checks.push({
        code: "lm_studio_no_models",
        level: "warn",
        message: `LM Studio reachable at ${baseUrl} but no models are loaded. Load a model in LM Studio first.`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "lm_studio_unreachable",
      level: "error",
      message: `LM Studio server not running at ${baseUrl}: ${message}`,
    });
  }

  const probeModelId = modelId || discoveredModels[0] || "";
  const usedAutoSelectedModel = !modelId && Boolean(probeModelId);
  const probeTargetLabel = usedAutoSelectedModel ? "Auto-selected model" : "Model";

  // Model hello probe — use the configured model when present, otherwise
  // auto-select the first discovered model so "test connection" proves real inference.
  if (serverReachable && probeModelId) {
    try {
      await chatCompletion({
        baseUrl,
        apiKey: apiKey || undefined,
        timeoutMs: 30_000,
        request: {
          model: probeModelId,
          messages: [{ role: "user", content: "Respond with hello." }],
        },
      });
      checks.push({
        code: usedAutoSelectedModel
          ? "lm_studio_auto_model_probe_passed"
          : "lm_studio_model_probe_passed",
        level: "info",
        message: `${probeTargetLabel} '${probeModelId}' responded successfully.`,
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.name === "AbortError";
      checks.push({
        code: isTimeout
          ? "lm_studio_model_probe_timed_out"
          : "lm_studio_model_probe_failed",
        level: "warn",
        message: isTimeout
          ? `${probeTargetLabel} '${probeModelId}' probe timed out (30s).`
          : `${probeTargetLabel} '${probeModelId}' probe failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify the model is loaded in LM Studio.",
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
