// src/ui/build-config.ts
import type { CreateConfigValues, TranscriptEntry } from "@paperclipai/adapter-utils";
import { DEFAULT_LM_STUDIO_BASE_URL, DEFAULT_LM_STUDIO_MODEL } from "../index.js";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = trimmed.slice(eq + 1);
  }
  return env;
}

/**
 * Builds the persisted `adapterConfig` object for a new LM Studio agent.
 *
 * Phase 5 note: `baseUrlMode` is no longer written. The field is deprecated —
 * existing values in the DB are silently ignored by the UI and will be cleaned
 * up in a future migration. Inheritance is now expressed by the *absence* of
 * `baseUrl` in the stored config (undefined = inherit from company defaults).
 *
 * - If a custom `url` is provided it is stored as `baseUrl`.
 * - If no custom URL is provided (or `lmStudioBaseUrlMode` is 'company'),
 *   `baseUrl` is omitted so that the resolver falls back to the company default.
 */
export function buildLmStudioLocalConfig(values: CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    model: asString(values.model, DEFAULT_LM_STUDIO_MODEL),
  };

  // Only persist baseUrl when the user explicitly chose a custom URL.
  // An absent baseUrl means "inherit from company defaults".
  if (
    values.lmStudioBaseUrlMode === "custom" &&
    typeof values.url === "string" &&
    values.url.trim().length > 0
  ) {
    config.baseUrl = asString(values.url, DEFAULT_LM_STUDIO_BASE_URL);
  } else if (
    values.lmStudioBaseUrlMode !== "company" &&
    typeof values.url === "string" &&
    values.url.trim().length > 0
  ) {
    // Treat any non-empty URL without an explicit mode as a custom override.
    config.baseUrl = asString(values.url, DEFAULT_LM_STUDIO_BASE_URL);
  }

  const cwd = typeof values.cwd === "string" ? values.cwd.trim() : "";
  if (cwd.length > 0) config.cwd = cwd;

  const promptTemplate = typeof values.promptTemplate === "string" ? values.promptTemplate : "";
  if (promptTemplate.length > 0) config.promptTemplate = promptTemplate;

  const timeoutSec = typeof values.maxTurnsPerRun === "number" ? values.maxTurnsPerRun : Number(values.maxTurnsPerRun);
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) config.timeoutSec = timeoutSec;

  const envText = typeof values.envVars === "string" ? values.envVars : "";
  const env = parseEnvLines(envText);
  if (Object.keys(env).length > 0) config.env = env;

  return config;
}

export function parseLmStudioStdoutLine(line: string, ts: string): TranscriptEntry[] {
  if (!line || line.length === 0) return [];
  return [{ kind: "stdout", ts, text: line }];
}
