# Phase 2 — napi-rs Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Phase 1 Rust `scan_workspace_skills` function as a native Node.js module (`@paperclipai/skills-scanner-native`), wire it into the pnpm workspace, and make `server/src/services/company-skills.ts` call it instead of the pure-TS scan loop — with a graceful fallback to TS when the native binary is unavailable.

**Architecture:**
- **napi-rs 2.x async Task.** The Rust function is blocking I/O (file walks), so it runs on libuv's thread pool via `napi::bindgen_prelude::AsyncTask`, returning a `Promise<string>` (JSON) to JS without blocking the event loop.
- **JSON bridge.** Rust serializes `WorkspaceScanResult` to a JSON string; the TS adapter parses and maps snake_case→camelCase. This sidesteps complex napi type mapping for nested structs/enums.
- **Graceful fallback.** If the `.node` binary is missing or fails to load, the TS adapter exports `isNativeAvailable = false` and `company-skills.ts` falls back to the existing pure-TS loop. The env var `PAPERCLIP_DISABLE_NATIVE_SKILLS=1` forces the fallback even when the binary is present.
- **Metadata merging in TS.** The Rust scanner produces base `ImportedSkill` records with `metadata.sourceKind = "local_path"`. The project-scan-specific extras (`projectId`, `workspaceId`, etc.) are merged in TS after the call, matching the existing TS behavior at lines 1895–1905 of `company-skills.ts`.

**Tech Stack:**
- **Rust:** `napi = "2"` (feature `napi4`), `napi-derive = "2"`, `napi-build = "2"` (build-dep), existing `serde_json`/`sha2`/`hex`
- **Node:** `@napi-rs/cli ^3` as devDependency for `napi build` step
- **Target platforms (Phase 2):** `darwin-arm64` (dev machines) + `linux-x64-gnu` (server production). Other platforms defer to Phase 3.
- **No CI changes in this phase.** Multi-platform build matrix and release publishing of the native module are Phase 3. Phase 2 leaves the binary optional; CI continues to pass with the TS fallback.

---

## Correctness debt and open questions

Read carefully before starting — these were identified while planning and must be handled by the tasks below.

1. **Crate type doesn't affect tests.** Changing `[lib] crate-type = ["cdylib", "lib"]` in Cargo.toml is safe for `cargo test` because the `lib` variant is still produced. The existing 16 unit tests and 3 parity tests in Phase 1 must continue to pass; the build must remain warning-free.
2. **napi-rs `cdylib` symbol registration.** `#[napi]` functions must live in a module that is reachable from `lib.rs`. We'll add `pub mod napi_exports;` in `lib.rs`. The macros work in both test and cdylib builds — no `#[cfg(...)]` gating needed. Confirmed against napi-rs 2.x examples.
3. **`metadata.sourceKind` semantics.** Phase 1 Rust always sets `sourceKind: "local_path"`. The existing TS call site (`company-skills.ts:1895–1905`) overrides this to `"project_scan"` and adds `projectId/workspaceId/workspaceName/workspaceCwd`. The TS adapter must replicate this override *after* parsing the Rust JSON, by shallow-merging `{sourceKind, projectId, projectName, workspaceId, workspaceName, workspaceCwd}` into each skill's `metadata` object.
4. **Path canonicalization semantics.** Rust's `scan_workspace_skills` returns `workspace_cwd` as the literal path passed in (not canonicalized), but each skill's `package_dir`/`source_locator` *is* canonicalized (via `fs::canonicalize`). On macOS this means `/var/folders/...` becomes `/private/var/folders/...`. The TS integration currently uses `normalizeSourceLocatorDirectory(nextSkill.sourceLocator)` downstream — this must keep working. No change expected, but the smoke test in Task 7 must verify.
5. **Error shape.** The Rust loop catches and `eprintln!`s per-skill errors and continues. The TS loop catches per-skill errors and records them in `skipped[]` with a warning. In the native path we lose the structured skip info (we only get the surviving skills). For Phase 2 this is acceptable — the fallback still catches workspace-level errors and falls back to TS on any exception. Phase 3 can add structured error reporting through the napi boundary if needed.
6. **Binary name.** `@napi-rs/cli` generates `skills-scanner.darwin-arm64.node` (etc.) based on target triple. The crate name in `Cargo.toml` stays `skills-scanner`. Don't rename the crate.
7. **`pnpm install` must succeed without the `.node` binary.** `@napi-rs/cli` is a devDependency and the `build` script is *not* run during `pnpm install`. The binary is built explicitly when the user runs `pnpm --filter @paperclipai/skills-scanner-native build`. This keeps the install fast and avoids a cargo dependency on every developer machine.

---

## File structure

```
native/skills-scanner/
├── Cargo.toml                 (MODIFY: add napi deps, [lib] crate-type)
├── build.rs                   (CREATE: calls napi_build::setup)
├── package.json               (CREATE: @paperclipai/skills-scanner-native)
├── index.js                   (CREATE: platform loader, returns null on failure)
├── index.d.ts                 (CREATE: TS declarations for the native API)
├── .gitignore                 (MODIFY: add *.node)
├── src/
│   ├── lib.rs                 (MODIFY: add `pub mod napi_exports;`)
│   └── napi_exports.rs        (CREATE: #[napi] async Task wrapper)
│
pnpm-workspace.yaml            (MODIFY: add `- native/skills-scanner`)
server/package.json            (MODIFY: add @paperclipai/skills-scanner-native dep)
server/src/services/
├── native-skills-scanner.ts   (CREATE: TS adapter with field mapping + fallback detection)
└── company-skills.ts          (MODIFY: lines 1886–1917 — add native fast path)
```

**Files NOT touched:**
- `.github/workflows/*.yml` — CI changes deferred to Phase 3.
- `native/skills-scanner/src/{types,scan,slug,hash,classify,frontmatter}.rs` — Phase 1 code stays unchanged.
- `native/skills-scanner/tests/` — parity tests stay unchanged.
- `server/src/__tests__/company-skills.test.ts` — existing tests must continue to pass against the TS fallback path.

---

## Tasks

### Task 1: Enable cdylib + add napi-rs dependencies

**Files:**
- Modify: `native/skills-scanner/Cargo.toml`
- Create: `native/skills-scanner/build.rs`
- Modify: `native/skills-scanner/.gitignore`

- [ ] **Step 1: Read the current Cargo.toml**

Run: `cat native/skills-scanner/Cargo.toml` (use Read tool)
Expected: the 15-line Cargo.toml shown in the file-header context at the top of this plan session.

- [ ] **Step 2: Replace `Cargo.toml` with the Phase 2 version**

Overwrite with:

```toml
[package]
name = "skills-scanner"
version = "0.1.0"
edition = "2021"
description = "Fast skill file discovery and hashing for Paperclip — Rust port of server/src/services/company-skills.ts (scan/hash/classify layer)"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
sha2 = "0.10"
hex = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
napi = { version = "2", default-features = false, features = ["napi4"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"

[dev-dependencies]
tempfile = "3"
```

Rationale:
- `crate-type = ["cdylib", "lib"]` — `cdylib` produces the `.node`-loadable binary; `lib` keeps unit/integration tests buildable.
- `features = ["napi4"]` — targets Node.js N-API version 4 (Node 10.6+). We run Node 24 in CI, so this is comfortably below our floor.
- `default-features = false` for `napi` — strips `async` (tokio) and other heavy features we don't need. The `AsyncTask` type we'll use in Task 2 is in `bindgen_prelude` and doesn't require the `async` feature.

- [ ] **Step 3: Create `native/skills-scanner/build.rs`**

```rust
extern crate napi_build;

fn main() {
    napi_build::setup();
}
```

- [ ] **Step 4: Append `*.node` to `native/skills-scanner/.gitignore`**

Read the current `.gitignore` first (it should contain only `target/` from Phase 1). Append:

```
*.node
```

(One line, no leading slash. This excludes build outputs like `skills-scanner.darwin-arm64.node` from git.)

- [ ] **Step 5: Verify cargo still builds cleanly**

Run: `cd native/skills-scanner && cargo build 2>&1`
Expected: builds successfully. May download new crates (`napi`, `napi-derive`, `napi-build`, `ctor`, `once_cell`, etc.) on first run. No warnings introduced.

If `napi-build` complains about missing `NODE_EXECUTABLE` or similar: the napi-build crate expects to find a Node.js toolchain during build. Node 24 is installed per CLAUDE.md env — if it's not on PATH, add `which node` to the diagnosis before proceeding.

- [ ] **Step 6: Verify existing tests still pass**

Run: `cd native/skills-scanner && cargo test 2>&1`
Expected: all 16 unit tests + 3 parity tests pass (19 total). No regressions from Phase 1.

- [ ] **Step 7: Commit**

```bash
git add native/skills-scanner/Cargo.toml native/skills-scanner/build.rs native/skills-scanner/.gitignore
git commit -m "$(cat <<'EOF'
feat(skills-scanner): enable cdylib + add napi-rs build deps

Phase 2 step 1: prepare crate for napi-rs integration.

- Add [lib] crate-type = ["cdylib", "lib"] so tests still build.
- Add napi / napi-derive (runtime) and napi-build (build script).
- Add build.rs calling napi_build::setup().
- Ignore *.node artifacts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add the `napi_exports` module with the async Task wrapper

**Files:**
- Create: `native/skills-scanner/src/napi_exports.rs`
- Modify: `native/skills-scanner/src/lib.rs`

- [ ] **Step 1: Create `native/skills-scanner/src/napi_exports.rs`**

```rust
//! napi-rs bindings exposing `scan_workspace_skills` to Node.js.
//!
//! The scan is blocking file I/O, so it runs on libuv's thread pool
//! via `AsyncTask` to avoid blocking the JS event loop. The return
//! value is a JSON string to sidestep napi type mapping for nested
//! structs/enums — the TS adapter parses it.
//!
//! Exported functions:
//!
//! - `scanWorkspaceSkillsAsync(companyId, workspaceCwd) -> Promise<string>`

use std::path::PathBuf;

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Error, Result, Status, Task};
use napi_derive::napi;

use crate::scan::scan_workspace_skills;

/// Blocking scan wrapped as an `AsyncTask` — runs on the libuv thread pool.
pub struct ScanWorkspaceTask {
    company_id: String,
    workspace_cwd: PathBuf,
}

impl Task for ScanWorkspaceTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let result = scan_workspace_skills(&self.company_id, &self.workspace_cwd);
        serde_json::to_string(&result).map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("skills-scanner: json serialize failed: {e}"),
            )
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// napi entry point. Returns a `Promise<string>` to JS.
///
/// The string is JSON of the Rust `WorkspaceScanResult` struct
/// (snake_case field names). The TS adapter parses and remaps to
/// camelCase `ImportedSkill`.
#[napi(js_name = "scanWorkspaceSkillsAsync")]
pub fn scan_workspace_skills_async(
    company_id: String,
    workspace_cwd: String,
) -> AsyncTask<ScanWorkspaceTask> {
    AsyncTask::new(ScanWorkspaceTask {
        company_id,
        workspace_cwd: PathBuf::from(workspace_cwd),
    })
}
```

- [ ] **Step 2: Register the module in `lib.rs`**

Read `native/skills-scanner/src/lib.rs` — it currently has:

```rust
pub mod classify;
pub mod frontmatter;
pub mod hash;
pub mod scan;
pub mod slug;
pub mod types;
```

Add one line after `pub mod types;`:

```rust
pub mod napi_exports;
```

Do **not** gate behind `#[cfg(...)]`. The `#[napi]` macro is a no-op when building for tests; it only emits cdylib entry points in the cdylib build.

- [ ] **Step 3: Verify it compiles**

Run: `cd native/skills-scanner && cargo build 2>&1`
Expected: builds clean, no warnings. First build after Task 1 will link `napi`/`napi-derive`; this may take ~30s.

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd native/skills-scanner && cargo test 2>&1`
Expected: all 19 tests still pass. The napi exports are present in the `lib` variant but don't interfere with tests because nothing calls them.

- [ ] **Step 5: Produce the cdylib artifact**

Run: `cd native/skills-scanner && cargo build --release 2>&1 | tail -20`
Expected: builds successfully. The output file is at (macOS) `../target/release/libskills_scanner.dylib` or (linux) `../target/release/libskills_scanner.so`.

Verify it exists (macOS):

```bash
ls -la /Users/kangnam/projects/paperclip-ko/native/target/release/libskills_scanner.dylib
```

- [ ] **Step 6: Commit**

```bash
git add native/skills-scanner/src/lib.rs native/skills-scanner/src/napi_exports.rs
git commit -m "$(cat <<'EOF'
feat(skills-scanner): add napi async Task wrapper for scan_workspace_skills

Phase 2 step 2: wrap the Phase 1 scan function in a napi-rs AsyncTask
returning Promise<string> (JSON of WorkspaceScanResult).

- napi_exports::ScanWorkspaceTask runs scan_workspace_skills on
  libuv's thread pool via the Task trait.
- JSON output keeps napi type mapping simple; TS adapter will parse.
- Node-side JS name is scanWorkspaceSkillsAsync.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the `@paperclipai/skills-scanner-native` npm package

**Files:**
- Create: `native/skills-scanner/package.json`
- Create: `native/skills-scanner/index.js`
- Create: `native/skills-scanner/index.d.ts`

- [ ] **Step 1: Create `native/skills-scanner/package.json`**

```json
{
  "name": "@paperclipai/skills-scanner-native",
  "version": "0.1.0",
  "description": "Rust-backed skill scanner for Paperclip (napi-rs)",
  "license": "MIT",
  "private": true,
  "main": "index.js",
  "types": "index.d.ts",
  "files": [
    "index.js",
    "index.d.ts",
    "*.node"
  ],
  "napi": {
    "name": "skills-scanner",
    "triples": {
      "defaults": false,
      "additional": [
        "x86_64-unknown-linux-gnu",
        "aarch64-apple-darwin",
        "x86_64-apple-darwin"
      ]
    }
  },
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform"
  },
  "devDependencies": {
    "@napi-rs/cli": "^3.0.0-alpha.64"
  }
}
```

Rationale:
- `"private": true` — never publish this to npm in Phase 2. Consumed via `workspace:*` only.
- `files` — includes `*.node` so the workspace consumer sees the binary when it's built. Git ignores it (see Task 1 .gitignore).
- `napi.name = "skills-scanner"` — the CLI uses this as the prefix for generated binary names, e.g. `skills-scanner.darwin-arm64.node`.
- `napi.triples.additional` — explicitly lists the target triples we care about. `"defaults": false` prevents napi CLI from guessing.
- `@napi-rs/cli` version: use `3.0.0-alpha.64` or later. Check `pnpm view @napi-rs/cli version` before writing the file — if the stable `3.x` is out, use that instead. Record the version in the commit message.

- [ ] **Step 2: Create `native/skills-scanner/index.js` (platform loader)**

```js
'use strict'

const { existsSync } = require('fs')
const { join } = require('path')
const { platform, arch } = process

// Map process.platform + process.arch -> napi-rs binary file suffix.
function resolvePlatformSuffix() {
  if (platform === 'darwin') {
    if (arch === 'arm64') return 'darwin-arm64'
    if (arch === 'x64') return 'darwin-x64'
  }
  if (platform === 'linux') {
    if (arch === 'x64') return 'linux-x64-gnu'
    if (arch === 'arm64') return 'linux-arm64-gnu'
  }
  if (platform === 'win32') {
    if (arch === 'x64') return 'win32-x64-msvc'
  }
  return null
}

let nativeBinding = null

try {
  const suffix = resolvePlatformSuffix()
  if (suffix) {
    const localPath = join(__dirname, `skills-scanner.${suffix}.node`)
    if (existsSync(localPath)) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      nativeBinding = require(localPath)
    }
  }
} catch (err) {
  // Swallow load errors — caller falls back to TS implementation.
  // We intentionally do NOT log here; the TS adapter logs once per process.
  nativeBinding = null
}

module.exports = nativeBinding
```

Rationale:
- Returns `null` on any failure (missing binary, unsupported platform, load error). The TS adapter treats `null` as "native unavailable, use TS fallback".
- No throws — makes `require('@paperclipai/skills-scanner-native')` safe to call at module top-level even when the binary hasn't been built.

- [ ] **Step 3: Create `native/skills-scanner/index.d.ts`**

```typescript
/**
 * Native Rust-backed skill scanner (napi-rs).
 *
 * Returns `null` when the platform-specific `.node` binary is not
 * available (binary not built, or running on an unsupported platform).
 * Consumers must handle the null case and fall back to the TS scanner.
 */

export interface NativeSkillsScanner {
  /**
   * Scan a workspace for skill directories and return a JSON string
   * of the Rust `WorkspaceScanResult` struct (snake_case fields).
   *
   * The returned promise resolves on libuv's thread pool, so calling
   * this does not block the Node event loop.
   *
   * @param companyId - Company identifier used when deriving canonical skill keys.
   * @param workspaceCwd - Absolute path to the workspace to scan.
   * @returns JSON string of `WorkspaceScanResult`.
   */
  scanWorkspaceSkillsAsync(
    companyId: string,
    workspaceCwd: string,
  ): Promise<string>
}

declare const nativeBinding: NativeSkillsScanner | null
export default nativeBinding
export = nativeBinding
```

Note on `export = nativeBinding`: this matches the CommonJS `module.exports = nativeBinding` from `index.js`. The TS adapter can consume it via `import nativeBinding from '@paperclipai/skills-scanner-native'` with the default export.

- [ ] **Step 4: Build the native binary locally**

Before running the build, install dev deps so `napi` CLI is available:

Run (from repo root): `pnpm install --filter @paperclipai/skills-scanner-native 2>&1 | tail -10`
Expected: installs `@napi-rs/cli`. If this fails with "package not found in workspace", Task 4 (workspace wiring) must run first — swap Task 3 Step 4 and Task 4 Step 1 order.

Then build:

Run: `pnpm --filter @paperclipai/skills-scanner-native build 2>&1 | tail -20`
Expected: `napi build` compiles the crate in release mode and produces `native/skills-scanner/skills-scanner.darwin-arm64.node` (on this dev machine). First run takes 30–90s.

- [ ] **Step 5: Smoke-test the binary from Node**

Run:

```bash
node -e "const m = require('/Users/kangnam/projects/paperclip-ko/native/skills-scanner'); if (!m) { console.error('NULL'); process.exit(1); } console.log(typeof m.scanWorkspaceSkillsAsync); m.scanWorkspaceSkillsAsync('co_smoke', '/Users/kangnam/projects/paperclip-ko').then(j => { const p = JSON.parse(j); console.log('skills:', p.skills.length, 'workspace_cwd:', p.workspace_cwd); }).catch(e => { console.error('ERR', e); process.exit(1); });"
```

Expected output:

```
function
skills: 11 workspace_cwd: /Users/kangnam/projects/paperclip-ko
```

(The skill count should match the Phase 1 bench number: `11 skills, 23 files` on this repo. If it's zero or very different, re-run `cargo test` — something broke between Phase 1 and now.)

- [ ] **Step 6: Commit**

```bash
git add native/skills-scanner/package.json native/skills-scanner/index.js native/skills-scanner/index.d.ts
git commit -m "$(cat <<'EOF'
feat(skills-scanner): add @paperclipai/skills-scanner-native npm package

Phase 2 step 3: package the napi-rs binary for consumption via pnpm
workspace.

- package.json: private workspace package with @napi-rs/cli build script.
- index.js: platform-aware loader that returns null on missing binary.
- index.d.ts: TS declarations for NativeSkillsScanner.

Smoke-tested on darwin-arm64: scanWorkspaceSkillsAsync returns the same
11 skills / 23 files observed in Phase 1 benchmark.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire into the pnpm workspace

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `server/package.json`

- [ ] **Step 1: Add the native package to `pnpm-workspace.yaml`**

Read the current file — it contains:

```yaml
packages:
  - packages/*
  - packages/adapters/*
  - packages/plugins/*
  - packages/plugins/examples/*
  - server
  - ui
  - cli
```

Add one line at the end (before any trailing blank line):

```yaml
  - native/skills-scanner
```

Final file:

```yaml
packages:
  - packages/*
  - packages/adapters/*
  - packages/plugins/*
  - packages/plugins/examples/*
  - server
  - ui
  - cli
  - native/skills-scanner
```

- [ ] **Step 2: Add the dependency to `server/package.json`**

Read the current file. In the `"dependencies"` block, insert `@paperclipai/skills-scanner-native` in alphabetical order — it goes right after `"@paperclipai/shared": "workspace:*",`. The replacement is:

Old:
```json
    "@paperclipai/shared": "workspace:*",
    "ajv": "^8.18.0",
```

New:
```json
    "@paperclipai/shared": "workspace:*",
    "@paperclipai/skills-scanner-native": "workspace:*",
    "ajv": "^8.18.0",
```

- [ ] **Step 3: Run `pnpm install`**

Run (from repo root): `pnpm install --no-frozen-lockfile 2>&1 | tail -20`
Expected:
- Picks up the new workspace member `native/skills-scanner`.
- Links `@paperclipai/skills-scanner-native` into `server/node_modules/`.
- Updates `pnpm-lock.yaml` with the new workspace project entry and `@napi-rs/cli` dev dep.

Verify the link:

```bash
ls -la /Users/kangnam/projects/paperclip-ko/server/node_modules/@paperclipai/skills-scanner-native
```

Expected: a symlink to `../../../native/skills-scanner`.

- [ ] **Step 4: Verify server typecheck still passes**

Run: `pnpm --filter @paperclipai/server typecheck 2>&1 | tail -20`
Expected: passes. No code uses the new dep yet, so this is a sanity check that the package shape is valid for TypeScript.

If typecheck complains about missing types for `@paperclipai/skills-scanner-native`: the `types` field in `native/skills-scanner/package.json` points to `index.d.ts` which must exist (created in Task 3 Step 3). Verify Task 3 landed cleanly before debugging.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml server/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(server): add @paperclipai/skills-scanner-native workspace dep

Phase 2 step 4: wire the native Rust scanner into the pnpm workspace
so server can import it. Native binary is still optional — consumers
fall back to TS when the .node file is missing.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Create the TypeScript adapter

**Files:**
- Create: `server/src/services/native-skills-scanner.ts`

This adapter is a thin layer that:
1. Loads the native module (or falls back to `null`).
2. Exports `isNativeSkillsScannerAvailable` so callers can branch.
3. Exports `scanWorkspaceSkillsNative(...)` that returns `ImportedSkill[]` mapped to the TS camelCase shape.
4. Handles the env-var opt-out (`PAPERCLIP_DISABLE_NATIVE_SKILLS=1`).
5. Logs the "native skills scanner loaded" line once on startup.

- [ ] **Step 1: Create the adapter file**

```typescript
// server/src/services/native-skills-scanner.ts

/**
 * Adapter for the Rust-backed skills scanner.
 *
 * Wraps `@paperclipai/skills-scanner-native` (native/skills-scanner in
 * the pnpm workspace) and maps its snake_case JSON output to the
 * internal camelCase `ImportedSkill` shape used by company-skills.ts.
 *
 * If the native binary is unavailable (not built, unsupported
 * platform, or load failure), `isNativeSkillsScannerAvailable` is
 * false and callers must use the pure-TS fallback.
 *
 * Set `PAPERCLIP_DISABLE_NATIVE_SKILLS=1` to force the fallback even
 * when the binary is present (useful for A/B debugging).
 */

import nativeBinding from "@paperclipai/skills-scanner-native";
import type {
  CompanySkillCompatibility,
  CompanySkillFileInventoryEntry,
  CompanySkillSourceType,
  CompanySkillTrustLevel,
} from "@paperclipai/shared";

// ── Public types ──────────────────────────────────────────────────────────

export type NativeImportedSkill = {
  key: string;
  slug: string;
  name: string;
  description: string | null;
  markdown: string;
  packageDir?: string | null;
  sourceType: CompanySkillSourceType;
  sourceLocator: string | null;
  sourceRef: string | null;
  trustLevel: CompanySkillTrustLevel;
  compatibility: CompanySkillCompatibility;
  fileInventory: CompanySkillFileInventoryEntry[];
  metadata: Record<string, unknown> | null;
};

export type NativeWorkspaceScanResult = {
  workspaceCwd: string;
  skills: NativeImportedSkill[];
};

// ── Raw Rust JSON shape (snake_case) ──────────────────────────────────────

type RustFileInventoryEntry = {
  path: string;
  kind: CompanySkillFileInventoryEntry["kind"];
};

type RustImportedSkill = {
  key: string;
  slug: string;
  name: string;
  description: string | null;
  markdown: string;
  package_dir: string | null;
  source_type: CompanySkillSourceType;
  source_locator: string | null;
  source_ref: string | null;
  trust_level: CompanySkillTrustLevel;
  compatibility: CompanySkillCompatibility;
  file_inventory: RustFileInventoryEntry[];
  metadata: Record<string, unknown> | null;
};

type RustWorkspaceScanResult = {
  workspace_cwd: string;
  skills: RustImportedSkill[];
};

// ── Availability detection ────────────────────────────────────────────────

const disabledByEnv = process.env.PAPERCLIP_DISABLE_NATIVE_SKILLS === "1";

export const isNativeSkillsScannerAvailable: boolean =
  nativeBinding !== null && !disabledByEnv;

let startupLogged = false;
function logStartupOnce(): void {
  if (startupLogged) return;
  startupLogged = true;
  if (isNativeSkillsScannerAvailable) {
    // eslint-disable-next-line no-console
    console.info("[skills-scanner] native module active");
  } else if (disabledByEnv) {
    // eslint-disable-next-line no-console
    console.info(
      "[skills-scanner] native module disabled via PAPERCLIP_DISABLE_NATIVE_SKILLS=1 — using TS fallback",
    );
  } else {
    // eslint-disable-next-line no-console
    console.info(
      "[skills-scanner] native module not available — using TS fallback",
    );
  }
}

// ── Field mapping ─────────────────────────────────────────────────────────

function mapRustSkill(raw: RustImportedSkill): NativeImportedSkill {
  return {
    key: raw.key,
    slug: raw.slug,
    name: raw.name,
    description: raw.description,
    markdown: raw.markdown,
    packageDir: raw.package_dir,
    sourceType: raw.source_type,
    sourceLocator: raw.source_locator,
    sourceRef: raw.source_ref,
    trustLevel: raw.trust_level,
    compatibility: raw.compatibility,
    fileInventory: raw.file_inventory.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
    })),
    metadata: raw.metadata,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Scan a workspace using the native Rust module.
 *
 * Throws if the native module is unavailable — callers should check
 * `isNativeSkillsScannerAvailable` before calling this, and fall back
 * to the TS path on any thrown error.
 */
export async function scanWorkspaceSkillsNative(
  companyId: string,
  workspaceCwd: string,
): Promise<NativeWorkspaceScanResult> {
  logStartupOnce();

  if (!nativeBinding || disabledByEnv) {
    throw new Error(
      "native skills scanner unavailable (check isNativeSkillsScannerAvailable before calling)",
    );
  }

  const json = await nativeBinding.scanWorkspaceSkillsAsync(
    companyId,
    workspaceCwd,
  );
  const parsed = JSON.parse(json) as RustWorkspaceScanResult;

  return {
    workspaceCwd: parsed.workspace_cwd,
    skills: parsed.skills.map(mapRustSkill),
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @paperclipai/server typecheck 2>&1 | tail -20`
Expected: passes. The imports from `@paperclipai/shared` and `@paperclipai/skills-scanner-native` must both resolve.

If the adapter errors with "Module has no default export" on `@paperclipai/skills-scanner-native`: the `index.d.ts` from Task 3 uses both `export default nativeBinding` and `export = nativeBinding` for compat with both ESM and CJS default-import conventions. Verify `tsconfig.json` has `"esModuleInterop": true` and `"allowSyntheticDefaultImports": true` — if not, change the import to `import * as nativeBinding from "@paperclipai/skills-scanner-native"`.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/native-skills-scanner.ts
git commit -m "$(cat <<'EOF'
feat(server): add native-skills-scanner TS adapter

Phase 2 step 5: wraps @paperclipai/skills-scanner-native (Rust napi
module) and maps snake_case JSON -> camelCase ImportedSkill shape.

- isNativeSkillsScannerAvailable: true when the .node binary loaded.
- PAPERCLIP_DISABLE_NATIVE_SKILLS=1 forces the TS fallback for A/B.
- Logs one startup line about which path is active.
- scanWorkspaceSkillsNative throws when unavailable; callers must
  check the flag first and fall back to the TS scan loop on error.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Integrate into `company-skills.ts` with TS fallback

**Files:**
- Modify: `server/src/services/company-skills.ts`

This is the load-bearing task — the whole point of Phase 2. Read the full context of the existing loop before editing.

- [ ] **Step 1: Read the current scan loop**

Read `server/src/services/company-skills.ts` lines 1880–1925 (use Read tool with offset/limit). Confirm the code matches the snippet in the "Correctness debt" section at the top of this plan. If the code has drifted, stop and raise with the user — don't edit blindly.

- [ ] **Step 2: Add the import at the top of the file**

Find the existing imports block (~line 30). Add after the `agentService` import:

Old:
```typescript
import { agentService } from "./agents.js";
import { projectService } from "./projects.js";
import { secretService } from "./secrets.js";
```

New:
```typescript
import { agentService } from "./agents.js";
import { projectService } from "./projects.js";
import { secretService } from "./secrets.js";
import {
  isNativeSkillsScannerAvailable,
  scanWorkspaceSkillsNative,
  type NativeImportedSkill,
} from "./native-skills-scanner.js";
```

- [ ] **Step 3: Replace the scan loop body**

Locate the loop starting at line 1886:

```typescript
    for (const target of scanTargets) {
      scannedProjectIds.add(target.projectId);
      const directories = await discoverProjectWorkspaceSkillDirectories(target);

      for (const directory of directories) {
        discovered += 1;

        let nextSkill: ImportedSkill;
        try {
          nextSkill = await readLocalSkillImportFromDirectory(companyId, directory.skillDir, {
            inventoryMode: directory.inventoryMode,
            metadata: {
              sourceKind: "project_scan",
              projectId: target.projectId,
              projectName: target.projectName,
              workspaceId: target.workspaceId,
              workspaceName: target.workspaceName,
              workspaceCwd: target.workspaceCwd,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          skipped.push({
            projectId: target.projectId,
            projectName: target.projectName,
            workspaceId: target.workspaceId,
            workspaceName: target.workspaceName,
            path: directory.skillDir,
            reason: trackWarning(`Skipped ${directory.skillDir}: ${message}`),
          });
          continue;
        }

        // ... (downstream processing with nextSkill)
```

Replace the outer `for (const target of scanTargets)` block up to (but **not** including) `const normalizedSourceDir = normalizeSourceLocatorDirectory(nextSkill.sourceLocator);` with the following structure. The key insight: we need to keep the existing downstream processing (conflict detection, dedup, DB writes) but swap out how we *produce* the `nextSkill` values and `discovered` count.

The cleanest refactor is a helper that takes a `target` and returns `Array<{ nextSkill: ImportedSkill; directory: { skillDir: string; inventoryMode: LocalSkillInventoryMode } }>`. But that's intrusive. The minimal change is to keep the inner loop structure and just populate `directories`/`nextSkill` from either path.

Use this replacement — it preserves the exact structure from line 1886 onward, including the `for (const directory of directories)` loop:

```typescript
    for (const target of scanTargets) {
      scannedProjectIds.add(target.projectId);

      // Try the native Rust scanner first. On success, we get all
      // ImportedSkills for this workspace in one shot. On failure (or
      // when unavailable), fall back to the per-directory TS loop.
      let nativeSkills: NativeImportedSkill[] | null = null;
      if (isNativeSkillsScannerAvailable) {
        try {
          const result = await scanWorkspaceSkillsNative(
            companyId,
            target.workspaceCwd,
          );
          nativeSkills = result.skills;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          trackWarning(
            `[native-skills-scanner] ${target.workspaceCwd}: ${message}; falling back to TS`,
          );
          nativeSkills = null;
        }
      }

      if (nativeSkills !== null) {
        // Native fast path: we already have all skills for this workspace.
        for (const rawSkill of nativeSkills) {
          discovered += 1;

          // Merge project-scan metadata into what Rust produced
          // (Rust set sourceKind: "local_path"; we override).
          const nextSkill: ImportedSkill = {
            ...rawSkill,
            metadata: {
              ...(rawSkill.metadata ?? {}),
              sourceKind: "project_scan",
              projectId: target.projectId,
              projectName: target.projectName,
              workspaceId: target.workspaceId,
              workspaceName: target.workspaceName,
              workspaceCwd: target.workspaceCwd,
            },
          };

          await processDiscoveredSkill(nextSkill, target, nextSkill.sourceLocator ?? target.workspaceCwd);
        }
        continue;
      }

      // TS fallback path: original per-directory loop.
      const directories = await discoverProjectWorkspaceSkillDirectories(target);

      for (const directory of directories) {
        discovered += 1;

        let nextSkill: ImportedSkill;
        try {
          nextSkill = await readLocalSkillImportFromDirectory(companyId, directory.skillDir, {
            inventoryMode: directory.inventoryMode,
            metadata: {
              sourceKind: "project_scan",
              projectId: target.projectId,
              projectName: target.projectName,
              workspaceId: target.workspaceId,
              workspaceName: target.workspaceName,
              workspaceCwd: target.workspaceCwd,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          skipped.push({
            projectId: target.projectId,
            projectName: target.projectName,
            workspaceId: target.workspaceId,
            workspaceName: target.workspaceName,
            path: directory.skillDir,
            reason: trackWarning(`Skipped ${directory.skillDir}: ${message}`),
          });
          continue;
        }

        await processDiscoveredSkill(nextSkill, target, directory.skillDir);
      }
    }
```

Note: the helper `processDiscoveredSkill` does NOT exist yet — Step 4 creates it by extracting the existing downstream processing.

- [ ] **Step 4: Extract the downstream processing into `processDiscoveredSkill`**

The code that currently runs from `const normalizedSourceDir = normalizeSourceLocatorDirectory(...)` (line 1919) down to the end of the `for (const directory of directories)` loop (find the matching closing brace before `}` that ends the outer `for (const target of scanTargets)` loop) is the "downstream processing" that both the native and TS paths need.

Read that block carefully — it spans from line ~1919 through several hundred lines, including conflict detection, dedup, and DB operations on the enclosing scope's `acceptedByKey`, `acceptedBySourceDir`, `conflicts`, `skipped` arrays, etc.

Extract it into a helper function defined **inside** the enclosing function (so it closes over `companyId`, `acceptedByKey`, `acceptedBySourceDir`, `conflicts`, `skipped`, `trackWarning`, etc.) The signature:

```typescript
const processDiscoveredSkill = async (
  nextSkill: ImportedSkill,
  target: ScanTarget,
  originPath: string,
): Promise<void> => {
  const normalizedSourceDir = normalizeSourceLocatorDirectory(nextSkill.sourceLocator);
  // ... exact body from line 1919 through end of the inner for-loop ...
};
```

Where `originPath` replaces `directory.skillDir` inside the body (for error messages and the `path:` field in `skipped`/`conflicts` entries). In the native path, `originPath` is `nextSkill.sourceLocator ?? target.workspaceCwd`; in the TS path, it's `directory.skillDir`.

⚠️ **This is an invasive refactor**. Do it carefully:

1. Read the entire block from line 1919 to the end of the inner `for (const directory of directories)` loop. Identify every use of `directory.skillDir` and replace with `originPath`.
2. Identify every variable it closes over from the enclosing scope — make sure they're all accessible.
3. After extracting, the native path and TS path both call `processDiscoveredSkill(nextSkill, target, originPath)`.

If the block is too large or the closure surface is too complex, consider an alternative: pass the extracted block's dependencies as explicit arguments to the helper. That's uglier but safer.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @paperclipai/server typecheck 2>&1 | tail -30`
Expected: passes. If it fails with "ScanTarget not defined": find the inferred type of `target` from the `scanTargets` array above (it's declared around line 1876) and either name it explicitly or use `typeof scanTargets[number]`.

- [ ] **Step 6: Run the existing company-skills tests**

Run: `pnpm --filter @paperclipai/server test:run -- company-skills 2>&1 | tail -40`
Expected: all 3 tests in `server/src/__tests__/company-skills.test.ts` pass. These tests exercise the TS fallback path (they don't load the native module), so this validates that the refactor didn't break the existing code.

If a test fails with a timeout or unexpected output, the refactor broke a closure dependency — re-read the extracted block and check for missing variables.

- [ ] **Step 7: Smoke test against the TS fallback**

With `PAPERCLIP_DISABLE_NATIVE_SKILLS=1` set, start the server dev mode:

```bash
cd /Users/kangnam/projects/paperclip-ko && PAPERCLIP_DISABLE_NATIVE_SKILLS=1 pnpm --filter @paperclipai/server dev 2>&1 | head -40
```

Expected: in the startup logs, you should see:
```
[skills-scanner] native module disabled via PAPERCLIP_DISABLE_NATIVE_SKILLS=1 — using TS fallback
```

Stop the server with `Ctrl+C` after it prints the startup banner. We're just checking the fallback path loads.

- [ ] **Step 8: Smoke test against the native path**

Without the env var:

```bash
cd /Users/kangnam/projects/paperclip-ko && pnpm --filter @paperclipai/server dev 2>&1 | head -40
```

Expected:
```
[skills-scanner] native module active
```

Stop the server.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/company-skills.ts
git commit -m "$(cat <<'EOF'
feat(server): use native Rust skills scanner with TS fallback

Phase 2 step 6: company-skills.ts scanProjectWorkspaces now calls
scanWorkspaceSkillsNative when available, falling back to the
per-directory TS loop (discoverProjectWorkspaceSkillDirectories +
readLocalSkillImportFromDirectory) otherwise.

- Project-scan metadata (sourceKind, projectId, workspaceId, etc.) is
  merged into each skill's metadata in TS after the Rust call, matching
  the existing TS call-site semantics.
- Extracted the downstream processing into a processDiscoveredSkill
  helper so both paths share the dedup/conflict/DB logic.
- PAPERCLIP_DISABLE_NATIVE_SKILLS=1 forces the fallback for A/B debug.
- Errors from the native path are logged via trackWarning and the code
  falls back to TS for that target — workspace-level failures never
  kill the scan.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck across the repo**

Run: `pnpm -r typecheck 2>&1 | tail -40`
Expected: passes for all workspaces. No TypeScript errors introduced in any package.

- [ ] **Step 2: Full test suite**

Run: `pnpm test:run 2>&1 | tail -60`
Expected: all tests pass. The test runner doesn't load the native binary (integration tests exercise the TS path via jsdom/mocks), so this validates the fallback is intact.

- [ ] **Step 3: Rust tests**

Run: `cd /Users/kangnam/projects/paperclip-ko/native/skills-scanner && cargo test 2>&1 | tail -20`
Expected: all 19 tests pass (16 unit + 3 parity).

- [ ] **Step 4: Rust benchmark comparison**

Run: `cd /Users/kangnam/projects/paperclip-ko/native/skills-scanner && cargo run --release --bin scan_bench -- /Users/kangnam/projects/paperclip-ko --iters 20 2>&1`
Expected: same numbers as Phase 1 (11 skills, 23 files, ~1.1ms mean). Record the number.

- [ ] **Step 5: Native vs TS comparison (manual)**

Start the server in dev mode with native enabled, hit a heartbeat endpoint, note the scan duration. Then restart with `PAPERCLIP_DISABLE_NATIVE_SKILLS=1` and repeat. Record both numbers in the commit message or a comment. This is the payoff measurement for Phase 2.

No commit for this task — it's verification only. If all checks pass, Phase 2 is complete.

---

## Deferred to Phase 3

Not in this plan — listed so they don't get re-invented:

- **CI native binary build.** Add `cargo build --release` step to `.github/workflows/release.yml` (all 4 job sections: verify_canary, publish_canary, verify_stable, publish_stable). For now, Linux CI runs with `isNativeSkillsScannerAvailable = false` and uses the TS fallback — tests still pass.
- **Multi-platform release matrix.** Build `skills-scanner.{linux-x64-gnu,linux-arm64-gnu,darwin-x64,darwin-arm64,win32-x64-msvc}.node` and publish them as optionalDependencies of a public `@paperclipai/skills-scanner-native` npm package.
- **Structured error reporting across the napi boundary.** Return `{ skills, skipped }` from Rust instead of just `skills[]`, so the TS integration can populate its `skipped[]` array with per-directory error details.
- **Heartbeat-wide scan caching.** The native module removes JS/TS overhead per scan, but doesn't address the "scan runs on every heartbeat" cost. A cache keyed on `(workspace_cwd, mtime-of-SKILL.md-set)` is a separate optimization.
- **Port of non-`local_path` source types.** `github`, `skills_sh`, `url` branches of `deriveCanonicalSkillKey` stay in TS for now; Rust Phase 2 only handles `local_path`.

---

## Self-review

After writing this plan, I went back through it checking:

1. **Spec coverage.** Every item in the "summary" context (napi-rs deps, build.rs, napi_exports.rs, package.json/index.js/index.d.ts, pnpm-workspace, server/package.json, TS adapter, company-skills integration, CI) is covered. CI is explicitly deferred with rationale — see "Deferred to Phase 3".
2. **Placeholder scan.** No "TBD" / "similar to above" / "add appropriate error handling" found. Task 6 Step 4 is the riskiest — it describes the extraction in prose rather than showing the full extracted code. This is deliberate: the block is ~80+ lines and its exact content depends on what's currently in `company-skills.ts`. The step tells the implementer to *read* the block first, then extract. If the implementer finds this under-specified, they should stop and ask rather than guess.
3. **Type consistency.** `NativeImportedSkill` (adapter output) is structurally assignable to the internal `ImportedSkill` type in company-skills.ts (both are Record-compatible). The `...rawSkill` spread in Task 6 Step 3 relies on this. If TypeScript rejects the spread at compile time, the fix is to explicitly construct each field in the mapping — the adapter's `mapRustSkill` already produces camelCase, so the cast should work.
4. **Reversibility.** Every task ends with a commit. If Phase 2 needs to be rolled back, any commit range can be reverted independently. The TS fallback path is preserved throughout, so even a partial rollback leaves the server running.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-04-11-phase2-napi-rs-integration.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
