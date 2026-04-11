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

export async function listModels(): Promise<AdapterModel[]> {
  try {
    const names = await listRemoteModels({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
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

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "ollama",
    });
    if (names.length > 0) {
      return {
        adapterType: ctx.adapterType,
        status: "pass",
        checks: [
          {
            code: "ollama_reachable",
            level: "info",
            message: `Ollama reachable at ${baseUrl}; ${names.length} model(s) installed.`,
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
          code: "ollama_no_models",
          level: "warn",
          message: `Ollama reachable at ${baseUrl} but no models are installed. Run: ollama pull llama3.1`,
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
          code: "ollama_unreachable",
          level: "error",
          message: `Ollama server not running at ${baseUrl}: ${message}`,
        },
      ],
      testedAt: new Date().toISOString(),
    };
  }
}
