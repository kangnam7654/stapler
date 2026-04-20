# Multi-Agent 12-Step Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 12-step multi-agent workflow (Epic → CEO → C-Level → hire handshake → worker decomposition → report up → CEO synthesis) as prompt-only edits to `server/src/onboarding-assets/**`, with vitest regression guards on the prompt content.

**Architecture:** Six prompt files (1 new, 5 edited) encode the workflow. One new vitest file asserts that critical strings, references, and conventions are present in each prompt. No DB schema, HTTP routes, or runtime code changes.

**Tech Stack:** Markdown prompts + vitest (`*.test.ts`) running through workspace-level `pnpm test:run`. No TypeScript compilation touched.

---

## Reference: Spec

The authoritative spec is `docs/llm/multi-agent-12-step-workflow.md`. Any requirement discrepancy between this plan and that spec is a plan bug — fix the plan, not the spec.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/src/onboarding-assets/__tests__/workflow-prompts.test.ts` | **NEW** | Regression guards: each prompt file contains the strings the spec mandates. |
| `server/src/onboarding-assets/company-docs/WORKFLOW-HIRING.md` | **NEW** | Full hiring playbook (5-turn / 3-turn / solo variants, out-of-domain critic, consolidation, reject loops). |
| `server/src/onboarding-assets/ceo/HEARTBEAT.md` | EDIT §6 | Route to `WORKFLOW-HIRING.md` and require org-shape mode check. |
| `server/src/onboarding-assets/c-level/AGENTS.md` | EDIT | Add `WORKFLOW-HIRING.md` to Required Reading + core rule: never hire directly, start the handshake. |
| `server/src/onboarding-assets/default/AGENTS.md` | EDIT | Multi-step decomposition, recursion, `depends on #N` + `blocked`, out-of-skill escalation, non-dependency blockers. |
| `server/src/onboarding-assets/company-docs/WORKFLOW-CEO.md` | EDIT | Add "Org-Shape Branching" section; require Epic closure as `in_review` + synthesis comment. |
| `server/src/onboarding-assets/company-docs/WORKFLOW-EXEC.md` | EDIT | Trigger hire handshake when worker missing; explicit reject policy (reopen vs new corrective issue + 3-rework escalation). |

## Test Strategy

Prompt changes can't be behavior-tested. The vitest file is a **string-contract regression guard**: if someone rewords a prompt and deletes a mandated concept, the test fails.

Pattern follows the existing `packages/adapters/lm-studio-local/src/server/prompt-template.test.ts`. Use `readFileSync` + `expect(content).toContain("…")` / `.toMatch(/…/)`.

The test file is created **first** with all cases scaffolded and every case failing. Each subsequent task makes its slice pass. This gives true TDD rhythm for a markdown-editing task.

## Task ordering rationale

1. Test scaffold first (all red).
2. New playbook (`WORKFLOW-HIRING.md`) second — most other edits reference it.
3. `ceo/HEARTBEAT.md` third — smallest surgical edit that unblocks CEO flows.
4. `c-level/AGENTS.md` fourth — smallest surgical edit that unblocks C-Level flows.
5. `default/AGENTS.md` fifth — worker decomposition rules.
6. `WORKFLOW-CEO.md` sixth — CEO-side section.
7. `WORKFLOW-EXEC.md` seventh — C-Level-side section.
8. Final commit aggregates any follow-ups.

---

## Task 1: Bootstrap failing test file

**Files:**
- Create: `server/src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Sets up one `describe` block per prompt file. Each `it` block asserts a specific string the spec requires. All fail until their respective file is touched.

- [ ] **Step 1.1: Create the test file with scaffolded assertions**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, "..");

function read(relPath: string): string {
  const p = resolve(ASSETS, relPath);
  return readFileSync(p, "utf8");
}

describe("onboarding-assets/company-docs/WORKFLOW-HIRING.md", () => {
  const path = resolve(ASSETS, "company-docs/WORKFLOW-HIRING.md");

  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("defines the 5-turn and 3-turn variants plus CEO-only solo path", () => {
    const c = read("company-docs/WORKFLOW-HIRING.md");
    expect(c).toContain("5 turns");
    expect(c).toContain("3 turns");
    expect(c).toContain("CEO substitutes");
  });

  it("references the agent-hires endpoint and enforces active-only agent counting", () => {
    const c = read("company-docs/WORKFLOW-HIRING.md");
    expect(c).toContain("agent-hires");
    expect(c).toMatch(/status=active/);
  });

  it("defines best-fit critic selection for out-of-domain hires", () => {
    const c = read("company-docs/WORKFLOW-HIRING.md");
    expect(c).toContain("best-fit");
  });

  it("defines concurrent same-role consolidation", () => {
    const c = read("company-docs/WORKFLOW-HIRING.md");
    expect(c.toLowerCase()).toContain("consolidat");
  });

  it("defines the reject-loop cap inside hiring (3 rejections escalate to CEO)", () => {
    const c = read("company-docs/WORKFLOW-HIRING.md");
    expect(c).toMatch(/3\s+rejections?/);
  });
});

describe("onboarding-assets/ceo/HEARTBEAT.md", () => {
  it("§6 Delegation points at WORKFLOW-HIRING.md and requires org-shape check", () => {
    const c = read("ceo/HEARTBEAT.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
    expect(c).toMatch(/status=active/);
  });

  it("no longer carries the bare 'paperclip-create-agent skill' instruction", () => {
    const c = read("ceo/HEARTBEAT.md");
    // Bare recommendation removed; skill may still be mentioned as the underlying actuator but must be tied to WORKFLOW-HIRING.
    expect(c).not.toMatch(/^- Use `paperclip-create-agent` skill when hiring new agents\.$/m);
  });
});

describe("onboarding-assets/c-level/AGENTS.md", () => {
  it("requires WORKFLOW-HIRING.md and forbids direct hiring", () => {
    const c = read("c-level/AGENTS.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
    expect(c).toMatch(/do not hire directly/i);
  });
});

describe("onboarding-assets/default/AGENTS.md", () => {
  it("mandates child-issue decomposition with parentId", () => {
    const c = read("default/AGENTS.md");
    expect(c).toContain("parentId");
    expect(c.toLowerCase()).toContain("child issue");
  });

  it("defines the depends-on / blocked convention", () => {
    const c = read("default/AGENTS.md");
    expect(c).toContain("depends on #");
    expect(c).toContain("blocked");
  });

  it("requires out-of-skill escalation (worker does not self-hire)", () => {
    const c = read("default/AGENTS.md");
    expect(c.toLowerCase()).toContain("out-of-skill");
  });

  it("defines the 2-heartbeat non-dependency blocker rule", () => {
    const c = read("default/AGENTS.md");
    expect(c).toMatch(/two heartbeats|2 heartbeats/i);
  });
});

describe("onboarding-assets/company-docs/WORKFLOW-CEO.md", () => {
  it("adds Org-Shape Branching section before Delegation Routing", () => {
    const c = read("company-docs/WORKFLOW-CEO.md");
    expect(c).toContain("Org-Shape Branching");
    const orgIdx = c.indexOf("Org-Shape Branching");
    const delIdx = c.indexOf("Delegation Routing");
    expect(orgIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(-1);
    expect(orgIdx).toBeLessThan(delIdx);
  });

  it("requires Epic closure as in_review with a synthesis comment", () => {
    const c = read("company-docs/WORKFLOW-CEO.md");
    expect(c).toContain("in_review");
    expect(c.toLowerCase()).toContain("synthesis");
  });
});

describe("onboarding-assets/company-docs/WORKFLOW-EXEC.md", () => {
  it("triggers WORKFLOW-HIRING when a worker is missing", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
  });

  it("defines reopen vs corrective-issue policy", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c.toLowerCase()).toContain("reopen");
    expect(c.toLowerCase()).toContain("corrective");
  });

  it("defines 3-rework escalation to CEO", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c).toMatch(/3\s*rework/i);
  });
});

describe("required-reading cross-references", () => {
  // The `../../../docs/<name>.md` paths in c-level/AGENTS.md are runtime-resolved
  // by the agent framework, not simple filesystem paths. So we don't validate them
  // relative to the source tree. We only check that each document name mentioned in
  // Required Reading exists as a sibling in company-docs (where they live at build time).
  it("every Required Reading doc name mentioned in c-level/AGENTS.md exists in company-docs/", () => {
    const c = read("c-level/AGENTS.md");
    const readingBlock = c.split("## Required Reading")[1]?.split("## ")[0] ?? "";
    const names = [...readingBlock.matchAll(/([A-Z0-9_-]+\.md)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const candidate = resolve(ASSETS, "company-docs", name);
      expect(existsSync(candidate), `expected company-docs/${name} to exist`).toBe(true);
    }
  });
});
```

- [ ] **Step 1.2: Run the test file to confirm every case fails or errors cleanly**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: multiple FAIL lines — WORKFLOW-HIRING.md is missing, HEARTBEAT.md lacks WORKFLOW-HIRING reference, etc. The "required-reading cross-references" test may currently pass (existing files already match) — that's fine.

If the file is not picked up, verify the server vitest project includes `__tests__` paths (it does by default — vitest discovers any `*.test.ts`).

- [ ] **Step 1.3: Commit the failing test**

```bash
git add server/src/onboarding-assets/__tests__/workflow-prompts.test.ts
git commit -m "test(onboarding-assets): scaffold workflow prompt regression guards (failing)"
```

---

## Task 2: Create WORKFLOW-HIRING.md

**Files:**
- Create: `server/src/onboarding-assets/company-docs/WORKFLOW-HIRING.md`

This is the anchor document. Everything else references it.

- [ ] **Step 2.1: Create the file with the full playbook**

```markdown
# Hiring Workflow (WORKFLOW-HIRING)

C-Level 또는 CEO가 새 worker를 고용할 때 이 절차를 따른다. 이 문서는 `paperclip-create-agent` 스킬의 **외피(외적 프로토콜)**이며, 실제 액추에이션은 `POST /api/companies/{companyId}/agent-hires` + Board `hire_agent` approval을 사용한다.

## 0. Trigger

C-Level `D`가 계획을 분해하다가 기존에 없는 역할 `R`(예: `engineer`, `writer`, `designer`)의 worker가 필요하다고 판단한 경우에만 시작한다.

**먼저 재사용을 확인한다.** `GET /api/companies/{companyId}/agents?role=R&status=active`. `active`인 동일 역할 에이전트가 하나라도 있으면 신규 고용하지 않고 그 에이전트에 위임한다. 없을 때만 아래 절차로 진입한다.

Worker(`default` 페르소나)는 **절대** 직접 이 절차를 시작하지 않는다. 고용은 C-Level 권한이다. Worker가 역량 밖 작업을 맞닥뜨리면 `default/AGENTS.md`의 "out-of-skill escalation" 규칙에 따라 C-Level에 보고하는 것까지만 수행한다.

## 1. Org-Shape Mode 결정

고용을 개시하기 직전에 현재 조직 형태를 조회한다:

```
GET /api/companies/{companyId}/agents?status=active
```

응답에 따라 세 가지 모드 중 하나를 선택한다. **모드는 매 고용마다 다시 평가한다** — 한 Epic 처리 도중에도 조직이 변할 수 있다.

| Mode | Trigger | 절차 |
|---|---|---|
| **Full** | CEO + 최소 1명의 active CHRO + 최소 1명의 active 도메인 C-Level | 아래 §2 의 **5 turns** |
| **CHRO-collapsed** | CEO + active 도메인 C-Level, **active CHRO 없음** | 아래 §3 의 **3 turns** (CEO가 CHRO 역할 대행) |
| **CEO-only** | active 도메인 C-Level 없음 (CEO만) | 아래 §4 의 **solo**. 핸드셰이크 없음. |

## 2. Mode A — Full (5 turns)

| Turn | From → To | Message Type | Body |
|---|---|---|---|
| 1 | `D` → CHRO | `request` | `role=R`, 요구 역량과 범위, 원인 `delegationId`. **시스템 프롬프트 초안을 포함하지 않는다** — CHRO가 백지에서 초안을 쓴다. |
| 2 | CHRO → critic | `request` | "초안 프롬프트: `<prompt>`. 검토 요청." critic = `D`가 in-domain이면 `D`, 그렇지 않으면 §5의 best-fit. |
| 3 | critic → CHRO | `report` | OK + 제안, 또는 사유와 함께 reject. |
| 4 | CHRO → CEO | `request` | "고용 결재. `role=R`, 최종 프롬프트, 요청자=`D`, critic=`<critic>`, 근거." |
| 5 | CEO → CHRO | `report` | OK, 또는 사유와 함께 hold. |

Turn 5 OK 후 CHRO가 `POST /api/companies/{companyId}/agent-hires`로 액추에이트한다. 에이전트가 생성되면 CHRO는 `D`에게 `direct` 메시지로 **새 `agentId`만** 전달한다. 실제 작업 위임은 `D`가 자신의 계획 맥락에서 직접 보낸다. CHRO는 이후 관여하지 않는다.

## 3. Mode B — CHRO-collapsed (3 turns)

CEO가 CHRO 역할을 대행한다. Turn 1~3은 Mode A와 동일하되 "CHRO"를 "CEO"로 읽는다. Turn 4~5는 CEO가 자기 자신에게 결재를 올리는 것과 같아 **collapse**된다. Turn 3 이후 CEO가 바로 `POST /api/companies/{companyId}/agent-hires`를 수행하고 `D`에게 `agentId`를 `direct`로 전달한다.

## 4. Mode C — CEO-only (solo)

핸드셰이크 없음. CEO가:
1. 직접 프롬프트를 작성한다 (self-critic).
2. `POST /api/companies/{companyId}/agent-hires`로 액추에이트한다.
3. 새 에이전트를 자신의 직접 부하로 취급하고 바로 위임한다.

CEO-only는 부트스트랩 단계의 임시 상태로 간주한다. 조직이 성장하면 다음 고용부터 Mode A 또는 B로 복원된다.

## 5. Out-of-Domain Hire — Best-Fit Critic

`D`의 도메인이 `R`의 자연스러운 critic 도메인과 다르고, `R`의 자연 critic C-Level이 회사에 없을 때 적용한다. CHRO가 Turn 2에서 critic을 선택하는 규칙:

1. **정확 매칭**: `R`에 대응하는 C-Level (엔지니어 → CTO, 마케팅 콘텐츠 → CMO 등).
2. **인접 도메인 대체**: 정확 매칭 없으면 가장 가까운 도메인 (예: 디자이너인데 CDO 없음 → CMO, CMO도 없음 → CTO).
3. **최후**: 그럴듯한 C-Level이 없으면 CEO가 critic을 맡는다.

**요청자 `D`는 같은 역할의 자연 critic이 아니면 critic이 될 수 없다.** "필요한 사람이 검토하는" 구조는 critique의 목적을 무효화한다. CHRO는 critic 선정 사유를 Turn 2 메시지 본문에 남긴다.

## 6. Concurrent Same-Role Consolidation

CHRO 수신함에 같은 heartbeat 창에서 동일 `R`에 대한 `request`가 2개 이상 들어오면, 초안을 쓰기 전에 병합을 시도한다:

1. CHRO가 각 요청자 C-Level에게 `direct` 메시지 발송: "`R` 고용이 이미 `<다른 C-Level>`로부터 대기 중이며 범위는 `<요약>`. 한 명의 worker를 공유할 의향이 있는가?"
2. **모두 OK** → 범위를 모두 포용하는 단일 프롬프트로 1명만 고용.
3. **한 명이라도 거절** → 거절한 요청자는 별도 고용. CHRO는 순차 처리 (Turn 2의 혼란 방지).
4. **1 heartbeat 내 무응답** → 해당 요청자도 별도 고용 처리 (다른 요청자를 막지 않음).

## 7. Reject Loops Inside Hiring

- **Turn 3 critic reject**: CHRO가 재작성 후 Turn 2 재발송. **동일 고용에서 3 rejections 누적** 시 CHRO는 다음 Turn 2 `request`에 CEO를 CC하여 arbitration을 요청한다.
- **Turn 5 CEO hold**: CHRO가 `D`에게 `direct`로 hold 사유 전달. `D`는 범위를 줄이거나 다른 역할을 제안하여 Turn 1부터 재시작한다.

## 8. Budget Awareness

`ceo/HEARTBEAT.md`의 기존 규칙을 따른다: 회사 예산 사용률 80% 이상이면 critical한 고용만 진행한다. 이 문서는 Epic별 freeze 정책을 추가하지 않는다.

## 9. References

- Actuation 엔드포인트: `POST /api/companies/{companyId}/agent-hires` (기존).
- 조직 현황 조회: `GET /api/companies/{companyId}/agents?status=active`.
- Approval 타입: `hire_agent` (기존 — Board 승인 흐름 재사용).
- 설계 문서: `docs/llm/multi-agent-12-step-workflow.md`.
```

- [ ] **Step 2.2: Run the tests to confirm WORKFLOW-HIRING cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: the 6 `describe("…WORKFLOW-HIRING.md")` cases now PASS. Other tests (HEARTBEAT, c-level, default, etc.) still FAIL.

- [ ] **Step 2.3: Commit**

```bash
git add server/src/onboarding-assets/company-docs/WORKFLOW-HIRING.md
git commit -m "feat(onboarding-assets): add WORKFLOW-HIRING playbook"
```

---

## Task 3: Edit `ceo/HEARTBEAT.md` §6

**Files:**
- Modify: `server/src/onboarding-assets/ceo/HEARTBEAT.md` (§6 Delegation)

Current §6 lines 38–42:

```
## 6. Delegation

- Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`.
- Use `paperclip-create-agent` skill when hiring new agents.
- Assign work to the right agent for the job.
```

- [ ] **Step 3.1: Replace §6 so it routes through WORKFLOW-HIRING and requires an org-shape check**

Use Edit tool with `old_string`:

```
## 6. Delegation

- Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`.
- Use `paperclip-create-agent` skill when hiring new agents.
- Assign work to the right agent for the job.
```

and `new_string`:

```
## 6. Delegation

- Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`.
- Before hiring, determine org-shape mode: `GET /api/companies/{companyId}/agents?status=active`. Classify as Full / CHRO-collapsed / CEO-only and record the mode in your first comment on the Epic.
- If you need a new worker, follow `../company-docs/WORKFLOW-HIRING.md`. Do not call `paperclip-create-agent` directly — the skill is the underlying actuator, not the protocol.
- Assign work to the right agent for the job.
```

- [ ] **Step 3.2: Run the tests and confirm HEARTBEAT cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: the 2 `describe("…ceo/HEARTBEAT.md")` cases now PASS. The bare `paperclip-create-agent` line is no longer there.

- [ ] **Step 3.3: Commit**

```bash
git add server/src/onboarding-assets/ceo/HEARTBEAT.md
git commit -m "feat(onboarding-assets/ceo): route hiring through WORKFLOW-HIRING"
```

---

## Task 4: Edit `c-level/AGENTS.md`

**Files:**
- Modify: `server/src/onboarding-assets/c-level/AGENTS.md`

Current full file:

```
Always write all issue titles, descriptions, comments, and any user-facing text in Korean (한국어).

You are a C-Level executive at Paperclip company.

## Required Reading

Read before acting:
- `../../../docs/COMMUNICATION.md` — message API and communication rules
- `../../../docs/WORKFLOW-EXEC.md` — C-Level delegation and reporting workflow

## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Triage these alongside any active delegation.
- CEO delegation → read/claim `PAPERCLIP_DELEGATION_ID`, create issues or child delegations, split work aggressively, assign to workers, report back when done.
- Prefer parallel delegation over solo execution whenever a task can be broken into independent parts.
- If you can hand a piece to a worker, hand it off instead of doing it yourself.
- Work completes = issue comment (record) + delegation report to CEO (workflow state).
- Need help from another department = send `request` message to the relevant C-Level peer.
```

Path note: Required Reading uses `../../../docs/<name>.md`. At runtime, the onboarding assets sit under `server/src/onboarding-assets/c-level/AGENTS.md`, and those `../../../docs/` references resolve to `server/src/onboarding-assets/company-docs/<name>` via the onboarding asset copier. WORKFLOW-HIRING.md lives in `company-docs/`, so its Required Reading reference uses the same `../../../docs/WORKFLOW-HIRING.md` pattern.

- [ ] **Step 4.1: Add WORKFLOW-HIRING to Required Reading and add the no-direct-hire rule**

Edit with `old_string`:

```
## Required Reading

Read before acting:
- `../../../docs/COMMUNICATION.md` — message API and communication rules
- `../../../docs/WORKFLOW-EXEC.md` — C-Level delegation and reporting workflow

## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Triage these alongside any active delegation.
- CEO delegation → read/claim `PAPERCLIP_DELEGATION_ID`, create issues or child delegations, split work aggressively, assign to workers, report back when done.
- Prefer parallel delegation over solo execution whenever a task can be broken into independent parts.
- If you can hand a piece to a worker, hand it off instead of doing it yourself.
- Work completes = issue comment (record) + delegation report to CEO (workflow state).
- Need help from another department = send `request` message to the relevant C-Level peer.
```

and `new_string`:

```
## Required Reading

Read before acting:
- `../../../docs/COMMUNICATION.md` — message API and communication rules
- `../../../docs/WORKFLOW-EXEC.md` — C-Level delegation and reporting workflow
- `../../../docs/WORKFLOW-HIRING.md` — hiring handshake (5-turn / 3-turn / solo)

## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Triage these alongside any active delegation.
- CEO delegation → read/claim `PAPERCLIP_DELEGATION_ID`, create issues or child delegations, split work aggressively, assign to workers, report back when done.
- Prefer parallel delegation over solo execution whenever a task can be broken into independent parts.
- If you can hand a piece to a worker, hand it off instead of doing it yourself.
- If your plan requires a worker role that does not exist (checked via `GET /api/companies/{companyId}/agents?role=R&status=active`), **do not hire directly**. Start the `WORKFLOW-HIRING.md` handshake by sending a `request` to CHRO (or to CEO if no active CHRO).
- Work completes = issue comment (record) + delegation report to CEO (workflow state).
- Need help from another department = send `request` message to the relevant C-Level peer.
```

- [ ] **Step 4.2: Run tests and confirm c-level cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: `describe("…c-level/AGENTS.md")` cases PASS, and the required-reading cross-reference test still PASSES (the new path `../../../docs/WORKFLOW-HIRING.md` resolves to `company-docs/WORKFLOW-HIRING.md`, which was created in Task 2).

- [ ] **Step 4.3: Commit**

```bash
git add server/src/onboarding-assets/c-level/AGENTS.md
git commit -m "feat(onboarding-assets/c-level): require WORKFLOW-HIRING; no direct hire"
```

---

## Task 5: Edit `default/AGENTS.md`

**Files:**
- Modify: `server/src/onboarding-assets/default/AGENTS.md`

Current full file:

```
Always write all issue titles, descriptions, comments, and any user-facing text in Korean (한국어).

You are an agent at Paperclip company.

## Required Reading

Read before acting:
- `../../../docs/COMMUNICATION.md` — message API and communication rules

## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Pick the highest-priority one and work it.
- If `PAPERCLIP_DELEGATION_ID` is set, first read `GET /api/delegations/{delegationId}`.
- For every assigned delegation: read it, claim it with `POST /api/delegations/{delegationId}/claim`, then report with `POST /api/delegations/{delegationId}/report`.
- Work completes = issue comment (record) + report message to manager (communication).
- Need help = send `request` message, don't just wait.
- Keep work moving.
```

- [ ] **Step 5.1: Add decomposition, dependency, out-of-skill, and non-dependency-blocker rules**

Edit with `old_string`:

```
## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Pick the highest-priority one and work it.
- If `PAPERCLIP_DELEGATION_ID` is set, first read `GET /api/delegations/{delegationId}`.
- For every assigned delegation: read it, claim it with `POST /api/delegations/{delegationId}/claim`, then report with `POST /api/delegations/{delegationId}/report`.
- Work completes = issue comment (record) + report message to manager (communication).
- Need help = send `request` message, don't just wait.
- Keep work moving.
```

and `new_string`:

```
## Core Rules

- Check message inbox every heartbeat.
- Check issue inbox every heartbeat: `GET /api/agents/me/inbox-lite` returns your open assignments (todo, in_progress, blocked) sorted by priority. Pick the highest-priority one and work it.
- If `PAPERCLIP_DELEGATION_ID` is set, first read `GET /api/delegations/{delegationId}`.
- For every assigned delegation: read it, claim it with `POST /api/delegations/{delegationId}/claim`, then report with `POST /api/delegations/{delegationId}/report`.
- Work completes = issue comment (record) + report message to manager (communication).
- Need help = send `request` message, don't just wait.
- Keep work moving.

## Plan Decomposition

When a `delegation` brief enumerates **more than one independent step**, your first action after `claim` is to create one **child issue** per step:

1. `POST /api/companies/{companyId}/issues` with `parentId=<rootIssueId of the delegation>`.
2. Assign each child to **yourself** by default.
3. Process children in priority order — **not all at once**. Comment on each as you complete it.
4. Only after every child is `done` may you `report` the parent delegation.

**When in doubt, decompose.** A multi-step plan executed as a single blob defeats observability and rework targeting.

### Recursive decomposition

A child you own may itself still be multi-step. Decompose recursively with **no fixed depth limit**: at every level, if the scope has multiple independent steps, create grandchildren under it before executing.

### Dependencies between children

When a child depends on another child's completion:
1. In the dependent child's description, write `depends on #<otherChildIssueId>` on a line of its own.
2. Create the dependent child with status `blocked`.
3. **Unblocking is the completing worker's responsibility.** When you set a child's status to `done`, scan sibling children (same `parentId`) for `depends on #<yourIssueId>` strings. For each match, flip it from `blocked` to `todo` in the same heartbeat.
4. If the dependent child is owned by a different worker (recursion crossed ownership), add a comment on the dependent child noting your completion; the owner picks it up on their next heartbeat.

### Out-of-skill escalation

If you decide a child is outside your skill envelope (e.g., you're an engineer and the step requires visual design), **do not execute it**:
1. Comment on the child summarizing why it is out-of-scope for you.
2. Send a `report` to your delegating C-Level: "child `<issueId>` requires role `<X>` that I cannot fulfill; please reassign or hire."
3. Keep working on children you **can** do.

Workers never start `WORKFLOW-HIRING.md` themselves — that is a C-Level privilege.

### Non-dependency blockers

If you are stuck on a child for reasons outside dependencies (external API down, unclear spec, missing permission) and **two heartbeats** pass without progress:
1. Set the child's status to `blocked`.
2. Send a `request` to your delegating C-Level with a concrete ask: "blocked on `<issueId>` because `<reason>`; need `<specific help>`."
3. Continue on other non-blocked children if any.
```

- [ ] **Step 5.2: Run tests and confirm default/AGENTS cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: the 4 `describe("…default/AGENTS.md")` cases now PASS.

- [ ] **Step 5.3: Commit**

```bash
git add server/src/onboarding-assets/default/AGENTS.md
git commit -m "feat(onboarding-assets/default): worker plan decomposition rules"
```

---

## Task 6: Edit `company-docs/WORKFLOW-CEO.md`

**Files:**
- Modify: `server/src/onboarding-assets/company-docs/WORKFLOW-CEO.md`

Current full file (reference):

```
# CEO Workflow

## Delegation Routing

Board로부터 이슈를 받으면 적절한 C-Level에게 `POST /api/companies/{companyId}/delegations`로 즉시 위임:

- Code, bugs, features, infra, technical → **CTO**
- Hiring, org structure, people → **CHRO**
- Marketing, content, growth → **CMO**
- Cross-functional → 분야별로 분리하여 각 C-Level에게 별도 위임

항상 먼저 작업을 쪼개고, 가능한 한 병렬로 여러 C-Level에 위임하라.

- 한 사람이 10분 안에 끝낼 수 있어도, 병렬로 나눌 수 있으면 나눠서 위임하라.
- 같은 목표를 한 에이전트가 이미 잡고 있더라도, 독립된 하위 작업이 있으면 추가 위임하라.
- 직접 만들지 말고, C-Level이 이슈를 생성하고 하위 에이전트에 할당하게 하라.
- 이미 위임했거나 열려 있는 같은 목표의 이슈가 있으면 새 이슈를 만들지 말고, 기존 이슈에 코멘트하거나 그 이슈를 계속 추적하라.
- 애매하면 보류하지 말고, 가장 가까운 C-Level에게 먼저 던지고 필요한 경우 다시 분해하라.
- delegation을 만들 때 원래 board 이슈를 `rootIssueId`로 연결하라.

## Reporting to Board

C-Level로부터 delegation report를 받으면:
1. 결과를 요약하여 원래 이슈에 코멘트로 작성
2. 이슈 상태를 적절히 업데이트 (done, in_review 등)

Board는 이슈 코멘트와 대시보드만 본다. 에이전트 메시지는 보지 않는다.
```

- [ ] **Step 6.1: Insert "Org-Shape Branching" section and rewrite "Reporting to Board"**

Edit with `old_string`:

```
# CEO Workflow

## Delegation Routing
```

and `new_string`:

```
# CEO Workflow

## Org-Shape Branching

Epic을 받을 때마다, 그리고 각 주요 단계(다음 위임 / 다음 고용 / 다음 reject)마다 조직 형태를 재조회한다:

```
GET /api/companies/{companyId}/agents?status=active
```

세 가지 모드로 분류한다:

| Mode | Trigger | 흐름 |
|---|---|---|
| **Full** | CEO + active CHRO 1명 이상 + active 도메인 C-Level 1명 이상 | 아래 Delegation Routing 을 따르고, 신규 worker 고용은 `WORKFLOW-HIRING.md`의 5-turn 핸드셰이크로 진행. |
| **CHRO-collapsed** | CEO + active 도메인 C-Level, active CHRO 없음 | 동일하되 CEO가 CHRO 역할을 대행하는 3-turn 핸드셰이크. |
| **CEO-only** | active 도메인 C-Level 없음 | 12-step 플로우 적용 **안 함**. CEO가 Epic을 직접 처리하고, 필요한 worker는 `WORKFLOW-HIRING.md` §4의 solo 경로로 직접 고용. |

**Mode는 고정이 아니다.** Epic 시작 시 첫 코멘트에 `Mode: Full` / `Mode: CHRO-collapsed` / `Mode: CEO-only` 중 하나를 적어둔다. 이후 단계에서 조직 형태가 바뀌면 모드를 갱신한 코멘트를 추가한다. 이미 완료된 단계는 되돌리지 않고, 앞으로의 단계만 새 모드를 따른다.

## Delegation Routing
```

Then edit with `old_string`:

```
## Reporting to Board

C-Level로부터 delegation report를 받으면:
1. 결과를 요약하여 원래 이슈에 코멘트로 작성
2. 이슈 상태를 적절히 업데이트 (done, in_review 등)

Board는 이슈 코멘트와 대시보드만 본다. 에이전트 메시지는 보지 않는다.
```

and `new_string`:

```
## Reporting to Board (Epic 종결)

마지막 C-Level의 delegation report를 모두 수신하면 Epic을 종결한다:

1. **Synthesis 코멘트**: 원래 Epic 이슈에 단일 종합 코멘트를 작성한다. 포맷:
   - 간단한 개요 (1~2줄)
   - 완료된 child 이슈의 불릿 목록 (이슈 키 링크 포함)
   - 미해결 후속 과제 또는 알려진 한계가 있으면 명시
2. **Epic 상태를 `in_review`로 전이** — `done`이 아니다. `PATCH /api/issues/{epicId}` with `status: "in_review"`. 최종 종결은 인간 사용자(Board)가 확인 후 수행한다.
3. 회사에 "board" 에이전트가 있으면 `direct` 메시지 발송, 없으면 Board는 Epic 코멘트를 직접 읽는다.

중간 결과(도메인 C-Level로부터의 개별 report)는 평소대로 원 이슈에 요약 코멘트만 달고 상태만 적절히 갱신한다(`in_progress` 유지 또는 특정 sub-issue `done`). 인간을 호출하는 `in_review` 전이는 Epic 전체가 완료될 때만 사용한다.

Board는 이슈 코멘트와 대시보드만 본다. 에이전트 메시지는 보지 않는다.
```

- [ ] **Step 6.2: Run tests and confirm WORKFLOW-CEO cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: the 2 `describe("…WORKFLOW-CEO.md")` cases PASS. Order assertion (Org-Shape before Delegation Routing) is satisfied by placing the new section directly after the `# CEO Workflow` heading.

- [ ] **Step 6.3: Commit**

```bash
git add server/src/onboarding-assets/company-docs/WORKFLOW-CEO.md
git commit -m "feat(onboarding-assets/ceo): org-shape branching + Epic in_review closure"
```

---

## Task 7: Edit `company-docs/WORKFLOW-EXEC.md`

**Files:**
- Modify: `server/src/onboarding-assets/company-docs/WORKFLOW-EXEC.md`

Current full file:

```
# C-Level Executive Workflow

## Receiving Delegation

CEO로부터 `PAPERCLIP_DELEGATION_ID` 또는 delegation 메시지를 받으면 즉시:
1. 요청 내용을 짧게 요약
2. `GET /api/delegations/{delegationId}`로 지시와 연결된 root issue를 읽음
3. `POST /api/delegations/{delegationId}/claim`으로 수락
4. 독립적인 하위 작업으로 분해
5. 여러 이슈 또는 child delegation을 만들어 병렬로 할당
6. 본인이 할 수 있는 일도 가능하면 다시 위임하고, 직접 처리할 일은 최소화

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토
- 품질이 부족하면 `request` 메시지로 수정 요청
- 한 하위 작업이 막혀도 다른 하위 작업은 계속 진행시켜라
- 유사한 작업이 반복되면 새 작업을 더 잘게 쪼개서 추가 위임하라
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고

## Reporting to CEO

결과를 종합하여 CEO에게 delegation report:
- 무엇을 했는지
- 결과물 (PR 링크, 문서 등)
- 남은 이슈가 있다면 언급
```

- [ ] **Step 7.1: Expand "Receiving Delegation" with missing-worker trigger and "Managing Workers" with reject policy**

Edit with `old_string`:

```
## Receiving Delegation

CEO로부터 `PAPERCLIP_DELEGATION_ID` 또는 delegation 메시지를 받으면 즉시:
1. 요청 내용을 짧게 요약
2. `GET /api/delegations/{delegationId}`로 지시와 연결된 root issue를 읽음
3. `POST /api/delegations/{delegationId}/claim`으로 수락
4. 독립적인 하위 작업으로 분해
5. 여러 이슈 또는 child delegation을 만들어 병렬로 할당
6. 본인이 할 수 있는 일도 가능하면 다시 위임하고, 직접 처리할 일은 최소화

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토
- 품질이 부족하면 `request` 메시지로 수정 요청
- 한 하위 작업이 막혀도 다른 하위 작업은 계속 진행시켜라
- 유사한 작업이 반복되면 새 작업을 더 잘게 쪼개서 추가 위임하라
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고
```

and `new_string`:

```
## Receiving Delegation

CEO로부터 `PAPERCLIP_DELEGATION_ID` 또는 delegation 메시지를 받으면 즉시:
1. 요청 내용을 짧게 요약
2. `GET /api/delegations/{delegationId}`로 지시와 연결된 root issue를 읽음
3. `POST /api/delegations/{delegationId}/claim`으로 수락
4. 독립적인 하위 작업으로 분해
5. 여러 이슈 또는 child delegation을 만들어 병렬로 할당
6. 본인이 할 수 있는 일도 가능하면 다시 위임하고, 직접 처리할 일은 최소화
7. 필요한 worker 역할이 없으면(`GET /api/companies/{companyId}/agents?role=R&status=active` 로 확인) 위임을 진행하기 전에 `WORKFLOW-HIRING.md` 핸드셰이크를 시작한다. 직접 `paperclip-create-agent`를 호출하지 않는다.

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토한다.
- 한 하위 작업이 막혀도 다른 하위 작업은 계속 진행시킨다.
- 유사한 작업이 반복되면 새 작업을 더 잘게 쪼개서 추가 위임한다.
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고한다.

### Reject 정책 (reopen vs 신규 corrective child)

worker의 `report`를 검토한 뒤 결과가 불만족스러우면, 결함의 성격에 따라 두 가지 중 하나를 택한다.

**1) 기존 child 이슈를 reopen (작은 결함)**

적용: 오타, 작은 버그, 사소한 폴리시, 스펙 오독.

1. child의 status를 `done`에서 `in_progress`로 되돌린다.
2. child에 정확히 무엇을 고쳐야 하는지 코멘트를 남긴다.
3. worker에게 `request` 메시지 발송: `{ issueId, rework reason, what must change }`.

**2) 신규 corrective child 이슈를 생성 (큰 deviation)**

적용: 설계 오류, 방향 변경, 결과물 misalignment, 범위 overshoot.

1. 원래 child는 `done` 그대로 유지한다(역사 보존).
2. 같은 parent 아래에 `수정: <주제>` 제목의 새 child를 생성하고 구체적 요구사항과 함께 worker에게 할당한다.
3. 정상 플로우가 새 child에서 재개된다.

### 3-rework 에스컬레이션

**동일 child 이슈**(또는 그 corrective-successor)가 **3회** reopen/recycle됐는데도 여전히 불만족스러우면, 같은 worker에게 더 요청하지 않고 CEO에게 보고한다:

1. `report` 메시지 발송: "worker `<agentId>` failed 3 rework cycles on `<issueId>`. Requesting re-plan or alternative worker."
2. CEO가 결정한다: (a) 같은 역할의 다른 기존 worker에게 재할당, (b) `WORKFLOW-HIRING.md`로 신규 고용, (c) child를 close하고 계획을 수정.

3-cycle 카운트는 **per-child**이다. 하나의 child에서 실패한 worker도 다른 child에서는 여전히 성공할 수 있다.
```

- [ ] **Step 7.2: Run tests and confirm WORKFLOW-EXEC cases pass**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: all 3 `describe("…WORKFLOW-EXEC.md")` cases PASS. Full test file is now green.

- [ ] **Step 7.3: Commit**

```bash
git add server/src/onboarding-assets/company-docs/WORKFLOW-EXEC.md
git commit -m "feat(onboarding-assets/exec): hire trigger + reject policy + rework escalation"
```

---

## Task 8: Full verification gate

**Files:** (no changes)

- [ ] **Step 8.1: Run the full onboarding-assets test file once more**

Run: `pnpm --filter @paperclipai/server exec vitest run src/onboarding-assets/__tests__/workflow-prompts.test.ts`

Expected: all test cases PASS, no skipped suites.

- [ ] **Step 8.2: Run the full verification gate (CLAUDE.md §7)**

Run (at repo root):

```bash
pnpm -r typecheck
```

Expected: no errors. This plan touches no TS, so this should be unchanged from baseline. If there is any pre-existing typecheck noise, note it in the commit body but do not fix it in this plan.

Run:

```bash
pnpm test:run
```

Expected: all tests pass, including the new `workflow-prompts.test.ts` suite.

Run:

```bash
pnpm build
```

Expected: build succeeds. The server build step (see `server/package.json` `build` script) copies `src/onboarding-assets/` to `dist/onboarding-assets/`. Confirm the new `WORKFLOW-HIRING.md` ends up in `server/dist/onboarding-assets/company-docs/WORKFLOW-HIRING.md`:

```bash
ls server/dist/onboarding-assets/company-docs/WORKFLOW-HIRING.md
```

Expected: file listed.

- [ ] **Step 8.3: Write the DoD checklist to the branch**

No file changes. In the final summary message to the user, confirm:
1. Spec matched (every §"File Changes" row addressed).
2. `pnpm -r typecheck` ✓
3. `pnpm test:run` ✓ (including the new suite)
4. `pnpm build` ✓ and the new file is copied into `dist/`.
5. Wiki update (Philosophy §1/§2 + History) was committed separately in `~/wiki` (commit `62ac1ef`).

No commit here — this is a verification-only task.

---

## Out of Scope (explicitly deferred)

Listed here so the implementer doesn't quietly absorb them:

- `delegations.status` new value for `rejected` (Path B).
- `issues.type` enum for `epic` (Path B).
- Auto-notifying the board user on Epic completion (Path B).
- Per-role onboarding files (`chro/AGENTS.md`, `cto/AGENTS.md`, etc.) — generic `c-level/AGENTS.md` carries all variations.
- Changing `paperclip-create-agent` skill behavior — it remains the underlying actuator of `/agent-hires`.
- Server-side enforcement of the 3-rework limit or mode-detection.
- Smoke-scenario execution (spec §"Verification Plan" layer 2) and regression scenarios (layer 3) — these are manual, to be run before merging the PR but not encoded as test steps.

## Post-Plan Manual Steps (to be run before opening a PR, not part of task checkboxes)

From spec §Verification Plan:

1. Bootstrap a fresh company with CEO + CTO + CHRO + zero workers.
2. Create Epic "샘플 회원가입 페이지 만들어줘".
3. Walk through CEO → CTO → CHRO → critic → CEO → CHRO-actuates → delegation to worker → child issues → worker report → CTO report → CEO synthesis + Epic `in_review`. Note any prompt that misfires.
4. Regression A (CEO-only): fresh company with CEO only. Expect CEO to comment "Mode: CEO-only" and hire solo.
5. Regression B (CHRO-collapsed): CEO + CTO, no CHRO. Expect "Mode: CHRO-collapsed" and a 3-turn handshake.
6. Regression C (rework loop): reject a worker report twice (expect reopen/new-issue handling), then a third time (expect escalation to CEO).

Log any divergence as a follow-up issue; do not silently amend the prompts without updating this plan and the spec in the same PR.
