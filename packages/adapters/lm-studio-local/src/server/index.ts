// src/server/index.ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterModel,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { listRemoteModels } from "@paperclipai/adapter-openai-compat-local";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../index.js";

export { execute } from "./execute.js";

export async function listModels(): Promise<AdapterModel[]> {
  try {
    const names = await listRemoteModels({
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      timeoutMs: 3000,
      style: "openai",
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

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "openai",
    });
    if (names.length > 0) {
      return {
        adapterType: ctx.adapterType,
        status: "pass",
        checks: [
          {
            code: "lm_studio_reachable",
            level: "info",
            message: `LM Studio reachable at ${baseUrl}; ${names.length} model(s) loaded.`,
          },
        ],
        testedAt: new Date().toISOString(),
      };
    }
    return {
      adapterType: ctx.adapterType,
      status: "warn",
      checks: [
        {
          code: "lm_studio_no_models",
          level: "warn",
          message: `LM Studio reachable at ${baseUrl} but no models are loaded. Load a model in LM Studio first.`,
        },
      ],
      testedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks: [
        {
          code: "lm_studio_unreachable",
          level: "error",
          message: `LM Studio server not running at ${baseUrl}: ${message}`,
        },
      ],
      testedAt: new Date().toISOString(),
    };
  }
}
