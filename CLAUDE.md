# Stapler — Agent Guide

> This file is read by Claude Code as `CLAUDE.md` and by Codex / Cursor / Aider
> as `AGENTS.md` (symbolic link). Sections §1–§10 are tool-agnostic. Claude Code
> specific content is isolated in §11–§12 and may be ignored by other tools.

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Stapler is a personal fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip)
maintained by [@kangnam7654](https://github.com/kangnam7654). It is a control plane for
AI-agent companies with Korean localization and additional local-model adapters (Ollama,
LM Studio). The current implementation target is V1 and is defined in
`doc/SPEC-implementation.md`.

Upstream is tracked via the `paperclipai` git remote for reference — do not push to it.
Internal identifiers (package names `@paperclipai/*`, env vars `PAPERCLIP_*`, data
directories `~/.paperclip/`) remain unchanged for upstream compatibility; the `stapler`
name only applies to the fork identity (repo name, README, this guide).

## 2. Read This First

Paperclip의 제품 비전·전략 문서는 wiki(`~/wiki/Projects/Stapler/`)에서 관리되며,
repo에는 V1 실행 contract와 운영 가이드만 남습니다.

Before making changes, read in this order:

**Wiki — evergreen 전략 (제품 정체성, upstream 공유):**
1. `~/wiki/Projects/Stapler/Goal.md` — 장기 비전 (autonomous economy backbone)
2. `~/wiki/Projects/Stapler/Product.md` — 제품 정의 + 설계 원칙
3. `~/wiki/Projects/Stapler/Spec.md` — 전체 기술 스펙 (long-horizon)

**Repo — code-coupled 실행:**
4. `doc/SPEC-implementation.md` — V1 구체 build contract (실행 중 변경됨)
5. `doc/DEVELOPING.md` — 개발 환경
6. `doc/DATABASE.md` — DB 운영

참고 wiki 문서: `[[Cliphub]]` (V1 이후 레지스트리 비전), `[[MemoryLandscape]]`
(메모리 서베이), `[[Philosophy]]` (fork 운영 철학), `[[Architecture]]` (2계층),
`[[DatabaseSchema]]` (물리 모델), `[[RustPorting]]` (native 포팅 로드맵).

Wiki 접근 전 세션당 1회: `git -C ~/wiki pull --rebase` (global CLAUDE.md NEVER #11).

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational docs (V1 build contract, DB ops, deployment modes). 제품 비전은 wiki로 이관됨.

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `~/wiki/Projects/Stapler/Spec.md` (upstream
long-horizon) and `doc/SPEC-implementation.md` (fork V1 실행) aligned — wiki는
evergreen, repo는 code-coupled. 스펙 변경 시 wiki 커밋도 함께 생성.

5. Keep plan docs dated and centralized.
New plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change

## 11. Task → Skill/Agent Routing (Claude Code)

> This section is Claude Code specific. Codex and other AI tools reading this
> file as `AGENTS.md` may ignore it — the skill and agent names below belong to
> Claude Code's native skill system and the `Agent` subagent tool.

### 11.1 Phase-level (always check first)

Process skills override domain skills. Before starting any task, check whether
one of these phases applies.

| Situation | Invoke |
|---|---|
| Starting a new feature, component, or capability | `superpowers:brainstorming` — always first |
| Bug, test failure, or unexpected behavior | `superpowers:systematic-debugging` — before proposing fixes |
| Writing implementation code | `superpowers:test-driven-development` — tests first |
| About to claim "done" / "fixed" / "passing" | `superpowers:verification-before-completion` |
| Need to write a multi-step plan | `superpowers:writing-plans` (after brainstorming) |
| Executing a written plan | `superpowers:executing-plans` |
| Work complete, ready to merge / open PR | `superpowers:finishing-a-development-branch` |
| Risky work needs isolation | `superpowers:using-git-worktrees` |

### 11.2 Domain-level (paperclip-ko specific)

| Task | Skill | Agent | Ref |
|---|---|---|---|
| API endpoint (`server/`) | — | `backend-dev` → `code-reviewer` → `security-reviewer` (if auth/input) | §8 API+Auth, §5.2 contract sync |
| DB schema change (`packages/db/`) | `migration-advisor` | `database-reviewer` | §6 DB Workflow |
| Shared types / validators (`packages/shared/`) | — | `backend-dev` | §5.2 (all 4 layers) |
| UI component / page (`ui/`) | `design-guide` (project), `frontend-design` | `frontend-dev` → `ui-reviewer` | §9 UI + DesignGuide showcase |
| Adapter implementation (`packages/adapters/`) | — | `backend-dev` | — |
| Plugin package (`packages/plugins/`) | `paperclip-create-plugin` | — | — |
| New Paperclip agent (meta-level) | `paperclip-create-agent` | — | — |
| New Paperclip company package | `company-creator` | — | — |
| LLM design doc (`docs/llm/`) | `doc-loop` (LLM mode) | `doc-writer-llm` → `doc-critic` | global CLAUDE.md Design-First |
| Human doc (README, guides) | `doc-loop` (human mode) | `doc-writer-human` → `doc-critic` | — |
| Execution plan (`doc/plans/`) | `plan-loop` | `Plan`, `plan-critic` | §5.5 dated filename convention |
| Architecture decision (3+ files affected) | `architecture-loop` | `sys-architect` (ADR), `cto` | — |
| Code review after a major step | `code-review:code-review`, `superpowers:requesting-code-review` | `code-reviewer`, `advanced-code-reviewer` | §10 Definition of Done |
| Security review (auth, input, sensitive data) | — | `security-reviewer` (code), `ciso` (organizational) | §8 |
| Refactor / dead code cleanup | `code-simplifier:code-simplifier` | `refactor-cleaner` | — |
| TS / pnpm build error | — | `build-error-resolver` | §7 verification |
| E2E / UI test | `webapp-testing` | `e2e-runner`, `qa-engineer` | — |
| TDD unit or integration tests | `superpowers:test-driven-development` | `tdd-guide`, `qa-engineer` | §10 |
| Library docs lookup (React, Drizzle, shadcn, etc.) | `context7` | — | — |
| i18n / Korean localization | — | — | `docs/llm/i18n-korean-localization.md` |
| Broad codebase exploration | — | `Explore` (fast), `general-purpose` (deep) | — |

### 11.3 Note on the `paperclip` project skill

The project skill at `.claude/skills/paperclip` is **not** listed above. It is
for agents running inside Paperclip heartbeats (the runtime), calling the
control-plane API for assignments, checkouts, and comments. It is **not** for
Claude Code developing paperclip-ko itself. Exception: the Step 9 self-test
playbook in that skill may be referenced when validating the Paperclip app
locally.

## 12. Common Claude Code Workflows

Scenario-based playbooks. Each step ties to §11 routing and §1–§10 rules.

### 12.1 Add or modify an API endpoint

1. Read the relevant section of `doc/SPEC-implementation.md`.
2. New feature? Start with `superpowers:brainstorming` (global CLAUDE.md NEVER rule #5).
3. Write an LLM design doc at `docs/llm/{topic}.md`. Get user approval.
4. Delegate implementation to the `backend-dev` agent to ensure 4-layer contract
   sync (§5.2: `packages/db` → `packages/shared` → `server/` → `ui/`).
5. Apply company access checks and activity log entries (§8).
6. `superpowers:test-driven-development` — write unit and integration tests.
7. `code-reviewer` agent. If auth / input / sensitive data → also `security-reviewer`.
8. Run the Verification Gate (§7) under `superpowers:verification-before-completion`.

### 12.2 Add a DB schema change

1. `migration-advisor` skill — draft zero-downtime and rollback plan first.
2. Edit `packages/db/src/schema/*.ts`. Export new tables from
   `packages/db/src/schema/index.ts` (§6).
3. `pnpm db:generate` → `pnpm -r typecheck`.
4. `database-reviewer` agent reviews the generated SQL.
5. Propagate types and validators through `packages/shared` → `server/` → `ui/` (§5.2).
6. Tests: real DB (dev PGlite), never mocked — per global CLAUDE.md integration
   test rule.
7. Verification Gate.

### 12.3 Add a UI component or page

1. Read `.claude/skills/design-guide/SKILL.md` (project skill). Mandatory.
   Covers tokens, typography, status colors, composition patterns.
2. Check `ui/src/components/` for existing primitives before creating new ones.
3. `frontend-design` skill for visual polish.
4. `frontend-dev` agent for implementation.
5. Add any new reusable component to `ui/src/pages/DesignGuide.tsx` showcase
   (mandatory per the design-guide project skill).
6. `ui-reviewer` agent for visual quality check.
7. Verification Gate.

### 12.4 Write an LLM design doc

1. Location: `docs/llm/{topic}.md` (global CLAUDE.md Design-First rule).
2. Run `doc-loop` in LLM mode.
3. `doc-writer-llm` drafts → `doc-critic` scores.
4. Required sections: Purpose, File changes, Implementation order,
   Function/API signatures, Constraints, Decisions.
5. If DB schema is involved: include a Mermaid `erDiagram`.
6. Get user approval BEFORE writing any implementation code (NEVER rule #5).

### 12.5 Debug a failing test

1. `superpowers:systematic-debugging` FIRST. Do not propose fixes from memory.
2. Reproduce the failure locally. Confirm the hypothesis against real output.
3. Write a failing test that captures the bug (if one does not already exist).
4. Fix → re-run → all green.
5. Verification Gate.

### 12.6 Finish a development branch

1. `superpowers:verification-before-completion`.
2. Run the Verification Gate (§7): `pnpm -r typecheck && pnpm test:run && pnpm build`.
3. `superpowers:requesting-code-review` → `code-reviewer` agent.
4. `superpowers:finishing-a-development-branch` to merge or open a PR.
