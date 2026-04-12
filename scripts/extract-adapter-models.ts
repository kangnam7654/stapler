#!/usr/bin/env tsx
/**
 * Extracts model lists from all adapter packages and writes them to
 * a JSON file consumed by the Rust check-models binary.
 *
 * Usage: tsx scripts/extract-adapter-models.ts [--out path]
 */
import fs from "node:fs";
import path from "node:path";

interface AdapterModel {
  id: string;
  label: string;
}

interface AdapterEntry {
  /** Adapter directory name (e.g. "gemini-local") */
  name: string;
  /** Adapter type id (e.g. "gemini_local") */
  type: string;
  /** CLI command name or "http" for network adapters */
  probe: AdapterProbe;
  models: AdapterModel[];
}

type AdapterProbe =
  | { kind: "cli"; command: string; style: "gemini" | "claude" | "codex" | "cursor" }
  | { kind: "http"; url: string; style: "ollama" | "lm-studio" }
  | { kind: "skip"; reason: string };

const ADAPTERS_DIR = path.resolve(import.meta.dirname, "../packages/adapters");

const PROBE_MAP: Record<string, AdapterProbe> = {
  "gemini-local":  { kind: "cli", command: "gemini", style: "gemini" },
  "claude-local":  { kind: "cli", command: "claude", style: "claude" },
  "codex-local":   { kind: "cli", command: "codex", style: "codex" },
  "cursor-local":  { kind: "cli", command: "cursor-agent", style: "cursor" },
  "ollama-local":  { kind: "http", url: "http://localhost:11434", style: "ollama" },
  "lm-studio-local": { kind: "http", url: "http://localhost:1234", style: "lm-studio" },
  "openai-compat-local": { kind: "skip", reason: "no models export" },
  "openclaw-gateway": { kind: "skip", reason: "gateway adapter, no direct model probe" },
  "opencode-local": { kind: "skip", reason: "empty models list, requires provider/model format" },
  "pi-local": { kind: "skip", reason: "empty models list, requires provider/model config" },
};

async function main() {
  const outArg = process.argv.indexOf("--out");
  const outPath = outArg >= 0 && process.argv[outArg + 1]
    ? path.resolve(process.argv[outArg + 1])
    : path.resolve(import.meta.dirname, "../adapter-models.json");

  const adapterDirs = fs.readdirSync(ADAPTERS_DIR).filter((name) => {
    const stat = fs.statSync(path.join(ADAPTERS_DIR, name));
    return stat.isDirectory();
  });

  const entries: AdapterEntry[] = [];

  for (const name of adapterDirs.sort()) {
    const indexPath = path.join(ADAPTERS_DIR, name, "src", "index.ts");
    if (!fs.existsSync(indexPath)) continue;

    try {
      const mod = await import(indexPath);
      const models: AdapterModel[] = Array.isArray(mod.models) ? mod.models : [];
      const type: string = typeof mod.type === "string" ? mod.type : name;
      const probe = PROBE_MAP[name] ?? { kind: "skip" as const, reason: "unknown adapter" };

      entries.push({ name, type, probe, models });
    } catch (err) {
      console.error(`[warn] failed to import ${name}: ${err}`);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} adapters (${entries.reduce((n, e) => n + e.models.length, 0)} total models) to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
