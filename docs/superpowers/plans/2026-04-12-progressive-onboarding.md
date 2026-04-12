# Progressive Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign onboarding from a 4-step wizard with manual adapter config to a 3-step wizard with auto-detection + a post-onboarding Getting Started side panel.

**Architecture:** Two independent subsystems: (1) simplified wizard with adapter auto-detection replacing manual selection, (2) Getting Started panel that derives completion state from existing DB data. Both share new types in `packages/shared` and new API endpoints in `server`.

**Tech Stack:** React + TypeScript (frontend), Express + Drizzle ORM (backend), TanStack Query (data fetching), i18next (i18n), Playwright (E2E tests), Vitest (unit tests)

**Design spec:** `docs/superpowers/specs/2026-04-12-progressive-onboarding-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/types/onboarding.ts` | Create | Shared types: `AdapterDetectionItem`, `AdapterDetectionResult`, `OnboardingProgress` |
| `packages/shared/src/types/index.ts` | Modify | Re-export onboarding types |
| `server/src/services/adapter-detection.ts` | Create | Detect locally installed CLI tools and running adapter servers |
| `server/src/services/onboarding-progress.ts` | Create | Derive onboarding step completion from existing DB data |
| `server/src/routes/agents.ts` | Modify | Add `GET /adapters/detect` endpoint |
| `server/src/routes/companies.ts` | Modify | Add `GET /:id/onboarding-progress` endpoint |
| `ui/src/api/onboarding.ts` | Create | API client functions for detection and progress |
| `ui/src/i18n/ko.json` | Modify | Add new Korean translation keys |
| `ui/src/components/OnboardingWizard.tsx` | Modify | Restructure to 3 steps with auto-detect |
| `ui/src/components/GettingStartedPanel.tsx` | Create | Side panel checklist component |
| `ui/src/lib/onboarding-route.ts` | Modify | Remove step 4 handling |
| `ui/src/lib/onboarding-launch.ts` | Modify | Combine into single launch action |
| `ui/src/App.tsx` | Modify | Mount GettingStartedPanel |
| `ui/src/context/DialogContext.tsx` | Modify | Update OnboardingOptions type to remove step 4 |
| `tests/e2e/onboarding.spec.ts` | Modify | Update for 3-step flow |

---

### Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/onboarding.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Create onboarding types file**

```typescript
// packages/shared/src/types/onboarding.ts

export interface AdapterDetectionItem {
  type: string;
  name: string;
  version?: string;
  defaultModel: string;
  connectionInfo: {
    command?: string;
    args?: string[];
    baseUrl?: string;
  };
}

export interface AdapterDetectionResult {
  detected: AdapterDetectionItem[];
  recommended: AdapterDetectionItem | null;
}

export interface OnboardingProgress {
  completedSteps: number[];
  totalSteps: number;
  currentStep: number;
}
```

- [ ] **Step 2: Export from types index**

Add to end of `packages/shared/src/types/index.ts`:

```typescript
export type {
  AdapterDetectionItem,
  AdapterDetectionResult,
  OnboardingProgress,
} from "./onboarding.js";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS — no errors from new types

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/onboarding.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add onboarding detection and progress types"
```

---

### Task 2: Adapter Detection Service

**Files:**
- Create: `server/src/services/adapter-detection.ts`
- Test: `server/src/__tests__/adapter-detection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/adapter-detection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectInstalledAdapters } from "../services/adapter-detection.js";
import { exec } from "node:child_process";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

// Mock global fetch for HTTP checks
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockRejectedValue(new Error("connection refused"));
});

function mockWhichSuccess(command: string, path: string) {
  const mockedExec = vi.mocked(exec);
  mockedExec.mockImplementation(((
    cmd: string,
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    if (cmd === `which ${command}`) {
      cb(null, path, "");
    } else {
      cb(new Error("not found"), "", "not found");
    }
    return {} as ReturnType<typeof exec>;
  }) as typeof exec);
}

function mockWhichNothing() {
  const mockedExec = vi.mocked(exec);
  mockedExec.mockImplementation(((
    _cmd: string,
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    cb(new Error("not found"), "", "not found");
    return {} as ReturnType<typeof exec>;
  }) as typeof exec);
}

describe("detectInstalledAdapters", () => {
  it("returns empty when nothing is installed", async () => {
    mockWhichNothing();
    const result = await detectInstalledAdapters();
    expect(result.detected).toEqual([]);
    expect(result.recommended).toBeNull();
  });

  it("detects claude CLI when installed", async () => {
    mockWhichSuccess("claude", "/usr/local/bin/claude");
    const result = await detectInstalledAdapters();
    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].type).toBe("claude_local");
    expect(result.detected[0].connectionInfo.command).toBe("claude");
    expect(result.recommended?.type).toBe("claude_local");
  });

  it("detects Ollama when server is reachable", async () => {
    mockWhichNothing();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("11434")) {
        return { ok: true };
      }
      throw new Error("connection refused");
    });
    const result = await detectInstalledAdapters();
    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].type).toBe("ollama_local");
    expect(result.detected[0].connectionInfo.baseUrl).toBe("http://localhost:11434");
  });

  it("recommends highest priority adapter", async () => {
    mockWhichSuccess("claude", "/usr/local/bin/claude");
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("11434")) {
        return { ok: true };
      }
      throw new Error("connection refused");
    });
    const result = await detectInstalledAdapters();
    expect(result.detected).toHaveLength(2);
    expect(result.recommended?.type).toBe("claude_local");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm vitest run src/__tests__/adapter-detection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the adapter detection service**

Create `server/src/services/adapter-detection.ts`:

```typescript
import { exec } from "node:child_process";
import type { AdapterDetectionItem, AdapterDetectionResult } from "@paperclipai/shared";

interface AdapterProbe {
  type: string;
  name: string;
  defaultModel: string;
  detect: () => Promise<AdapterDetectionItem | null>;
}

function checkCli(
  command: string,
  type: string,
  name: string,
  defaultModel: string,
  args: string[] = [],
): () => Promise<AdapterDetectionItem | null> {
  return () =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2_000);
      exec(`which ${command}`, { timeout: 2_000 }, (err, stdout) => {
        clearTimeout(timeout);
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve({
          type,
          name,
          defaultModel,
          connectionInfo: { command, args },
        });
      });
    });
}

function checkHttp(
  baseUrl: string,
  type: string,
  name: string,
  defaultModel: string,
): () => Promise<AdapterDetectionItem | null> {
  return async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(baseUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        return { type, name, defaultModel, connectionInfo: { baseUrl } };
      }
      return null;
    } catch {
      return null;
    }
  };
}

const PROBES: AdapterProbe[] = [
  {
    type: "claude_local",
    name: "Claude Code",
    defaultModel: "claude-sonnet-4-20250514",
    detect: checkCli("claude", "claude_local", "Claude Code", "claude-sonnet-4-20250514"),
  },
  {
    type: "codex_local",
    name: "Codex",
    defaultModel: "o4-mini",
    detect: checkCli("codex", "codex_local", "Codex", "o4-mini"),
  },
  {
    type: "gemini_local",
    name: "Gemini CLI",
    defaultModel: "gemini-2.5-pro",
    detect: checkCli("gemini", "gemini_local", "Gemini CLI", "gemini-2.5-pro"),
  },
  {
    type: "cursor",
    name: "Cursor",
    defaultModel: "claude-sonnet-4-20250514",
    detect: checkCli("cursor", "cursor", "Cursor", "claude-sonnet-4-20250514"),
  },
  {
    type: "ollama_local",
    name: "Ollama",
    defaultModel: "llama3.1",
    detect: checkHttp("http://localhost:11434", "ollama_local", "Ollama", "llama3.1"),
  },
  {
    type: "lm_studio_local",
    name: "LM Studio",
    defaultModel: "default",
    detect: checkHttp("http://localhost:1234", "lm_studio_local", "LM Studio", "default"),
  },
];

const PRIORITY_ORDER = [
  "claude_local",
  "codex_local",
  "gemini_local",
  "cursor",
  "ollama_local",
  "lm_studio_local",
];

export async function detectInstalledAdapters(): Promise<AdapterDetectionResult> {
  const results = await Promise.all(PROBES.map((p) => p.detect()));
  const detected = results.filter((r): r is AdapterDetectionItem => r !== null);

  detected.sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.type) - PRIORITY_ORDER.indexOf(b.type),
  );

  return {
    detected,
    recommended: detected[0] ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm vitest run src/__tests__/adapter-detection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/adapter-detection.ts server/src/__tests__/adapter-detection.test.ts
git commit -m "feat(server): add adapter auto-detection service"
```

---

### Task 3: Detection API Endpoint

**Files:**
- Modify: `server/src/routes/agents.ts`

- [ ] **Step 1: Add detection endpoint to agents route**

In `server/src/routes/agents.ts`, add the import at top:

```typescript
import { detectInstalledAdapters } from "../services/adapter-detection.js";
```

Add the route handler inside the `agentRoutes` function, before any `/companies/:companyId/...` routes (this endpoint has no company prefix):

```typescript
  router.get("/adapters/detect", async (_req, res) => {
    try {
      const result = await detectInstalledAdapters();
      res.json(result);
    } catch {
      res.json({ detected: [], recommended: null });
    }
  });
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/agents.ts
git commit -m "feat(server): add GET /api/adapters/detect endpoint"
```

---

### Task 4: Onboarding Progress Service + Endpoint

**Files:**
- Create: `server/src/services/onboarding-progress.ts`
- Modify: `server/src/routes/companies.ts`
- Test: `server/src/__tests__/onboarding-progress.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/onboarding-progress.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveOnboardingProgress } from "../services/onboarding-progress.js";

describe("deriveOnboardingProgress", () => {
  it("returns all incomplete when counts are zero", () => {
    const result = deriveOnboardingProgress({
      hasCompany: false,
      agentCount: 0,
      issueCount: 0,
      hasAgentActivity: false,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([]);
    expect(result.currentStep).toBe(1);
    expect(result.totalSteps).toBe(6);
  });

  it("marks steps 1-3 complete after onboarding wizard", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 1,
      issueCount: 1,
      hasAgentActivity: false,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3]);
    expect(result.currentStep).toBe(4);
  });

  it("marks step 4 complete when agent has activity", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 1,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4]);
    expect(result.currentStep).toBe(5);
  });

  it("marks step 5 complete when 2+ agents exist", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 2,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4, 5]);
    expect(result.currentStep).toBe(6);
  });

  it("marks all complete when budget is set", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 2,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: true,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.currentStep).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm vitest run src/__tests__/onboarding-progress.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the onboarding progress service**

Create `server/src/services/onboarding-progress.ts`:

```typescript
import { eq, and, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues, activityLog, companies } from "@paperclipai/db";
import type { OnboardingProgress } from "@paperclipai/shared";

export interface OnboardingProgressInput {
  hasCompany: boolean;
  agentCount: number;
  issueCount: number;
  hasAgentActivity: boolean;
  hasBudget: boolean;
}

export function deriveOnboardingProgress(input: OnboardingProgressInput): OnboardingProgress {
  const completed: number[] = [];

  if (input.hasCompany) completed.push(1);
  if (input.agentCount >= 1) completed.push(2);
  if (input.issueCount >= 1) completed.push(3);
  if (input.hasAgentActivity) completed.push(4);
  if (input.agentCount >= 2) completed.push(5);
  if (input.hasBudget) completed.push(6);

  const currentStep = completed.length > 0
    ? Math.max(...completed) + 1
    : 1;

  return { completedSteps: completed, totalSteps: 6, currentStep };
}

export async function getOnboardingProgress(
  db: Db,
  companyId: string,
): Promise<OnboardingProgress> {
  const [agentCountResult, issueCountResult, activityResult, companyResult] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(eq(issues.companyId, companyId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.actorType, "agent"),
          ),
        )
        .then((rows) => (rows[0]?.count ?? 0) > 0),
      db
        .select({ budgetMonthlyCents: companies.budgetMonthlyCents })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null),
    ]);

  return deriveOnboardingProgress({
    hasCompany: true,
    agentCount: agentCountResult,
    issueCount: issueCountResult,
    hasAgentActivity: activityResult,
    hasBudget: (companyResult?.budgetMonthlyCents ?? 0) > 0,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm vitest run src/__tests__/onboarding-progress.test.ts`
Expected: PASS

- [ ] **Step 5: Add route endpoint in companies.ts**

In `server/src/routes/companies.ts`, add the import:

```typescript
import { getOnboardingProgress } from "../services/onboarding-progress.js";
```

Add the route handler inside the `companyRoutes` function:

```typescript
  router.get("/:companyId/onboarding-progress", async (req, res) => {
    const { companyId } = req.params;
    const progress = await getOnboardingProgress(db, companyId);
    res.json(progress);
  });
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/services/onboarding-progress.ts server/src/__tests__/onboarding-progress.test.ts server/src/routes/companies.ts
git commit -m "feat(server): add onboarding progress derivation service and endpoint"
```

---

### Task 5: API Client Functions

**Files:**
- Create: `ui/src/api/onboarding.ts`

- [ ] **Step 1: Create onboarding API client**

```typescript
// ui/src/api/onboarding.ts
import type { AdapterDetectionResult, OnboardingProgress } from "@paperclipai/shared";
import { api } from "./client";

export const onboardingApi = {
  detectAdapters: () => api.get<AdapterDetectionResult>("/adapters/detect"),

  getProgress: (companyId: string) =>
    api.get<OnboardingProgress>(`/companies/${companyId}/onboarding-progress`),
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ui/src/api/onboarding.ts
git commit -m "feat(ui): add onboarding API client functions"
```

---

### Task 6: i18n Strings

**Files:**
- Modify: `ui/src/i18n/ko.json`

- [ ] **Step 1: Add new Korean translation keys**

Add to the `"onboarding"` section of `ui/src/i18n/ko.json`:

```json
"connectAiTool": "AI 도구 연결하기",
"detecting": "설치된 도구를 감지하고 있습니다...",
"detected": "감지됨",
"recommended": "추천",
"noToolsDetected": "설치된 도구를 찾지 못했습니다",
"whatAiService": "어떤 AI 서비스를 사용하고 계세요?",
"installGuide": "설치 가이드",
"redetect": "다시 감지",
"iDontKnow": "잘 모르겠어요",
"noInstallNeeded": "설치 없이 바로 시작",
"advancedSettings": "고급 설정",
"changeModel": "모델 변경",
"createAndStart": "생성하고 시작하기",
"firstMission": "첫 미션",
"gettingStarted": "Getting Started",
"stepsCompleted": "{{completed}}/{{total}} 완료",
"step1CreateCompany": "회사 만들기",
"step2ConnectAgent": "에이전트 연결",
"step3CreateTask": "첫 태스크 생성",
"step4AgentActivity": "에이전트 동작 확인",
"step5AddAgent": "두 번째 에이전트 추가",
"step6SetBudget": "예산 설정",
"agentWorking": "에이전트가 태스크를 처리하고 있어요. 잠시 기다려주세요!",
"agentStarted": "CEO 에이전트가 작업을 시작했습니다!",
"allComplete": "축하합니다! 가이드를 완료했습니다",
"goalPlaceholder": "예: 프론트엔드 개발을 에이전트로 자동화"
```

Also check for an English translation file (e.g., `ui/src/i18n/en.json`). If it exists, add the English equivalents. If there is no English file (Korean is the primary/only locale), skip this sub-step.

- [ ] **Step 2: Verify no JSON syntax errors**

Run: `node -e "require('./ui/src/i18n/ko.json')"`
Expected: No error output

- [ ] **Step 3: Commit**

```bash
git add ui/src/i18n/ko.json
git commit -m "feat(i18n): add Korean translations for progressive onboarding"
```

---

### Task 7: Update onboarding-route.ts

**Files:**
- Modify: `ui/src/lib/onboarding-route.ts`
- Test: `ui/src/lib/onboarding-route.test.ts`

- [ ] **Step 1: Update the test file**

In `ui/src/lib/onboarding-route.test.ts`, find and update any tests that reference step 4 or the range `1 | 2 | 3 | 4`. The function `resolveRouteOnboardingOptions` currently returns `{ initialStep: 1 | 2 }` — check if the return type needs updating. Read the existing test file first to understand what needs to change.

The key change: `resolveRouteOnboardingOptions` return type stays `{ initialStep: 1 | 2; companyId?: string } | null` — it already only returns 1 or 2, so no functional change is needed here. But `shouldRedirectCompanylessRouteToOnboarding` needs no changes either.

The actual `Step` type (`1 | 2 | 3 | 4`) is defined in `OnboardingWizard.tsx`, not in `onboarding-route.ts`. So this task requires no code changes — verify by reading the file.

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd ui && pnpm vitest run src/lib/onboarding-route.test.ts`
Expected: PASS — no changes needed to this file

- [ ] **Step 3: Commit (skip if no changes)**

No commit needed if no changes were made.

---

### Task 8: Update onboarding-launch.ts

**Files:**
- Modify: `ui/src/lib/onboarding-launch.ts`
- Test: `ui/src/lib/onboarding-launch.test.ts`

- [ ] **Step 1: Read existing test file**

Read `ui/src/lib/onboarding-launch.test.ts` to understand current test coverage.

- [ ] **Step 2: Add `launchOnboarding` helper function**

Add to `ui/src/lib/onboarding-launch.ts`:

```typescript
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { goalsApi } from "../api/goals";

export async function launchOnboarding(input: {
  companyId: string;
  agentId: string;
  taskTitle: string;
  taskDescription: string;
  goalId: string | null;
}): Promise<{ projectId: string; issueRef: string }> {
  const { companyId, agentId, taskTitle, taskDescription, goalId } = input;

  // Resolve goal — use provided or find default
  let resolvedGoalId = goalId;
  if (!resolvedGoalId) {
    const goals = await goalsApi.list(companyId);
    resolvedGoalId = selectDefaultCompanyGoalId(goals);
  }

  // Create project
  const projectPayload = buildOnboardingProjectPayload(resolvedGoalId);
  const project = await projectsApi.create(companyId, projectPayload);

  // Create issue
  const issuePayload = buildOnboardingIssuePayload({
    title: taskTitle,
    description: taskDescription,
    assigneeAgentId: agentId,
    projectId: project.id,
    goalId: resolvedGoalId,
  });
  const issue = await issuesApi.create(companyId, issuePayload);

  return { projectId: project.id, issueRef: issue.ref };
}
```

Note: The existing `buildOnboardingProjectPayload` and `buildOnboardingIssuePayload` functions remain — `launchOnboarding` calls them. Check that `projectsApi.create`, `issuesApi.create`, and `goalsApi.list` exist and have the expected signatures by reading the import files. If they don't match, adapt the imports accordingly.

- [ ] **Step 3: Write test for launchOnboarding**

Add to `ui/src/lib/onboarding-launch.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { launchOnboarding, selectDefaultCompanyGoalId, buildOnboardingProjectPayload, buildOnboardingIssuePayload } from "./onboarding-launch";

// Test the new launchOnboarding function
// Note: launchOnboarding calls real API clients which we'd need to mock.
// Since it primarily orchestrates existing functions, focus on testing
// the existing pure functions remain correct.

describe("selectDefaultCompanyGoalId", () => {
  // existing tests should remain — verify they pass
});

describe("buildOnboardingProjectPayload", () => {
  // existing tests should remain — verify they pass
});
```

- [ ] **Step 4: Run tests**

Run: `cd ui && pnpm vitest run src/lib/onboarding-launch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/onboarding-launch.ts ui/src/lib/onboarding-launch.test.ts
git commit -m "feat(ui): add launchOnboarding helper combining project and issue creation"
```

---

### Task 9: Update DialogContext

**Files:**
- Modify: `ui/src/context/DialogContext.tsx`

- [ ] **Step 1: Update OnboardingOptions type**

In `ui/src/context/DialogContext.tsx`, find the `OnboardingOptions` interface and change `initialStep` type from `1 | 2 | 3 | 4` to `1 | 2 | 3`:

```typescript
interface OnboardingOptions {
  initialStep?: 1 | 2 | 3;
  companyId?: string;
}
```

If the type is already `1 | 2` (as the explore agent reported), no change is needed — verify by reading the file.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 3: Commit (if changed)**

```bash
git add ui/src/context/DialogContext.tsx
git commit -m "refactor(ui): update OnboardingOptions to 3-step type"
```

---

### Task 10: OnboardingWizard Refactor — Step Type and State

This is the first of 3 sub-tasks for the wizard refactor. This task changes the internal type and state only.

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Change Step type from 4 to 3 steps**

In `OnboardingWizard.tsx`, find and change:

```typescript
// Before:
type Step = 1 | 2 | 3 | 4;

// After:
type Step = 1 | 2 | 3;
```

- [ ] **Step 2: Add new state variables for detection**

Find the state declarations section and add after the existing adapter state:

```typescript
import { onboardingApi } from "../api/onboarding";
import type { AdapterDetectionResult } from "@paperclipai/shared";

// Add these state variables:
const [adapterDetection, setAdapterDetection] = useState<AdapterDetectionResult | null>(null);
const [detectionLoading, setDetectionLoading] = useState(false);
const [recommendationMode, setRecommendationMode] = useState(false);
const [advancedOpen, setAdvancedOpen] = useState(false);
```

- [ ] **Step 3: Remove step 4 from the step indicator array**

Find the steps array (around line 693) and update:

```typescript
// Before:
{ step: 1 as Step, label: t("onboarding.createCompany"), icon: Building2 },
{ step: 2 as Step, label: t("onboarding.createFirstAgent"), icon: Bot },
{ step: 3 as Step, label: t("onboarding.createFirstTask"), icon: ListTodo },
{ step: 4 as Step, label: t("common.done"), icon: Rocket }

// After:
{ step: 1 as Step, label: t("onboarding.createCompany"), icon: Building2 },
{ step: 2 as Step, label: t("onboarding.connectAiTool"), icon: Bot },
{ step: 3 as Step, label: t("onboarding.firstMission"), icon: ListTodo },
```

- [ ] **Step 4: Fix TypeScript errors from step 4 removal**

Search the file for `step === 4`, `setStep(4)`, and any references to step 4. Remove or merge the step 4 rendering block into step 3. At this point, don't rewrite the full rendering — just remove step 4's conditional rendering block and adjust `setStep` calls:

- `handleStep2Next` should still call `setStep(3)` (unchanged)
- Remove any `handleStep3Next` that calls `setStep(4)` — step 3 is now the final step
- The step 3 rendering block will be rewritten in Task 12

- [ ] **Step 5: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS (some warnings about unused step 4 code are OK at this stage)

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/OnboardingWizard.tsx
git commit -m "refactor(ui): change onboarding wizard from 4 steps to 3"
```

---

### Task 11: OnboardingWizard Refactor — Step 2 Auto-Detection UI

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Add auto-detection effect**

Add a `useEffect` that fires when step changes to 2:

```typescript
useEffect(() => {
  if (step !== 2) return;
  setDetectionLoading(true);
  onboardingApi
    .detectAdapters()
    .then((result) => {
      setAdapterDetection(result);
      if (result.detected.length === 0) {
        setRecommendationMode(true);
      } else {
        setRecommendationMode(false);
        // Auto-select recommended adapter
        if (result.recommended) {
          setAdapterType(result.recommended.type as AdapterType);
          setModel(result.recommended.defaultModel);
          if (result.recommended.connectionInfo.command) {
            setCommand(result.recommended.connectionInfo.command);
          }
          if (result.recommended.connectionInfo.args) {
            setArgs(result.recommended.connectionInfo.args.join(" "));
          }
          if (result.recommended.connectionInfo.baseUrl) {
            setUrl(result.recommended.connectionInfo.baseUrl);
          }
        }
      }
    })
    .catch(() => {
      setRecommendationMode(true);
    })
    .finally(() => {
      setDetectionLoading(false);
    });
}, [step]);
```

- [ ] **Step 2: Replace step 2 rendering with auto-detect UI**

Replace the step 2 rendering block (`{step === 2 && (...)}`) with the new auto-detect UI. The key structure:

1. **Loading state**: Show skeleton/spinner while detecting
2. **Detected adapters**: Show cards with "Detected" badges, 1-click to select
3. **Recommendation fallback**: Show "What AI service do you use?" with 5 options
4. **Agent name**: Auto-set to "CEO", shown as read-only or small editable field
5. **Advanced settings**: Collapsible accordion with existing CLI/URL fields

This is the largest rendering change. The adapter grid (`isRecommendedAdapter`/`isMoreAdapter` sections in current code) gets replaced entirely. Keep the existing `AdapterEnvironmentTestDisplay` component and the environment test logic — they still fire on "Next" click for local adapters.

The re-detect button calls `onboardingApi.detectAdapters()` again and resets state.

```typescript
{step === 2 && (
  <>
    <h3 className="text-lg font-semibold">{t("onboarding.connectAiTool")}</h3>

    {detectionLoading ? (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-12 bg-muted rounded-lg" />
        <div className="h-12 bg-muted rounded-lg" />
        <p className="text-sm text-muted-foreground">{t("onboarding.detecting")}</p>
      </div>
    ) : adapterDetection && adapterDetection.detected.length > 0 ? (
      <div className="space-y-3">
        {adapterDetection.detected.map((item) => (
          <button
            key={item.type}
            onClick={() => {
              setAdapterType(item.type as AdapterType);
              setModel(item.defaultModel);
              if (item.connectionInfo.command) setCommand(item.connectionInfo.command);
              if (item.connectionInfo.args) setArgs(item.connectionInfo.args.join(" "));
              if (item.connectionInfo.baseUrl) setUrl(item.connectionInfo.baseUrl);
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
              adapterType === item.type
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.defaultModel}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item.type === adapterDetection.recommended?.type && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {t("onboarding.recommended")}
                </span>
              )}
              <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                {t("onboarding.detected")}
              </span>
            </div>
          </button>
        ))}
        <button
          onClick={() => {
            setDetectionLoading(true);
            onboardingApi.detectAdapters().then((r) => {
              setAdapterDetection(r);
              setRecommendationMode(r.detected.length === 0);
            }).catch(() => setRecommendationMode(true)).finally(() => setDetectionLoading(false));
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("onboarding.redetect")}
        </button>
      </div>
    ) : (
      /* Recommendation fallback - shown when nothing detected */
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("onboarding.whatAiService")}</p>
        {[
          { label: "Anthropic (Claude)", type: "claude_local" as AdapterType, model: "claude-sonnet-4-20250514", command: "claude" },
          { label: "OpenAI (ChatGPT/Codex)", type: "codex_local" as AdapterType, model: "o4-mini", command: "codex" },
          { label: "Google (Gemini)", type: "gemini_local" as AdapterType, model: "gemini-2.5-pro", command: "gemini" },
          { label: "로컬 모델 (Ollama 등)", type: "ollama_local" as AdapterType, model: "llama3.1", url: "http://localhost:11434" },
          { label: t("onboarding.iDontKnow"), type: "openclaw_gateway" as AdapterType, model: "", url: "" },
        ].map((opt) => (
          <button
            key={opt.type}
            onClick={() => {
              setAdapterType(opt.type);
              setModel(opt.model);
              if (opt.command) setCommand(opt.command);
              if (opt.url) setUrl(opt.url);
              setRecommendationMode(false);
            }}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              adapterType === opt.type
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="text-sm font-medium">{opt.label}</span>
            {opt.type === "openclaw_gateway" && (
              <span className="ml-2 text-xs text-muted-foreground">{t("onboarding.noInstallNeeded")}</span>
            )}
          </button>
        ))}
      </div>
    )}

    {/* Advanced settings accordion */}
    <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground mt-4">
        {t("onboarding.advancedSettings")}
      </summary>
      <div className="mt-3 space-y-3">
        {/* Keep existing agent name, command, args, url, model fields here */}
        {/* Copy from current step 2 rendering */}
      </div>
    </details>

    {/* Keep existing adapter env test result display */}
    {adapterEnvResult && <AdapterEnvironmentTestDisplay result={adapterEnvResult} />}
  </>
)}
```

Note: The exact JSX above is a structural guide. The implementer must adapt it to use the existing component imports (`Bot`, `Input`, etc.) and Tailwind classes from the codebase's design system. Read `.claude/skills/design-guide/SKILL.md` for tokens.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/OnboardingWizard.tsx
git commit -m "feat(ui): replace manual adapter selection with auto-detect UI in step 2"
```

---

### Task 12: OnboardingWizard Refactor — Step 3 Merge (Task + Launch)

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Merge step 3 and former step 4 into a single "First Mission" step**

Replace the step 3 rendering block. The new step 3 combines task creation fields and the "Create & Start" action:

```typescript
{step === 3 && (
  <>
    <h3 className="text-lg font-semibold">{t("onboarding.firstMission")}</h3>
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">{t("onboarding.taskTitle")}</label>
        <Input
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="e.g. Research competitor pricing"
        />
      </div>
      <div>
        <label className="text-sm font-medium">{t("onboarding.taskDescription")}</label>
        <textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  </>
)}
```

- [ ] **Step 2: Replace the final "Next" action in step 3**

The current step 3 "Next" button navigates to step 4. The new step 3's action button says "Create & Start" and calls `launchOnboarding`, then navigates to the board:

```typescript
// In the button area, when step === 3:
<Button
  onClick={async () => {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      const { issueRef } = await launchOnboarding({
        companyId: createdCompanyId,
        agentId: createdAgentId,
        taskTitle,
        taskDescription,
        goalId: createdCompanyGoalId,
      });
      queryClient.invalidateQueries();
      handleClose();
      navigate(`/${createdCompanyPrefix}/issues/${issueRef}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch");
    } finally {
      setLoading(false);
    }
  }}
  disabled={loading || !taskTitle.trim()}
>
  {loading ? "..." : t("onboarding.createAndStart")}
</Button>
```

Import `launchOnboarding` from `../lib/onboarding-launch`:

```typescript
import { launchOnboarding } from "../lib/onboarding-launch";
```

- [ ] **Step 3: Remove old step 4 rendering block**

Delete the entire `{step === 4 && (...)}` block and the old `handleStep3Next` / step 4 launch logic.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5: Manual test — start dev server, walk through wizard**

Run: `pnpm dev`
Navigate to `http://localhost:3100` and walk through:
1. Enter company name → Next
2. Verify auto-detect runs (check loading skeleton), select adapter → Next
3. Enter task → "Create & Start" → verify redirects to issue page

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/OnboardingWizard.tsx
git commit -m "feat(ui): merge step 3+4 into single 'First Mission' step with direct launch"
```

---

### Task 13: GettingStartedPanel Component

**Files:**
- Create: `ui/src/components/GettingStartedPanel.tsx`

- [ ] **Step 1: Create the GettingStartedPanel component**

```typescript
// ui/src/components/GettingStartedPanel.tsx
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { onboardingApi } from "../api/onboarding";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GettingStartedPanelProps {
  companyId: string;
  companyPrefix: string;
}

const STORAGE_KEY_PREFIX = "onboarding-panel-";

interface ChecklistItem {
  step: number;
  labelKey: string;
  link: string;
}

export function GettingStartedPanel({ companyId, companyPrefix }: GettingStartedPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const storageKey = `${STORAGE_KEY_PREFIX}${companyId}`;

  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored).collapsed === true : false;
    } catch {
      return false;
    }
  });

  const [dismissed, setDismissed] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored).dismissed === true : false;
    } catch {
      return false;
    }
  });

  const [prevStep4, setPrevStep4] = useState(false);

  const { data: progress } = useQuery({
    queryKey: ["onboarding-progress", companyId],
    queryFn: () => onboardingApi.getProgress(companyId),
    refetchInterval: 5_000,
    enabled: !dismissed,
  });

  const checklist: ChecklistItem[] = [
    { step: 1, labelKey: "onboarding.step1CreateCompany", link: `/${companyPrefix}` },
    { step: 2, labelKey: "onboarding.step2ConnectAgent", link: `/${companyPrefix}/agents` },
    { step: 3, labelKey: "onboarding.step3CreateTask", link: `/${companyPrefix}/issues` },
    { step: 4, labelKey: "onboarding.step4AgentActivity", link: `/${companyPrefix}/issues` },
    { step: 5, labelKey: "onboarding.step5AddAgent", link: `/${companyPrefix}/agents` },
    { step: 6, labelKey: "onboarding.step6SetBudget", link: `/${companyPrefix}/settings` },
  ];

  const completedSteps = progress?.completedSteps ?? [];
  const completedCount = completedSteps.length;
  const allComplete = completedCount === 6;

  // Toast when step 4 completes (agent activity detected)
  useEffect(() => {
    const step4Complete = completedSteps.includes(4);
    if (step4Complete && !prevStep4) {
      toast({ description: t("onboarding.agentStarted") });
    }
    setPrevStep4(step4Complete);
  }, [completedSteps, prevStep4, toast, t]);

  // Auto-collapse on all complete
  useEffect(() => {
    if (allComplete && !collapsed) {
      const timer = setTimeout(() => {
        setCollapsed(true);
        persistState(true, false);
      }, 3_000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, collapsed]);

  const persistState = useCallback(
    (newCollapsed: boolean, newDismissed: boolean) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ collapsed: newCollapsed, dismissed: newDismissed }),
        );
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    persistState(next, dismissed);
  };

  const handleDismiss = () => {
    setDismissed(true);
    persistState(collapsed, true);
  };

  if (dismissed) return null;

  // Collapsed: floating badge
  if (collapsed) {
    return (
      <button
        onClick={handleCollapse}
        className="fixed right-4 bottom-4 z-50 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        {completedCount}/{6}
      </button>
    );
  }

  return (
    <div className="w-60 shrink-0 border-l border-border bg-background p-4 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold">{t("onboarding.gettingStarted")}</h4>
        <div className="flex items-center gap-1">
          <button onClick={handleCollapse} className="text-muted-foreground hover:text-foreground p-0.5">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-0.5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {t("onboarding.stepsCompleted", { completed: completedCount, total: 6 })}
      </p>

      {/* Progress bar */}
      <div className="w-full h-1 bg-muted rounded-full mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / 6) * 100}%` }}
        />
      </div>

      {allComplete ? (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          {t("onboarding.allComplete")}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 flex-1">
          {checklist.map((item) => {
            const isCompleted = completedSteps.includes(item.step);
            const isActive =
              !isCompleted && progress?.currentStep === item.step;

            return (
              <button
                key={item.step}
                onClick={() => !isCompleted && navigate(item.link)}
                disabled={isCompleted}
                className={`flex items-center gap-2 text-left ${
                  isCompleted
                    ? "text-muted-foreground"
                    : isActive
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                <div
                  className={`w-4.5 h-4.5 rounded flex items-center justify-center text-[10px] shrink-0 ${
                    isCompleted
                      ? "bg-green-500/20 text-green-600 dark:text-green-400"
                      : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    item.step
                  )}
                </div>
                <span
                  className={`text-xs ${
                    isCompleted ? "line-through" : isActive ? "font-medium" : ""
                  }`}
                >
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Contextual tip */}
      {!allComplete && progress?.currentStep === 4 && (
        <div className="mt-3 p-2.5 bg-primary/5 border-l-2 border-primary rounded text-xs text-muted-foreground">
          {t("onboarding.agentWorking")}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/GettingStartedPanel.tsx
git commit -m "feat(ui): add GettingStartedPanel side panel component"
```

---

### Task 14: App Integration

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Read App.tsx layout structure**

Read `ui/src/App.tsx` to understand where the board layout renders — specifically find where the main content area is rendered for company-scoped routes. The `<GettingStartedPanel />` should be mounted as a sibling of the main content in a flex container.

- [ ] **Step 2: Mount GettingStartedPanel in board layout**

Import the component and mount it conditionally:

```typescript
import { GettingStartedPanel } from "./components/GettingStartedPanel";
```

Find the board layout component (the one that renders company-scoped routes). Add `GettingStartedPanel` as a right-side sibling:

```typescript
// Wrap existing board content + panel in a flex container
<div className="flex flex-1 overflow-hidden">
  <div className="flex-1 overflow-auto">
    {/* existing board content / Outlet */}
  </div>
  {selectedCompany && (
    <GettingStartedPanel
      companyId={selectedCompany.id}
      companyPrefix={selectedCompany.issuePrefix}
    />
  )}
</div>
```

The exact integration depends on the current layout structure. The key requirement: the panel appears on the right side of the board view, and receives the current company ID and prefix as props.

- [ ] **Step 3: Verify it renders**

Run: `pnpm dev`
Navigate to a company board. Verify the Getting Started panel appears on the right side.

- [ ] **Step 4: Commit**

```bash
git add ui/src/App.tsx
git commit -m "feat(ui): mount GettingStartedPanel in board layout"
```

---

### Task 15: Add to DesignGuide showcase

**Files:**
- Modify: `ui/src/pages/DesignGuide.tsx`

- [ ] **Step 1: Add GettingStartedPanel showcase section**

Read `ui/src/pages/DesignGuide.tsx` to see the existing showcase pattern. Add a section for GettingStartedPanel:

```typescript
import { GettingStartedPanel } from "@/components/GettingStartedPanel";

// In the showcase JSX, add a section:
<section>
  <h2>Getting Started Panel</h2>
  <p className="text-sm text-muted-foreground mb-4">
    Post-onboarding side panel with 6-step checklist. Shows progress, auto-completes steps,
    collapses when done.
  </p>
  <div className="border rounded-lg h-[400px] flex">
    <div className="flex-1 p-4 bg-muted/30">
      <p className="text-sm text-muted-foreground">Board content area</p>
    </div>
    <GettingStartedPanel companyId="demo" companyPrefix="DEMO" />
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/pages/DesignGuide.tsx
git commit -m "feat(ui): add GettingStartedPanel to DesignGuide showcase"
```

---

### Task 16: E2E Test Update

**Files:**
- Modify: `tests/e2e/onboarding.spec.ts`

- [ ] **Step 1: Read existing E2E test**

Read `tests/e2e/onboarding.spec.ts` to understand the current flow assertions.

- [ ] **Step 2: Update test for 3-step flow**

Update the test to reflect the new flow. Key changes:
- Step 2 heading changes from "Create your first agent" to the new heading (match i18n key)
- Remove step 4 assertions ("Ready to launch" heading, summary display)
- Step 3's final button changes from "Next" → "Create & Start"
- After step 3, expect redirect directly to issue page (no step 4)
- Add assertion for GettingStartedPanel visibility after board load

```typescript
test("completes full wizard flow", async ({ page }) => {
  await page.goto("/");

  // Step 1: Company name
  const wizardHeading = page.locator("h3", { hasText: /company/i });
  await expect(wizardHeading).toBeVisible({ timeout: 15_000 });
  const companyNameInput = page.locator('input[placeholder="Acme Corp"]');
  await companyNameInput.fill(COMPANY_NAME);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: Connect AI tool (auto-detect)
  await expect(
    page.locator("h3").filter({ hasText: /AI/ }),
  ).toBeVisible({ timeout: 10_000 });
  // Wait for detection to finish (loading skeleton disappears)
  await page.waitForTimeout(3_500);
  // Click Next (adapter may or may not be detected in CI)
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: First mission + launch
  await expect(
    page.locator("h3").filter({ hasText: /미션|mission/i }),
  ).toBeVisible({ timeout: 10_000 });
  const taskTitleInput = page.locator('input[placeholder*="e.g."]');
  await taskTitleInput.clear();
  await taskTitleInput.fill(TASK_TITLE);
  await page.getByRole("button", { name: /생성|Create/i }).click();

  // Should redirect to issue page
  await expect(page).toHaveURL(/\/issues\//, { timeout: 10_000 });

  // Getting Started panel should be visible
  await expect(
    page.locator("text=Getting Started"),
  ).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 3: Run E2E tests**

Run: `pnpm exec playwright test tests/e2e/onboarding.spec.ts`
Expected: PASS (may need `pnpm dev` running in background)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/onboarding.spec.ts
git commit -m "test(e2e): update onboarding test for 3-step flow and Getting Started panel"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm -r typecheck`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `pnpm test:run`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Manual walkthrough**

Start `pnpm dev` and test:
1. Fresh state (no companies) — should redirect to onboarding
2. Step 1: Enter company name + goal → Next
3. Step 2: Auto-detect runs, select adapter → Next
4. Step 3: Enter task → "Create & Start" → redirects to issue page
5. Getting Started panel visible on right side with steps 1-3 complete
6. Panel collapses/expands correctly
7. Panel dismisses and stays dismissed on reload

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments from manual verification"
```
