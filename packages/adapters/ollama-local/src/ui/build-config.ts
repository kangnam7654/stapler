// src/ui/build-config.ts
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";

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

export function buildOllamaLocalConfig(values: CreateConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {
    baseUrl: asString(values.url, DEFAULT_OLLAMA_BASE_URL),
    model: asString(values.model, DEFAULT_OLLAMA_MODEL),
  };

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

export function parseOllamaStdoutLine(line: string): { text?: string; kind?: string } | null {
  if (!line || line.length === 0) return null;
  return { text: line, kind: "log" };
}
