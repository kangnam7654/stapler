# Rust Migration Phase 0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Rust workspace, add Rust CI, parameterize E2E tests by BASE_URL, and ship `pnpm check:models` as the first Rust binary.

**Architecture:** Cargo workspace at repo root with `crates/` directory. The `check-models` binary reads an auto-generated `adapter-models.json` (extracted from TS adapter packages by a small tsx script), auto-detects installed CLIs and running local servers, then probes each model with a hello request and prints a colored terminal table.

**Tech Stack:** Rust (stable), cargo workspace, serde/serde_json (JSON parsing), tokio (async runtime + process spawn), reqwest (HTTP adapters), colored (terminal output), tsx (model extraction script)

**Design doc:** `docs/llm/rust-migration.md`

---

## Task 1: Initialize Cargo Workspace

**Files:**
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `.cargo/config.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
[workspace]
resolver = "2"
members = ["crates/*"]

[workspace.package]
edition = "2024"
license = "Apache-2.0"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
anyhow = "1"
thiserror = "2"
colored = "3"
```

- [ ] **Step 2: Create rust-toolchain.toml**

```toml
[toolchain]
channel = "stable"
```

- [ ] **Step 3: Create .cargo/config.toml**

```toml
[build]
# Use mold linker on Linux for faster linking (ignored on macOS)
# rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.aarch64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=lld"]
```

- [ ] **Step 4: Add Rust target dir to .gitignore**

Append to `.gitignore`:

```
# Rust build output (workspace-level)
/target/
```

Note: `desktop/target/` is already in `.gitignore`. This adds the workspace-level `/target/`.

- [ ] **Step 5: Verify workspace resolves**

Run: `cargo check --workspace 2>&1`
Expected: warning about no members (no crates yet), no errors

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml rust-toolchain.toml .cargo/config.toml .gitignore
git commit -m "chore: initialize Cargo workspace for Rust migration"
```

---

## Task 2: Scaffold crates/check-models Binary Crate

**Files:**
- Create: `crates/check-models/Cargo.toml`
- Create: `crates/check-models/src/main.rs`

- [ ] **Step 1: Create crate Cargo.toml**

```toml
[package]
name = "check-models"
version = "0.1.0"
edition.workspace = true
license.workspace = true

[[bin]]
name = "check-models"
path = "src/main.rs"

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
tokio = { workspace = true }
reqwest = { workspace = true }
anyhow = { workspace = true }
colored = { workspace = true }
```

- [ ] **Step 2: Create minimal main.rs that compiles**

```rust
fn main() {
    println!("check-models: not yet implemented");
}
```

- [ ] **Step 3: Verify crate compiles**

Run: `cargo check --workspace`
Expected: compiles cleanly (warnings OK for now)

- [ ] **Step 4: Commit**

```bash
git add crates/check-models/
git commit -m "chore: scaffold check-models crate"
```

---

## Task 3: Write the Model Extraction Script (TS side)

**Files:**
- Create: `scripts/extract-adapter-models.ts`

This script imports each adapter's `models` export and writes a JSON file that
the Rust binary will read.

- [ ] **Step 1: Write extract-adapter-models.ts**

```typescript
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
```

- [ ] **Step 2: Test the extraction script**

Run: `tsx scripts/extract-adapter-models.ts`
Expected: `Wrote 10 adapters (N total models) to /path/to/stapler/adapter-models.json`

Verify: `cat adapter-models.json | python3 -c "import json,sys; d=json.load(sys.stdin); print([(e['name'], len(e['models'])) for e in d])"`

- [ ] **Step 3: Add adapter-models.json to .gitignore**

Append to `.gitignore`:

```
# Generated by scripts/extract-adapter-models.ts
/adapter-models.json
```

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-adapter-models.ts .gitignore
git commit -m "feat: add adapter model extraction script for Rust check-models"
```

---

## Task 4: Implement the Rust check-models Binary — JSON Parsing + CLI Detection

**Files:**
- Modify: `crates/check-models/src/main.rs`
- Create: `crates/check-models/src/types.rs`
- Create: `crates/check-models/src/detect.rs`

- [ ] **Step 1: Define JSON types in types.rs**

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AdapterEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub adapter_type: String,
    pub probe: AdapterProbe,
    pub models: Vec<AdapterModel>,
}

#[derive(Debug, Deserialize)]
pub struct AdapterModel {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum AdapterProbe {
    #[serde(rename = "cli")]
    Cli { command: String, style: String },
    #[serde(rename = "http")]
    Http { url: String, style: String },
    #[serde(rename = "skip")]
    Skip { reason: String },
}
```

- [ ] **Step 2: Write CLI/HTTP detection in detect.rs**

```rust
use std::process::Command;

/// Check if a CLI command is available on PATH.
pub fn is_cli_available(command: &str) -> bool {
    Command::new("which")
        .arg(command)
        .output()
        .is_ok_and(|o| o.status.success())
}

/// Check if an HTTP endpoint is reachable (HEAD or GET with short timeout).
pub async fn is_http_reachable(base_url: &str) -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    // Ollama: /api/tags, LM Studio: /v1/models
    let urls = [
        format!("{}/api/tags", base_url),
        format!("{}/v1/models", base_url),
    ];

    for url in &urls {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
    }
    false
}
```

- [ ] **Step 3: Wire up main.rs to load JSON and detect availability**

```rust
mod detect;
mod types;

use std::{env, fs, path::PathBuf, process};
use colored::Colorize;
use types::{AdapterEntry, AdapterProbe};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let json_path = resolve_json_path()?;
    let data = fs::read_to_string(&json_path)
        .map_err(|e| anyhow::anyhow!(
            "Failed to read {}: {}. Run `tsx scripts/extract-adapter-models.ts` first.",
            json_path.display(), e
        ))?;
    let adapters: Vec<AdapterEntry> = serde_json::from_str(&data)?;

    let filter = env::args().nth(1).and_then(|a| {
        if a == "--adapter" { env::args().nth(2) } else { None }
    });

    let mut total = 0u32;
    let mut passed = 0u32;
    let mut failed = 0u32;
    let mut skipped = 0u32;

    for adapter in &adapters {
        if let Some(ref f) = filter {
            if &adapter.name != f { continue; }
        }

        match &adapter.probe {
            AdapterProbe::Skip { reason } => {
                println!("{} {} ({})",
                    "SKIP".yellow().bold(),
                    adapter.name.bold(),
                    reason.dimmed(),
                );
                skipped += adapter.models.len() as u32;
                continue;
            }
            AdapterProbe::Cli { command, .. } => {
                if !detect::is_cli_available(command) {
                    println!("{} {} ({} not found on PATH)",
                        "SKIP".yellow().bold(),
                        adapter.name.bold(),
                        command.dimmed(),
                    );
                    skipped += adapter.models.len() as u32;
                    continue;
                }
            }
            AdapterProbe::Http { url, .. } => {
                if !detect::is_http_reachable(url).await {
                    println!("{} {} ({} not reachable)",
                        "SKIP".yellow().bold(),
                        adapter.name.bold(),
                        url.dimmed(),
                    );
                    skipped += adapter.models.len() as u32;
                    continue;
                }
            }
        }

        println!("\n{}", adapter.name.bold().underline());

        if adapter.models.is_empty() {
            println!("  {} no models defined", "SKIP".yellow());
            continue;
        }

        for model in &adapter.models {
            total += 1;
            // probe will be implemented in Task 5
            println!("  {} {}", "TODO".dimmed(), model.id);
        }
    }

    println!("\n{}", "─".repeat(50));
    println!(
        "Total: {}  {}  {}  {}",
        total.to_string().bold(),
        format!("{} passed", passed).green(),
        format!("{} failed", failed).red(),
        format!("{} skipped", skipped).yellow(),
    );

    Ok(())
}

fn resolve_json_path() -> anyhow::Result<PathBuf> {
    // Look for adapter-models.json in repo root (same level as Cargo.toml)
    let manifest_dir = env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|_| ".".to_string());
    let workspace_root = PathBuf::from(&manifest_dir)
        .ancestors()
        .find(|p| p.join("Cargo.toml").exists() && p.join("package.json").exists())
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();
    Ok(workspace_root.join("adapter-models.json"))
}
```

- [ ] **Step 4: Verify it compiles and runs (with extraction first)**

Run: `tsx scripts/extract-adapter-models.ts && cargo run -p check-models`
Expected: lists each adapter with SKIP/TODO markers, no crashes

- [ ] **Step 5: Commit**

```bash
git add crates/check-models/
git commit -m "feat(check-models): JSON parsing, CLI detection, adapter listing"
```

---

## Task 5: Implement Model Probing per Adapter Style

**Files:**
- Create: `crates/check-models/src/probe.rs`
- Modify: `crates/check-models/src/main.rs`

- [ ] **Step 1: Write probe.rs with per-style probe functions**

```rust
use std::time::Duration;
use tokio::process::Command;

/// Result of a single model probe.
pub struct ProbeResult {
    pub success: bool,
    pub detail: Option<String>,
}

/// Probe a model by adapter style.
pub async fn probe_model(
    style: &str,
    command_or_url: &str,
    model_id: &str,
) -> ProbeResult {
    match style {
        "gemini" => probe_gemini(command_or_url, model_id).await,
        "claude" => probe_claude(command_or_url, model_id).await,
        "codex" => probe_codex(command_or_url, model_id).await,
        "cursor" => probe_cursor(command_or_url, model_id).await,
        "ollama" => probe_ollama(command_or_url, model_id).await,
        "lm-studio" => probe_lm_studio(command_or_url, model_id).await,
        _ => ProbeResult { success: false, detail: Some(format!("unknown style: {style}")) },
    }
}

async fn probe_gemini(cmd: &str, model: &str) -> ProbeResult {
    run_cli(cmd, &["--model", model, "-p", "say: ok"], None, 20).await
}

async fn probe_claude(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["--print", "--model", model, "--output-format", "text", "-p", "say: ok"],
        None,
        30,
    ).await
}

async fn probe_codex(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["exec", "--json", "--model", model, "-q", "say: ok"],
        None,
        30,
    ).await
}

async fn probe_cursor(cmd: &str, model: &str) -> ProbeResult {
    run_cli(
        cmd,
        &["-p", "--mode", "ask", "--model", model, "say: ok"],
        None,
        30,
    ).await
}

async fn probe_ollama(base_url: &str, model: &str) -> ProbeResult {
    let url = format!("{}/api/generate", base_url);
    let body = serde_json::json!({
        "model": model,
        "prompt": "say: ok",
        "stream": false,
    });
    probe_http_post(&url, &body, 30).await
}

async fn probe_lm_studio(base_url: &str, model: &str) -> ProbeResult {
    let url = format!("{}/v1/chat/completions", base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "say: ok"}],
        "max_tokens": 10,
    });
    probe_http_post(&url, &body, 30).await
}

async fn run_cli(cmd: &str, args: &[&str], stdin: Option<&str>, timeout_secs: u64) -> ProbeResult {
    let result = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        async {
            let mut child = Command::new(cmd)
                .args(args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .stdin(std::process::Stdio::null())
                .spawn()?;
            let output = child.wait_with_output().await?;
            Ok::<_, anyhow::Error>(output)
        },
    ).await;

    match result {
        Ok(Ok(output)) if output.status.success() => ProbeResult {
            success: true,
            detail: None,
        },
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = stderr.lines().next().unwrap_or("non-zero exit").to_string();
            ProbeResult { success: false, detail: Some(detail) }
        }
        Ok(Err(e)) => ProbeResult {
            success: false,
            detail: Some(format!("spawn error: {e}")),
        },
        Err(_) => ProbeResult {
            success: false,
            detail: Some("timeout".to_string()),
        },
    }
}

async fn probe_http_post(url: &str, body: &serde_json::Value, timeout_secs: u64) -> ProbeResult {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_default();

    match client.post(url).json(body).send().await {
        Ok(resp) if resp.status().is_success() => ProbeResult {
            success: true,
            detail: None,
        },
        Ok(resp) => ProbeResult {
            success: false,
            detail: Some(format!("HTTP {}", resp.status())),
        },
        Err(e) => ProbeResult {
            success: false,
            detail: Some(e.to_string()),
        },
    }
}
```

- [ ] **Step 2: Wire probe into main.rs model loop**

Replace the `for model in &adapter.models` loop body in `main.rs`:

```rust
        for model in &adapter.models {
            total += 1;
            let (cmd_or_url, style) = match &adapter.probe {
                AdapterProbe::Cli { command, style } => (command.as_str(), style.as_str()),
                AdapterProbe::Http { url, style } => (url.as_str(), style.as_str()),
                AdapterProbe::Skip { .. } => unreachable!(),
            };

            let result = probe::probe_model(style, cmd_or_url, &model.id).await;

            if result.success {
                passed += 1;
                println!("  {} {}", "PASS".green().bold(), model.id);
            } else {
                failed += 1;
                let detail = result.detail.unwrap_or_default();
                println!("  {} {} — {}", "FAIL".red().bold(), model.id, detail.dimmed());
            }
        }
```

Add `mod probe;` at the top of main.rs.

- [ ] **Step 3: Add exit code logic at the end of main**

After the summary print in `main.rs`, add:

```rust
    if failed > 0 {
        process::exit(1);
    }

    Ok(())
```

- [ ] **Step 4: Test with real adapters**

Run: `tsx scripts/extract-adapter-models.ts && cargo run -p check-models`
Expected: colored PASS/FAIL/SKIP output for all detected adapters.

Run single adapter: `cargo run -p check-models -- --adapter gemini-local`
Expected: only Gemini models probed.

- [ ] **Step 5: Commit**

```bash
git add crates/check-models/
git commit -m "feat(check-models): implement model probing for all adapter styles"
```

---

## Task 6: Add pnpm Script and --verbose Flag

**Files:**
- Modify: `package.json` (root)
- Modify: `crates/check-models/src/main.rs`

- [ ] **Step 1: Add check:models script to root package.json**

Add to `scripts`:

```json
"check:models": "tsx scripts/extract-adapter-models.ts && cargo run -p check-models --"
```

- [ ] **Step 2: Add --verbose and --adapter flag parsing in main.rs**

Replace the argument parsing section at the top of `main()`:

```rust
    let args: Vec<String> = env::args().collect();
    let verbose = args.iter().any(|a| a == "--verbose");
    let filter = args.iter().position(|a| a == "--adapter")
        .and_then(|i| args.get(i + 1).cloned());
```

Update the FAIL print to show full detail when verbose:

```rust
            if result.success {
                passed += 1;
                println!("  {} {}", "PASS".green().bold(), model.id);
            } else {
                failed += 1;
                let detail = result.detail.unwrap_or_default();
                if verbose {
                    println!("  {} {} —\n    {}", "FAIL".red().bold(), model.id, detail);
                } else {
                    let short = detail.lines().next().unwrap_or("");
                    let truncated = if short.len() > 80 { &short[..80] } else { short };
                    println!("  {} {} — {}", "FAIL".red().bold(), model.id, truncated.dimmed());
                }
            }
```

- [ ] **Step 3: Test via pnpm**

Run: `pnpm check:models`
Expected: extract + build + probe runs end-to-end.

Run: `pnpm check:models -- --adapter gemini-local`
Expected: only Gemini models.

Run: `pnpm check:models -- --verbose`
Expected: full error detail on any failures.

- [ ] **Step 4: Commit**

```bash
git add package.json crates/check-models/src/main.rs
git commit -m "feat: wire up pnpm check:models with --adapter and --verbose flags"
```

---

## Task 7: Add Rust Jobs to CI

**Files:**
- Modify: `.github/workflows/pr.yml`

- [ ] **Step 1: Add rust-check job to pr.yml**

Add a new job after the `verify` job:

```yaml
  rust:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo registry and build
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: rust-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: rust-${{ runner.os }}-

      - name: Cargo check
        run: cargo check --workspace

      - name: Cargo test
        run: cargo test --workspace

      - name: Cargo clippy
        run: cargo clippy --workspace -- -D warnings
```

Note: this job does NOT run `check:models` (that requires live API keys).
It only validates that Rust code compiles, tests pass, and clippy is clean.

- [ ] **Step 2: Verify the workflow YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pr.yml'))" && echo "valid YAML"`
Expected: `valid YAML`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pr.yml
git commit -m "ci: add Rust check, test, and clippy to PR workflow"
```

---

## Task 8: Parameterize E2E Tests by BASE_URL

**Files:**
- Modify: `tests/e2e/playwright.config.ts`

- [ ] **Step 1: Add full BASE_URL override to playwright.config.ts**

The config already reads `PAPERCLIP_E2E_PORT` but always builds
`http://127.0.0.1:${PORT}`. Add a direct `PAPERCLIP_E2E_BASE_URL` override:

```typescript
const BASE_URL = process.env.PAPERCLIP_E2E_BASE_URL
  ?? `http://127.0.0.1:${Number(process.env.PAPERCLIP_E2E_PORT ?? 3100)}`;
```

This allows future Rust server E2E runs:
`PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:3200 pnpm test:e2e`

- [ ] **Step 2: Conditionally disable webServer when BASE_URL is overridden**

When `PAPERCLIP_E2E_BASE_URL` is set, the test runner should not auto-start
Express — the Rust server is assumed to be already running:

```typescript
  webServer: process.env.PAPERCLIP_E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm paperclipai run`,
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
```

- [ ] **Step 3: Verify E2E still works with default config**

Run (with dev server already running):
`PAPERCLIP_E2E_SKIP_LLM=true pnpm test:e2e`
Expected: onboarding.spec.ts passes.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/playwright.config.ts
git commit -m "feat(e2e): parameterize BASE_URL for Rust server E2E validation"
```

---

## Task 9: Scaffold crates/shared as Empty Crate

**Files:**
- Create: `crates/shared/Cargo.toml`
- Create: `crates/shared/src/lib.rs`

This is Phase 1 prep — a placeholder crate to validate the workspace
layout works with multiple crates.

- [ ] **Step 1: Create crate Cargo.toml**

```toml
[package]
name = "stapler-shared"
version = "0.1.0"
edition.workspace = true
license.workspace = true

[dependencies]
serde = { workspace = true }
```

- [ ] **Step 2: Create lib.rs with a placeholder module**

```rust
//! Shared types, validators, and constants for the Stapler control plane.
//!
//! This crate is the Rust equivalent of `packages/shared`.
//! Types will be ported incrementally in Phase 1.

/// Placeholder — will hold domain types (Company, Agent, Task, etc.)
pub mod types {}

#[cfg(test)]
mod tests {
    #[test]
    fn shared_crate_compiles() {
        assert!(true);
    }
}
```

- [ ] **Step 3: Verify workspace compiles with both crates**

Run: `cargo check --workspace && cargo test --workspace`
Expected: both `check-models` and `stapler-shared` compile and test.

- [ ] **Step 4: Commit**

```bash
git add crates/shared/
git commit -m "chore: scaffold stapler-shared crate (Phase 1 prep)"
```

---

## Summary

| Task | What | Depends on |
|---|---|---|
| 1 | Cargo workspace init | — |
| 2 | Scaffold check-models crate | 1 |
| 3 | Model extraction TS script | — |
| 4 | check-models: JSON parse + CLI detect | 2, 3 |
| 5 | check-models: model probing | 4 |
| 6 | pnpm script + flags | 5 |
| 7 | CI Rust jobs | 2 |
| 8 | E2E BASE_URL parameterization | — |
| 9 | Scaffold shared crate | 1 |

Tasks 1, 3, 8 have no dependencies and can run in parallel.
Tasks 7 and 9 only depend on Task 1 and can run after it in parallel.
