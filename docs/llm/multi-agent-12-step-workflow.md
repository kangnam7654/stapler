# Multi-Agent 12-Step Workflow (Prompt-Only Implementation)

**Status:** Design (path A, prompt-only) — v2 after brainstorming
**Authored:** 2026-04-20 / revised 2026-04-21
**Scope:** `server/src/onboarding-assets/**` only — no DB/API/code changes.

## Purpose

Define the operational playbook for an end-to-end multi-agent flow:

1. User creates a top-level (Epic) issue.
2. CEO recognizes the Epic and picks an org-shape-aware routing mode.
3. CEO delegates to domain C-Levels (CTO, CMO, CFO, CHRO, …).
4. Each C-Level claims, plans, and decomposes.
5. C-Level hires a worker agent if none exists, via a structured handshake whose length depends on org shape.
6. Worker breaks the plan into child issues.
7. Worker executes child issues.
8. Worker reports back to its C-Level.
9. C-Level reviews; rejection loops re-trigger the worker.
10. (covered by 9.)
11. C-Level reports up to CEO.
12. CEO posts a synthesis comment on the original Epic and flips its status to `in_review` so the human user can be the final closer.

Most of the 12 steps are already documented across `ceo/HEARTBEAT.md`, `company-docs/WORKFLOW-CEO.md`, and `company-docs/WORKFLOW-EXEC.md`. This design fills two gaps — the **hiring handshake** and the **worker plan-decomposition rule** — and tightens five existing files so the full chain is unambiguous.

## Constraints

- **No DB schema change.** No new tables, columns, or enums.
- **No new HTTP routes.** Only existing endpoints (`/api/companies/{id}/issues`, `/api/delegations`, `/api/companies/{id}/agents/{id}/messages`, `/api/companies/{id}/agent-hires`).
- **No new approval types.** Reuse `hire_agent` approval and the existing `request` / `report` / `delegation` message types.
- **Delivery is markdown edits to onboarding-assets.** Five existing files boosted, one new file added.
- **Stapler "unopinionated" principle.** Workflow lives in prompts, not in the runtime; users can override per-company by editing onboarding assets.

## Org-Shape Branching

Before each hire and at each major decision (Epic receipt, hire trigger, rework escalation), CEO and C-Levels inspect org shape via `GET /api/companies/{id}/agents?status=active` and select one of three modes:

| Mode | Trigger | Behavior |
|---|---|---|
| **Full** | CEO + at least one CHRO + at least one domain C-Level | 12-step flow with **5-turn hire** |
| **CHRO-collapsed** | CEO + domain C-Level, **no active CHRO** | 12-step flow with **3-turn hire** (CEO substitutes for CHRO; turns 4–5 collapse because they would be the same agent) |
| **CEO-only** | CEO only, no active domain C-Level | 12-step flow does **not apply**. CEO works the Epic directly. If a worker is needed, CEO drafts the system prompt, decides solo, hires, and collaborates one-on-one. |

**Mode is dynamic, not frozen.** At Epic start, CEO records the initial mode in its first comment on the Epic. Subsequent steps (next hire, next report, next reject) re-read `GET /api/companies/{id}/agents?status=active` and switch mode if org shape has changed. Already-completed steps are not redone when mode flips — only upcoming ones use the new mode.

## File Changes

| File | Action | Goal |
|---|---|---|
| `server/src/onboarding-assets/company-docs/WORKFLOW-HIRING.md` | **NEW** | Define the 5-turn handshake, the CHRO-collapsed 3-turn variant, the CEO-only solo path, out-of-domain critic selection, concurrent-hire consolidation, and reject-loop policy. |
| `server/src/onboarding-assets/ceo/HEARTBEAT.md` | EDIT §6 (Delegation) | Replace the bare "Use `paperclip-create-agent` skill" line with: "If you need a worker, follow `company-docs/WORKFLOW-HIRING.md`. Determine org-shape mode first via `GET /api/companies/{id}/agents?status=active`." |
| `server/src/onboarding-assets/c-level/AGENTS.md` | EDIT | Add `WORKFLOW-HIRING.md` to Required Reading. Add Core Rule: "If your plan requires a worker that does not exist, do not hire directly — start the WORKFLOW-HIRING handshake by sending a `request` to CHRO (or to CEO if CHRO is absent)." |
| `server/src/onboarding-assets/default/AGENTS.md` | EDIT | Add Core Rules: multi-step decomposition into child issues; depends-on as `blocked` + unblock-on-completion; out-of-skill escalation; non-dependency blocker handling. |
| `server/src/onboarding-assets/company-docs/WORKFLOW-CEO.md` | EDIT | Insert new section "Org-Shape Branching" before "Delegation Routing". Update "Reporting to Board" to require CEO to post a synthesis comment on the Epic and set its status to `in_review`, not `done`. |
| `server/src/onboarding-assets/company-docs/WORKFLOW-EXEC.md` | EDIT | Add to "Receiving Delegation": "If your plan requires a worker that doesn't exist, trigger `WORKFLOW-HIRING.md` before delegating further." Expand "Managing Workers" with explicit reject-message format, reopen-vs-new-issue policy, and 3-rejection escalation. |

## The Hiring Handshake (Detail)

### Trigger Condition

Domain C-Level (call them `D`) is in the middle of decomposing a plan and identifies a worker role `R` (e.g., `engineer`, `writer`, `designer`) that the plan needs.

`D` first checks `GET /api/companies/{id}/agents?role=R&status=active`. If any active agent with role `R` exists, `D` reuses that agent — no hire. Only if none exists, `D` initiates the handshake.

### Out-of-Domain Hire

If `D` needs a role whose natural critic is a different (missing) C-Level — e.g., CTO needs a designer with no CDO/CMO — CHRO picks a **best-fit C-Level** as critic on Turn 2. Best-fit heuristic:

1. Exact-role match: e.g., CMO critiques content hires, CTO critiques engineering hires.
2. Adjacent-role fallback: e.g., if CDO is absent, CMO critiques design; if CMO is absent, CTO critiques design.
3. If no plausible C-Level, CEO takes the critique role.

The requesting C-Level (`D`) is **not** automatically the critic unless they happen to be the best-fit for `R`. Asking the same person to both need and critique defeats the critique purpose.

### Concurrent Same-Role Requests

When CHRO's inbox contains two or more `request`s for the same role in the same heartbeat window, CHRO attempts consolidation before drafting:

1. CHRO sends a `direct` message to each requesting C-Level: "A hire for role `R` is already queued by <other C-Level> with scope <brief>. Share one worker?"
2. If **all** requesters reply OK → proceed with a single hire whose prompt accommodates both scopes.
3. If any requester declines → hire separately (one per requester). CHRO processes them sequentially to avoid Turn 2 confusion.
4. If a requester does not reply within one of CHRO's heartbeats → default to separate hires (do not block the others).

### Mode A — Full (5 turns)

| Turn | From → To | Type | Body |
|---|---|---|---|
| 1 | `D` → CHRO | `request` | Need worker. `role=R`, required skills/scope, originating `delegationId`. Do **not** include a suggested system prompt — CHRO drafts from scratch. |
| 2 | CHRO → critic | `request` | "Drafted system prompt: <prompt>. Critique please." Critic = `D` if in-domain, otherwise best-fit per §"Out-of-Domain Hire". |
| 3 | critic → CHRO | `report` | OK + suggested edits, OR reject with reasons. |
| 4 | CHRO → CEO | `request` | "Hire approval. role=R, final prompt, requesting C-Level=D, critic=<critic>, justification." |
| 5 | CEO → CHRO | `report` | OK, OR hold with reason. |

After Turn 5, CHRO actuates with `POST /api/companies/{companyId}/agent-hires`. Once the agent is created, CHRO sends a single `direct` message to `D` with the new `agentId` — nothing else. `D` is then responsible for issuing the first `delegation` to the new worker using its own plan context. CHRO stays out of the actual work.

### Mode B — CHRO-collapsed (3 turns)

CEO substitutes for CHRO. Turns 1–3 are identical to Mode A, swapping CHRO for CEO. Turns 4–5 collapse because CEO would be messaging itself. CEO actuates the hire directly, then sends `D` the `agentId`.

### Mode C — CEO-only (solo)

No handshake. CEO drafts the prompt, decides solo, hires, and treats the worker as a direct report.

### Reject Loops Inside Hiring

- **Turn 3 reject** (critic rejects CHRO's draft): CHRO redrafts and re-sends Turn 2. After **3 rejections of the same hire**, CHRO escalates by CC-ing CEO on the next Turn 2 `request`, asking CEO to arbitrate.
- **Turn 5 hold** (CEO holds): CHRO sends `direct` to `D` with the hold reason. `D` either reduces scope or proposes an alternative role and restarts at Turn 1.

## Worker Plan-Decomposition Rule (Detail)

When a worker (an agent loaded with the `default` onboarding persona — not CEO and not C-Level) receives a `delegation`, the body's `brief` field describes the work scope. The new rules in `default/AGENTS.md`:

### Multi-step decomposition

> If the `brief` enumerates more than one independent step, your first action after `claim` is to create one child issue per step under the delegation's `rootIssueId`. Use `POST /api/companies/{companyId}/issues` with `parentId=rootIssueId`. Assign each child to **yourself** by default. Then process child issues in priority order, not all at once. Comment on each child as you complete it. Only after all children are `done` may you `report` the parent delegation.
>
> When in doubt, decompose. A multi-step plan executed as a single blob defeats observability and re-work targeting.

### Recursive decomposition

> A child issue you own may itself still be multi-step. You are allowed to decompose recursively with **no fixed depth limit**. Apply the same rule at each level: if a child's scope has multiple independent steps, create grandchildren under it before executing. This lets refactoring/coding plans naturally fan out.

### Out-of-skill escalation

> If you determine that a child you created is outside your skill envelope (e.g., you're an engineer and the step requires visual design), do **not** try to execute it. Instead:
> 1. Flag the child: comment on it summarizing why it's out-of-scope.
> 2. Send a `report` to your delegating C-Level: "child `<issueId>` requires role `<X>` that I cannot fulfill; please reassign or hire."
> 3. Keep working on the children you can do.
>
> Workers do not trigger the hiring handshake themselves — that is a C-Level privilege.

### Dependencies between child issues

> When a child depends on another child's completion, record the dependency in the dependent child's description as the literal string `depends on #<parentChildIssueId>` on a line of its own. Set the dependent child's status to `blocked` at creation time.
>
> **Unblocking is the completing worker's responsibility.** When you set a child's status to `done`, scan the other children under the same `parentId` for `depends on #<yourIssueId>`. For each match, flip it from `blocked` to `todo` (or `in_progress` if you're about to start it). Do this in the same heartbeat.
>
> If you're not the owner of the dependent child (because decomposition tree crossed worker ownership), comment on the dependent child noting the completion; its owner will read the comment on their next heartbeat.

### Non-dependency blockers

> If you are stuck on a child for reasons outside dependencies (external API down, unclear spec, missing permission), and two heartbeats pass without progress:
> 1. Set the child's status to `blocked`.
> 2. Send a `request` to your delegating C-Level with concrete ask: "blocked on `<issueId>` because <reason>; need <specific help>."
> 3. Continue on other non-blocked children if any.

## Reject and Rework Policy

When a C-Level reviews a worker's `report` and the result is unsatisfactory, the C-Level decides between two mechanisms based on the nature of the problem. The rule lives in `WORKFLOW-EXEC.md`.

### Reopen the original child issue (for small defects)

When to use: typos, small bugs, minor polish, small spec misread.

1. C-Level flips the child's status from `done` back to `in_progress`.
2. C-Level adds a comment on the child describing exactly what to fix.
3. C-Level sends a `request` message to the worker: `{ issueId, rework reason, what must change }`.

History: the same issue accumulates multiple work cycles.

### Create a new corrective child issue (for significant deviations)

When to use: design errors, direction changes, misaligned output, overshoot.

1. C-Level keeps the original child as `done` (it's part of the historical trail).
2. C-Level creates a new child issue under the same parent titled `수정: <topic>` with concrete ask and assigns to the worker.
3. Normal flow resumes on the new child.

History: the parent accumulates multiple children, each immutable once closed.

### Rework limit

If the **same child issue** is reopened (or its corrective-successor is reopened/recycled) **3 times** and still unsatisfactory, the C-Level stops asking the same worker and:

1. Sends a `report` to CEO: "worker `<agentId>` failed 3 rework cycles on `<issueId>`. Requesting re-plan or alternative worker."
2. CEO decides: (a) reassign to a different existing worker with the same role, (b) trigger a new hire via the handshake, or (c) close the child and amend the plan.

The 3-cycle count is per-child, not per-worker — a worker who failed one child can still succeed on others.

## CEO → User Reporting (Detail)

When CEO receives the final `report` from the last C-Level for an Epic:

1. Synthesize all C-Level reports into a single comment on the Epic. Format: brief overview, bulleted list of completed child issues with issue-key links, any open follow-ups or known limitations.
2. `PATCH /api/issues/{epicId}` with `status: "in_review"`. Do **not** set `done` — the human user closes the Epic after verifying.
3. Post a `direct` message to any "board" agent if one exists; otherwise the user reads the Epic directly.

## Decisions and Rationale

| Decision | Choice | Rationale |
|---|---|---|
| Hire handshake length | 5 turns (D→CHRO→critic→CHRO→CEO→CHRO actuates) | User-selected. Separates drafter, critic, and approver roles. |
| CHRO fallback | CEO substitutes when CHRO absent | User-selected. Turns 4–5 collapse naturally. |
| Domain C-Level fallback | 12-step does not apply; CEO handles Epic directly | User-selected. Matches bootstrapping small-company reality. |
| Out-of-domain critic | Best-fit C-Level picked by CHRO; CEO as last resort | User-selected. Never uses the requester as its own critic. |
| Concurrent same-role hires | CHRO attempts consolidation via `direct` messages | User-selected. Minimizes worker sprawl when scopes overlap. |
| Post-hire bootstrap | CHRO hands off `agentId` only; requester delegates work | User-selected. Keeps CHRO as pure HR. |
| Recursive decomposition | Allowed, unlimited depth | User-selected. Natural for software tasks. |
| Dependencies between children | `blocked` status + `depends on #N` text convention; completing worker unblocks | User-selected. Requires no schema change. |
| Reopen vs new child on reject | Situational (C-Level judges: small→reopen, large→new) | User-selected. Trades strict immutability for flexibility. |
| Rework limit | 3 rejections per child → CEO escalation | User-selected. Prevents infinite loops; CEO is arbiter. |
| Mode transition mid-Epic | Dynamic: re-evaluate at each major step | User-selected. Prefers freshness over strict consistency. |
| Budget 80%+ mid-Epic | Apply existing HEARTBEAT rule (critical only) | User-selected. Avoids Epic-specific freeze complexity. |
| New schema or code? | None — prompts only | Path A. Preserves Stapler "unopinionated" principle. |
| Final Epic status | `in_review` (user closes) | Keeps humans as the last loop. |
| Worker decomposition trigger | "More than one independent step" in the brief | Soft rule; "when in doubt, decompose." |
| Out-of-skill escalation | Worker flags, reports to C-Level, does not self-hire | Keeps hiring privilege at C-Level. |
| Non-dependency blocker | 2-heartbeat silence → set `blocked` + `request` help | Visibility for stuck workers. |

## Verification Plan

Prompt changes can't be unit-tested for behavior. Verification has three layers.

### 1. Static checks (vitest, same pattern as existing `prompt-template.test.ts`)

New test file location: `server/src/onboarding-assets/__tests__/workflow-prompts.test.ts` (or similar — confirmed during planning phase).

Asserts:
- `WORKFLOW-HIRING.md` contains `5 turns`, `3 turns`, `CEO substitutes`, `agent-hires`, `best-fit`, `consolidation`, `depends on #`.
- `default/AGENTS.md` mentions `create child issues`, `parentId`, `depends on #`, `blocked`, `out-of-skill`.
- `WORKFLOW-CEO.md` contains `in_review` for Epic closure and `Org-Shape Branching`.
- `WORKFLOW-EXEC.md` contains `3 rework`, `reopen`, `corrective`.
- Every file in Required-Reading lists on CEO/C-Level/default exists on disk.

### 2. Smoke scenario (manual, run once before merge)

- Bootstrap a fresh company with CEO + CTO + CHRO + zero workers.
- Board user creates Epic: "샘플 회원가입 페이지 만들어줘".
- After one CEO heartbeat → expect delegation row CEO→CTO and CEO's first Epic comment mentioning "Mode: Full".
- After CTO heartbeat → expect Turn 1 message to CHRO.
- After CHRO heartbeat → expect Turn 2 message to CTO, then Turn 4 to CEO, then `agent_hires` row, then `direct` message to CTO with agentId.
- After CTO heartbeat (now worker exists) → expect delegation CTO→worker.
- After worker heartbeat → expect 1+ child issues under Epic, all with parentId=epic.
- After worker completes all children → expect CTO `report` to CEO; then CEO synthesis comment on Epic + Epic status `in_review`.

### 3. Regression scenarios (manual)

- **Mode C**: Fresh company with CEO only. Create Epic. Expect CEO comment "Mode: CEO-only", no 5-turn handshake, CEO hires worker solo, CEO works directly with worker.
- **Mode B**: Fresh company with CEO + CTO, no CHRO. Create Epic. Expect CEO comment "Mode: CHRO-collapsed", 3-turn handshake with CEO as drafter.
- **Rework loop**: During smoke run, manually reject first worker report twice. Expect reopen/new-issue path. Reject a third time — expect CTO report to CEO for escalation.

The verification gate is `pnpm test:run` (for static checks). No `pnpm typecheck` or `pnpm build` impact because no TS code is touched.

## Out of Scope

- Adding a `delegations.status` value for `rejected` (path B; deferred).
- Adding an `issues.type` enum for `epic` (path B; deferred — Epic-ness inferred from "no parent + assignee=CEO + creator=board user").
- Auto-notifying the board user on Epic completion (path B; deferred — relies on synthesis comment for now).
- Per-role onboarding files (`chro/AGENTS.md`, `cto/AGENTS.md`, …). Generic `c-level/AGENTS.md` carries all variations.
- Changing `paperclip-create-agent` skill behavior (it remains the underlying actuator).
- Server-side enforcement of the 3-rework limit or mode-detection correctness.

## Risks

| Risk | Mitigation |
|---|---|
| LLM ignores the playbook | Smoke test catches first-run failures; repeated violations are a signal to escalate that specific surface to path B (schema enforcement). |
| Mode-detection misclassification | WORKFLOW-HIRING.md explicitly requires `status=active` filter when counting agents. |
| Hiring loops | 3-rejection escalation (critique) + 3-rework escalation (execution). |
| Concurrent hire race | CHRO's consolidation step with explicit timeout (1 heartbeat). Default to separate hires on timeout. |
| Dependency deadlock | Workers re-scan for `depends on #N` on every heartbeat, not only on completion event. A blocked child that never unblocks will surface via non-dependency blocker rule (2 heartbeats silent → request help). |
| Mode transition mid-Epic surprises agents | CEO re-comments on the Epic each time mode changes, so later agents reading the Epic see the current mode. |
| Recursive decomposition runaway | Soft: "when in doubt, decompose" is offset by "when you realize it's too big for your skills, escalate." Worker cannot hire, only C-Level can, so the tree cannot grow staff recursively. |

## Next Step

After user review of this v2 design, transition to `superpowers:writing-plans` to produce a step-by-step implementation plan for the six file edits and the verification scaffolding.
