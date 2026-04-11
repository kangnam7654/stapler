# Design Doc — Claude Code Skill/Agent Routing for paperclip-ko

- **Date**: 2026-04-10
- **Status**: Design (awaiting user approval)
- **Topic**: Enable active use of globally installed Claude Code skills and agents when working in paperclip-ko, by consolidating `AGENTS.md` into a `CLAUDE.md` primary file plus a compatibility symlink.
- **Primary reader**: the Claude Code session that will implement this change.

## 1. Purpose

Claude Code loads every skill in `~/.claude/skills/` and every agent in `~/.claude/agents/` into every session by default. In paperclip-ko this capability is largely wasted: the repo provides no project-level routing signals that map common tasks (API endpoint, DB schema change, UI component, etc.) to the appropriate skills/agents. The existing `AGENTS.md` contains good engineering guidance, but **Claude Code does not read `AGENTS.md` automatically** — it only reads `CLAUDE.md`. Result: Claude Code working in paperclip-ko operates without the repo's own rulebook or any skill routing hints.

This design consolidates `AGENTS.md` and `CLAUDE.md` into a single authoritative file with added skill/agent routing sections, using a filesystem symlink so the file is discoverable under both names.

### Completion criteria (verifiable)

1. `paperclip-ko/CLAUDE.md` exists at the repo root as a real file.
2. `paperclip-ko/AGENTS.md` exists as a symbolic link pointing at `CLAUDE.md`.
3. `file AGENTS.md` reports `symbolic link to CLAUDE.md`.
4. `git ls-files AGENTS.md CLAUDE.md` lists both entries; `git cat-file -p HEAD:AGENTS.md` resolves through the symlink (mode `120000`).
5. `cat CLAUDE.md` produces the full prior `AGENTS.md` content (sections §1–§10 unchanged) plus two new sections §11 and §12.
6. `CLAUDE.md` header line has been updated from `# AGENTS.md` to `# paperclip-ko — Agent Guide` with a dual-file note.
7. `pnpm -r typecheck && pnpm test:run && pnpm build` still passes — the symlink does not break any code path referencing `AGENTS.md` as a filename pattern.
8. Starting a new Claude Code session in `paperclip-ko` loads the routing cheat sheet automatically (verified by the session applying §11 routing on the first non-trivial task).

## 2. File changes

| Path | Change | Purpose |
|---|---|---|
| `AGENTS.md` | Renamed to `CLAUDE.md` via `git mv` (preserves git history), then replaced with a symbolic link pointing to `CLAUDE.md` | Establish a single source of truth; maintain compatibility with Codex / Cursor / Aider / other tools that expect `AGENTS.md` |
| `CLAUDE.md` | New real file (the former `AGENTS.md` content, header updated, sections §11 and §12 appended) | Authoritative agent / AI tooling guide for paperclip-ko |
| `docs/llm/claude-code-skills-routing.md` | This design doc (new) | Design-First gate artifact |

Net effect at the filesystem level after the change:

- `CLAUDE.md` exists as a regular file. Its content is the previous `AGENTS.md` §1–§10 carried over verbatim, with two edits: the top header line is revised (see §5) and two new sections §11 and §12 are appended (see §6, §7).
- `AGENTS.md` exists as a symbolic link pointing to `CLAUDE.md`. Reads and writes through `AGENTS.md` transparently resolve to `CLAUDE.md`.
- `docs/llm/claude-code-skills-routing.md` exists as this design doc.

Git-level summary (after commit): one rename (`AGENTS.md` → `CLAUDE.md`, regular file, with modifications inside), one new symlink at the old path (`AGENTS.md`, mode `120000`), and one new design doc.

## 3. Implementation order

All steps executed from the paperclip-ko repo root.

1. **Pre-flight check** — confirm working tree is clean or only contains unrelated changes. If the branch has uncommitted work, stash it or commit it first.
2. **Rename**: `git mv AGENTS.md CLAUDE.md` — this preserves file history under the new name.
3. **Symlink**: `ln -s CLAUDE.md AGENTS.md` — creates a relative symlink in the same directory.
4. **Track symlink**: `git add AGENTS.md` — git stores it as mode `120000` with the target path as blob content.
5. **Update header**: edit the first line of `CLAUDE.md` from `# AGENTS.md` to `# paperclip-ko — Agent Guide`, and insert the dual-file note blockquote immediately below the header (see §5 below for exact text).
6. **Append §11**: add the full `## 11. Task → Skill/Agent Routing (Claude Code)` section after the existing `## 10. Definition of Done`. Exact content is in §6 below.
7. **Append §12**: add the full `## 12. Common Claude Code Workflows` section after §11. Exact content is in §7 below.
8. **Verify symlink**: run `file AGENTS.md` — expect `symbolic link to CLAUDE.md`. Run `head -1 AGENTS.md` and `head -1 CLAUDE.md` — both must print `# paperclip-ko — Agent Guide`.
9. **Verify no runtime regression**: run `pnpm -r typecheck` (fast subset). Full verification gate (`pnpm -r typecheck && pnpm test:run && pnpm build`) is the responsibility of whoever executes the plan, not the design doc.
10. **Commit**: use a single commit titled `docs: consolidate AGENTS.md and CLAUDE.md with Claude Code routing` containing the renamed file, the new symlink, and this design doc.

## 4. Function / API signatures

**Not applicable.** This change is documentation + filesystem reorganization only. No functions, APIs, or runtime code are introduced or modified.

## 5. Exact header change

Replace the first line of the new `CLAUDE.md` file:

```diff
-# AGENTS.md
+# paperclip-ko — Agent Guide
+
+> This file is read by Claude Code as `CLAUDE.md` and by Codex / Cursor / Aider
+> as `AGENTS.md` (symbolic link). Sections §1–§10 are tool-agnostic. Claude Code
+> specific content is isolated in §11–§12 and may be ignored by other tools.

 Guidance for human and AI contributors working in this repository.
```

Only the top header line is replaced. The "Guidance for human..." line and everything below it are unchanged context.

## 6. Exact §11 content to append

```markdown
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
```

## 7. Exact §12 content to append

```markdown
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
```

## 8. Constraints

- **No content deletion.** All existing `AGENTS.md` sections (§1–§10) must be preserved verbatim except for the header line. Text, table formatting, and cross-references are unchanged.
- **Tool-agnostic §1–§10.** Do not mix Claude Code specific directives into sections §1–§10. All Claude Code specific content lives in §11 and §12.
- **Standard markdown only in §11 and §12.** Do not use `@import` syntax, frontmatter directives, or any Claude Code proprietary syntax inside the file — other tools read the same file and must not be confused by unknown directives.
- **No runtime impact.** paperclip-ko code references to `"AGENTS.md"` as a filename pattern (in `server/`, `ui/`, `scripts/`, `tests/`) must remain unaffected. All current references address agent-bundle AGENTS.md files, not the repo-root file — this was verified by grep before the design was approved.
- **git symlink tracking.** `git config core.symlinks` must resolve to `true` (or be unset, which defaults to `true` on macOS/Linux). Already confirmed for this repo.
- **Filename discoverability.** `AGENTS.md` filename must remain present at the repo root for Codex / Cursor / Aider conventions.
- **Implementation order is strict.** Step 2 (`git mv`) must precede step 3 (`ln -s`). If the symlink is created first, `git mv` will refuse to overwrite it and history will not be preserved.
- **No secondary CLAUDE.md files yet.** Per-subsystem `ui/CLAUDE.md`, `server/CLAUDE.md`, etc. are explicitly out of scope for this change (see §9).
- **No SessionStart hook.** Project-level `.claude/settings.json` hooks are out of scope for this change (see §9).

## 9. Out of scope

- Adding per-subsystem `CLAUDE.md` files (`ui/CLAUDE.md`, `server/CLAUDE.md`, `packages/db/CLAUDE.md`). Deferred until §11 routing proves insufficient in practice.
- Adding a project-level `.claude/settings.json` with a `SessionStart` hook. Deferred for the same reason; file-based routing should suffice.
- Modifying existing project skills at `.claude/skills/{paperclip,design-guide,company-creator}`. Out of scope — those skills stay as-is.
- Modifying the global `~/.claude/CLAUDE.md`. Out of scope — this change is strictly project-level.
- Any changes to Paperclip's runtime handling of agent-bundle `AGENTS.md` files in `server/src/services/agent-instructions.ts`, `company-portability.ts`, etc. Those code paths address a different concept (agent instruction bundles managed *by* Paperclip) and are left untouched.
- Adding or modifying tests, CI configuration, Docker images, or release scripts.

## 10. Decisions

### Chosen — Strategy Ⓒ: Symlink

`CLAUDE.md` is the real file containing all authoritative content (former `AGENTS.md` §1–§10 plus new §11 and §12). `AGENTS.md` is a symbolic link to `CLAUDE.md`.

Rationale:
- Claude Code reads `CLAUDE.md` natively — no `@import` trick, no proprietary directive, no split sources.
- Codex / Cursor / Aider read `AGENTS.md` and transparently receive the same content via the symlink; no workflow change for those tools.
- Single source of truth. One edit updates both paths.
- `git mv` preserves file history under the new name; git tracks symlinks natively (mode `120000`).
- No runtime code reads the repo-root `AGENTS.md`, verified by grep — the symlink is runtime-safe.

### Rejected — Strategy Ⓐ: Rename only, no symlink

Rename `AGENTS.md` to `CLAUDE.md` and delete `AGENTS.md`.

Why not: paperclip-ko explicitly supports multiple agent adapters (Claude, Codex, Cursor, Gemini, etc.) as a product feature. Removing `AGENTS.md` breaks the convention those tools rely on for their own engineering guidance when they operate on this repo. Hostile to the multi-adapter positioning of the product.

### Rejected — Strategy Ⓑ: Pointer file

Keep `AGENTS.md` as a short file containing `See CLAUDE.md` or equivalent.

Why not: Codex and similar tools do not chase cross-file references from `AGENTS.md`. They would read the pointer text, receive no guidance, and silently fall back to generic behavior.

### Rejected — `@import` inside CLAUDE.md

`CLAUDE.md` contains a single line `@AGENTS.md` plus Claude-specific additions; `AGENTS.md` remains the authoritative source.

Why not: `@import` is Claude Code specific syntax. It does not help the user's stated preference that CLAUDE.md be the primary file — it inverts the relationship, keeping `AGENTS.md` as the primary source. It also creates a dependency where `CLAUDE.md` is incomplete without `AGENTS.md`, failing as a standalone artifact.

### Rejected — Per-subsystem `CLAUDE.md` files

Put additional `CLAUDE.md` files at `ui/`, `server/`, `packages/db/`, etc.

Why not: premature optimization. A single root file is simpler to maintain and sufficient for the user's stated goal ("I just want Skills and Agents to be used"). Escalate only if the routing in §11 proves insufficient during real work.

### Rejected — Project-level `SessionStart` hook

Configure `.claude/settings.json` at the project level with a `SessionStart` hook that prints a reminder of relevant skills each session.

Why not: higher config surface area, harder to maintain, and redundant — Claude Code already auto-loads `CLAUDE.md` on every session. A static file achieves the same reminder effect with none of the runtime complexity.

Note: the Ⓐ / Ⓑ / Ⓒ labels above are the three *file layout* candidates (rename only / pointer file / symlink). They are distinct from the A / B / C "brainstorming approaches" earlier in the design conversation (single root `CLAUDE.md` / per-subsystem files / SessionStart hook). Do not conflate the two schemes.
