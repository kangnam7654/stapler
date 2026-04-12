# Rust Migration — LLM Design Doc

## Purpose

Incrementally port Stapler's backend (server, DB, shared types, adapters) from
TypeScript/Node.js to Rust. UI remains React. The migration uses the Strangler
Fig pattern: routes transfer one-by-one from Express to Axum, validated by
shared E2E tests, until Express is fully retired.

**Completion criteria:**

- All `/api/*` routes served by a single Rust (Axum) binary
- React UI unchanged, consuming the same API contract
- `pnpm dev` starts the Rust server + Vite dev middleware
- CI runs `cargo test`, `cargo clippy`, existing E2E tests against Axum
- Express code and TS `packages/` (except UI) deleted

**Motivation:** performance (single binary, no V8 overhead), type + memory
safety (no runtime `any` surprises), long-term production readiness.

---

## Crate Structure

```
stapler/
├── Cargo.toml                  # [workspace] members = ["crates/*"]
├── rust-toolchain.toml         # pin stable channel
├── crates/
│   ├── shared/                 # ← packages/shared
│   │   └── src/lib.rs          #   domain types, validators, API path constants
│   ├── db/                     # ← packages/db
│   │   └── src/lib.rs          #   sqlx models, queries, migration runner
│   ├── adapter-utils/          # ← packages/adapter-utils
│   │   └── src/lib.rs          #   process spawn, env probe, hello probe
│   ├── adapters/               # ← packages/adapters/*
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── gemini.rs
│   │       ├── claude.rs
│   │       ├── codex.rs
│   │       ├── cursor.rs
│   │       ├── opencode.rs
│   │       ├── ollama.rs
│   │       ├── lm_studio.rs
│   │       ├── openai_compat.rs
│   │       └── pi.rs
│   └── server/                 # ← server/
│       └── src/
│           ├── main.rs         #   Axum entry, tower middleware
│           ├── routes/         #   route handlers
│           ├── services/       #   business logic
│           └── error.rs        #   unified error type
├── server/                     # existing Express (delete after Phase 3)
├── packages/                   # existing TS packages (delete after Phase 3)
└── ui/                         # React + Vite — unchanged
```

### TS → Rust package mapping

| TS package | Rust crate | Notes |
|---|---|---|
| `packages/shared` | `crates/shared` | Types, validators, constants. Truth source for TS types via `ts-rs`. |
| `packages/db` | `crates/db` | sqlx against same Postgres. Drizzle migrations kept until Phase 3. |
| `packages/adapter-utils` | `crates/adapter-utils` | `tokio::process` spawn, env check, probe logic. |
| `packages/adapters/*` | `crates/adapters` (multi-module) | One module per adapter. |
| `server/` | `crates/server` | Axum routes + services. |

---

## Tooling Decisions

| Role | Library | Rationale |
|---|---|---|
| Web framework | `axum` | tokio ecosystem standard, tower middleware compatible |
| DB | `sqlx` | async, compile-time query checking, native Postgres |
| Serialization | `serde` + `serde_json` | de facto standard |
| TS type generation | `ts-rs` | `#[derive(TS)]` on Rust structs → `.ts` type files for UI |
| CLI process mgmt | `tokio::process` | adapters spawn CLI subprocesses |
| HTTP client | `reqwest` | for HTTP-based adapters (Ollama, LM Studio, OpenAI compat) |
| Validation | `validator` | derive-macro input validation |
| Error handling | `thiserror` (libs) + `anyhow` (app) | typed errors in crates, ergonomic in server |
| Auth (JWT) | `jsonwebtoken` | agent API key verification |
| Logging | `tracing` + `tracing-subscriber` | structured, async-aware logging |
| Migration CLI | `sqlx-cli` | `sqlx migrate run` (Phase 3 migration ownership transfer) |

### TS ↔ Rust type sync

```
crates/shared/src/types.rs
    │
    ├─ #[derive(Serialize, Deserialize, TS)]
    │
    └─ build script or `cargo test` generates:
       → packages/shared/src/generated/rust-types.ts
       → React UI imports from generated types
```

Rust structs are the single source of truth. `ts-rs` generates TypeScript
interfaces. UI imports from `packages/shared/src/generated/rust-types.ts`.
Any struct change in Rust breaks the TS build if the UI contract drifts.

---

## Migration Phases

### Phase 0 — Foundation Setup

Prerequisite work before any business logic is ported.

1. Initialize Cargo workspace at repo root:
   - `Cargo.toml` with `[workspace] members = ["crates/*"]`
   - `rust-toolchain.toml` pinning stable channel
   - `.cargo/config.toml` for build settings
2. Scaffold `crates/shared` as an empty crate with a single passing test.
3. Add Rust CI job to `.github/workflows/pr.yml`:
   - `cargo check --workspace`
   - `cargo test --workspace`
   - `cargo clippy --workspace -- -D warnings`
4. Parameterize existing E2E tests by `BASE_URL`:
   - Currently hardcoded to `http://localhost:3100`
   - Extract to env var so the same suite can run against Express (`:3100`)
     or Axum (`:3200`) during transition
5. Add `check:models` script (the original request that started this
   conversation) as the first Rust binary:
   - `crates/check-models/src/main.rs` — reads `adapter-models.json`,
     probes each installed CLI, prints colored terminal table
   - `scripts/extract-adapter-models.ts` exports model lists to JSON
   - `pnpm check:models` runs extract → cargo run

**Exit criteria:** `cargo check` and `cargo test` pass in CI. E2E tests accept
a configurable `BASE_URL`.

### Phase 1 — shared + db (dependency-free base layers)

Port the lowest layers that have no intra-project dependencies.

#### 1a. crates/shared

Port from `packages/shared`:

- Domain types: `Company`, `Agent`, `Task`, `Issue`, `Activity`, `Budget`, etc.
- API path constants (e.g., `/api/companies`, `/api/agents/:id`)
- Validators (company name length, budget constraints, etc.)
- Enums: task status, issue status, agent role, adapter type
- All types derive `Serialize`, `Deserialize`, `TS`
- Run `ts-rs` generation → verify UI still compiles against generated types

#### 1b. crates/db

Port from `packages/db`:

- sqlx model structs matching existing Drizzle schema 1:1
- CRUD query functions per table (`create_company`, `get_company`, `list_companies`, etc.)
- Connection pool setup (sqlx `PgPool`)
- **Do not** migrate Drizzle migrations yet — sqlx reads/writes against the
  existing schema that Drizzle manages
- Integration tests against real Postgres (dev PGlite instance)

**Exit criteria:** `crates/shared` and `crates/db` compile, tests pass.
UI compiles with `ts-rs`-generated types.

### Phase 2 — adapters + server (route-by-route transfer)

#### 2a. crates/adapter-utils + crates/adapters

Port from `packages/adapter-utils` and `packages/adapters/*`:

- `adapter-utils`: process spawn with timeout/grace, env probe, path
  resolution, hello probe protocol
- `adapters`: one module per adapter type
  - Each module exports: `test_environment()`, `execute()`, `models()`, `session_codec()`
  - CLI adapters use `tokio::process::Command`
  - HTTP adapters (Ollama, LM Studio) use `reqwest`

#### 2b. crates/server (Axum)

Port from `server/`:

- Axum router with tower middleware (CORS, logging, auth, error handling)
- Transfer routes **one at a time**, simplest first:

```
Transfer order (by dependency depth):

 1. GET  /api/health
 2. CRUD /api/companies
 3. CRUD /api/companies/:id/agents
 4. CRUD /api/companies/:id/tasks
 5. CRUD /api/companies/:id/issues
 6.      /api/companies/:id/issues/:id/checkout (atomic checkout)
 7. CRUD /api/companies/:id/activity
 8. CRUD /api/companies/:id/budget
 9.      /api/companies/:id/agents/:id/execute (adapter invocation)
10.      /api/companies/:id/agents/:id/test (env test)
11. Agent auth routes (bearer key validation)
12. Remaining routes (secrets, plugins, config, etc.)
```

#### Per-route transfer protocol

For each route being transferred:

```
1. Implement route handler in crates/server
2. Write Rust unit test for the handler
3. Start Axum on :3200
4. Run E2E test suite with BASE_URL=http://localhost:3200
   - The specific route's tests must pass
5. Confirm Express E2E still passes (no regression)
6. Mark route as transferred
```

During transition, two servers coexist:
- Express on `:3100` (serves all routes, including transferred ones for safety)
- Axum on `:3200` (serves only transferred routes, 404 for others)

No proxying needed — both servers run independently, E2E validates both.
Switch happens at the end of Phase 2 when Axum serves all routes.

**Exit criteria:** All API routes served by Axum. E2E test suite fully passes
against `:3200`. Express is functionally redundant.

### Phase 3 — Cleanup + Migration Ownership Transfer

1. **Migration ownership:** Convert Drizzle migrations to sqlx format.
   `sqlx migrate run` becomes the canonical migration command.
   Delete `packages/db/drizzle.config.ts` and related Drizzle deps.
2. **Delete Express:** Remove `server/` directory.
3. **Delete TS packages:** Remove `packages/shared`, `packages/db`,
   `packages/adapter-utils`, `packages/adapters/*` (only after UI is
   confirmed to work with `ts-rs`-generated types).
4. **Update dev-runner:** `pnpm dev` starts Axum server + Vite dev middleware.
   Either Axum serves the Vite proxy itself, or a thin `scripts/dev-runner`
   orchestrates both processes.
5. **Update Dockerfile:** Multi-stage build with Rust compile stage.
6. **Update CI:** Remove TS-only jobs that are no longer relevant.

**Exit criteria:** No TS backend code remains. `pnpm dev`, `pnpm build`,
`cargo test`, E2E all pass. Docker image builds and runs.

---

## Constraints

1. **API contract must not change.** Request/response shapes, status codes,
   error formats stay identical. The React UI must work unmodified against
   the Rust server.
2. **Company scoping invariant preserved.** Every domain entity scoped to
   a company. Rust route handlers enforce company boundaries.
3. **Single-assignee task model, atomic checkout, approval gates, budget
   hard-stop** — all control-plane invariants from `doc/SPEC-implementation.md`
   must be preserved in Rust implementations.
4. **Activity logging for mutations.** Every mutating route writes an
   activity log entry, same as the Express implementation.
5. **No big-bang switch.** At no point should the system be in a state
   where neither Express nor Axum can serve all routes.
6. **E2E is the parity oracle.** A route is not "transferred" until the
   existing E2E test passes against the Axum server.

---

## Decisions

- **Axum over Actix-web**: Axum integrates naturally with the tokio/tower
  ecosystem. Actix uses its own runtime. Axum's middleware model (tower
  layers) is more composable. Rejected: Actix-web (own runtime, less
  composable middleware).
- **sqlx over Diesel**: sqlx does compile-time query checking without a
  DSL, closer to raw SQL. Diesel's DSL is powerful but adds learning
  curve and macro complexity. Rejected: Diesel (heavier DSL, less
  transparent SQL), sea-orm (ORM abstractions we don't need).
- **ts-rs over manual type sync**: Automated generation eliminates drift.
  Manual sync would inevitably diverge. Rejected: OpenAPI codegen
  (heavier toolchain for internal types), manual dual-maintenance.
- **Strangler Fig over full rewrite**: Incremental transfer with per-route
  validation is safer than a parallel full rewrite. Rejected: napi-rs
  bridge (two languages in one process, complexity explosion), full
  rewrite (no incremental validation possible).
