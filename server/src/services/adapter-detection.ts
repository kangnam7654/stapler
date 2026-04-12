import { execFile } from "node:child_process";
import type {
  AdapterDetectionItem,
  AdapterDetectionResult,
} from "@paperclipai/shared";

// ---------------------------------------------------------------------------
// Adapter definitions with priority order (lower index = higher priority)
// ---------------------------------------------------------------------------

interface CliAdapterDef {
  kind: "cli";
  type: string;
  name: string;
  cli: string;
  defaultModel: string;
  args?: string[];
}

interface ServerAdapterDef {
  kind: "server";
  type: string;
  name: string;
  baseUrl: string;
  healthPath: string;
  defaultModel: string;
}

type AdapterDef = CliAdapterDef | ServerAdapterDef;

/** Ordered by priority — highest first. */
const ADAPTER_DEFS: AdapterDef[] = [
  {
    kind: "cli",
    type: "claude_local",
    name: "Claude Code",
    cli: "claude",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    kind: "cli",
    type: "codex_local",
    name: "Codex CLI",
    cli: "codex",
    defaultModel: "o4-mini",
  },
  {
    kind: "cli",
    type: "gemini_local",
    name: "Gemini CLI",
    cli: "gemini",
    defaultModel: "gemini-2.5-pro",
  },
  {
    kind: "cli",
    type: "cursor",
    name: "Cursor",
    cli: "cursor",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    kind: "server",
    type: "ollama_local",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
    healthPath: "/",
    defaultModel: "llama3.1",
  },
  {
    kind: "server",
    type: "lm_studio_local",
    name: "LM Studio",
    baseUrl: "http://localhost:1234",
    healthPath: "/v1/models",
    defaultModel: "default",
  },
];

const TIMEOUT_MS = 2_000;

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

function execFileAsync(
  cmd: string,
  args: string[],
  timeout: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout).trim());
    });
  });
}

async function detectCli(
  def: CliAdapterDef,
): Promise<AdapterDetectionItem | null> {
  try {
    await execFileAsync("which", [def.cli], TIMEOUT_MS);
  } catch {
    return null;
  }

  // CLI exists — try to get version (best-effort)
  let version: string | undefined;
  try {
    version = await execFileAsync(def.cli, ["--version"], TIMEOUT_MS);
  } catch {
    // version is optional; ignore
  }

  return {
    type: def.type,
    name: def.name,
    version,
    defaultModel: def.defaultModel,
    connectionInfo: {
      command: def.cli,
      args: def.args,
    },
  };
}

async function detectServer(
  def: ServerAdapterDef,
): Promise<AdapterDetectionItem | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${def.baseUrl}${def.healthPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
  } catch {
    return null;
  }

  return {
    type: def.type,
    name: def.name,
    defaultModel: def.defaultModel,
    connectionInfo: {
      baseUrl: def.baseUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect locally-installed AI adapters (CLI tools and local model servers).
 *
 * All checks run in parallel. Results are sorted by priority (highest first).
 * The recommended adapter is the highest-priority detected adapter.
 */
export async function detectInstalledAdapters(): Promise<AdapterDetectionResult> {
  const checks = ADAPTER_DEFS.map((def) =>
    def.kind === "cli" ? detectCli(def) : detectServer(def),
  );

  const results = await Promise.all(checks);

  // Filter nulls — order is preserved from ADAPTER_DEFS (priority order)
  const detected = results.filter(
    (r): r is AdapterDetectionItem => r !== null,
  );

  return {
    detected,
    recommended: detected[0] ?? null,
  };
}
