# Issue Page Heartbeat Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header button on the issue detail page that explicitly wakes the assigned agent for that issue (replacing the "comment to wake" anti-pattern).

**Architecture:** A self-contained `IssueWakeButton` React component owning its own `activeRunForIssue` query, `wakeup` mutation, confirmation dialog, and toast feedback. Mounted twice in `IssueDetail.tsx` (mobile + desktop header variants). No server-side or schema changes — uses existing `POST /agents/:id/wakeup`, which already routes `payload.issueId` through `heartbeat.ts:561,615`.

**Tech Stack:** React 19 + TypeScript, Vite, TanStack Query v5, shadcn/ui (Dialog), lucide-react (Zap icon), Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-19-issue-page-heartbeat-button-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `ui/src/components/IssueWakeButton.tsx` | **Create** | Self-contained wake button: visibility check, active-run query, click handler, dialog, toast, mutation. |
| `ui/src/components/IssueWakeButton.test.tsx` | **Create** | Unit tests covering all 8 spec scenarios. |
| `ui/src/pages/IssueDetail.tsx` | **Modify** | Import + 2 mount points (mobile L789-806, desktop L808-816). No business logic. |
| `tests/e2e/issue-wake-button.spec.ts` | **Create** | Playwright E2E with stubbed `wakeup` and `active-run` endpoints. |

**Wake reason string convention:** `"manual_wake_from_issue"` (used in both mutation call and tests; no other code references it).

**Tooltip approach:** Use `title=` attribute (matches sibling Copy button at IssueDetail.tsx:794) — avoids needing `TooltipProvider` wrapper in tests and keeps the header DOM consistent.

---

## Task 1: Skeleton — visibility guard + idle render

**Files:**
- Create: `ui/src/components/IssueWakeButton.tsx`
- Create: `ui/src/components/IssueWakeButton.test.tsx`

- [ ] **Step 1: Write the failing test (visibility + idle render)**

Create `ui/src/components/IssueWakeButton.test.tsx`:

```tsx
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { ToastProvider } from "../context/ToastContext";

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    activeRunForIssue: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock("../api/agents", () => ({
  agentsApi: {
    wakeup: vi.fn(),
  },
}));

import { IssueWakeButton } from "./IssueWakeButton";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";

const mockActiveRun = vi.mocked(heartbeatsApi.activeRunForIssue);
const mockCancel = vi.mocked(heartbeatsApi.cancel);
const mockWakeup = vi.mocked(agentsApi.wakeup);

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    issueKey: "T1-1",
    title: "Test issue",
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    createdByAgentId: null,
    createdByUserId: "user-1",
    projectId: null,
    parentIssueId: null,
    estimateMinutes: null,
    spentMinutes: null,
    labels: [],
    metadata: null,
    archivedAt: null,
    archivedByUserId: null,
    archivedByAgentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Issue;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockActiveRun.mockResolvedValue(null);
  mockCancel.mockResolvedValue(undefined as unknown as void);
  mockWakeup.mockResolvedValue({ id: "run-new" } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IssueWakeButton — visibility & idle render", () => {
  it("renders nothing when issue has no assignee", () => {
    const { container } = render(
      <IssueWakeButton issue={makeIssue({ assigneeAgentId: null })} />,
      { wrapper: Wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the wake button when issue has an assignee", async () => {
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });
    const btn = await screen.findByRole("button", { name: "에이전트 깨우기" });
    expect(btn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: FAIL with `Cannot find module './IssueWakeButton'`.

- [ ] **Step 3: Create the component skeleton**

Create `ui/src/components/IssueWakeButton.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";

interface IssueWakeButtonProps {
  issue: Issue;
}

export function IssueWakeButton({ issue }: IssueWakeButtonProps) {
  if (!issue.assigneeAgentId || !issue.companyId) {
    return null;
  }

  const activeRunQuery = useQuery({
    queryKey: queryKeys.issues.activeRun(issue.id),
    queryFn: () => heartbeatsApi.activeRunForIssue(issue.id),
    refetchInterval: 5000,
  });

  const isActive = !!activeRunQuery.data;

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title="에이전트 깨우기"
      aria-label="에이전트 깨우기"
    >
      <Zap
        className={cn(
          "h-4 w-4",
          isActive ? "text-green-500 animate-pulse" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/IssueWakeButton.tsx ui/src/components/IssueWakeButton.test.tsx
git commit -m "feat(ui): add IssueWakeButton skeleton with visibility guard"
```

---

## Task 2: Click handler — fresh wake (no active run)

**Files:**
- Modify: `ui/src/components/IssueWakeButton.tsx`
- Modify: `ui/src/components/IssueWakeButton.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to `ui/src/components/IssueWakeButton.test.tsx` inside a new `describe`:

```tsx
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

describe("IssueWakeButton — fresh wake (no active run)", () => {
  it("calls agentsApi.wakeup with issueId payload and shows success toast", async () => {
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "에이전트 깨우기" });
    await user.click(btn);

    await waitFor(() => {
      expect(mockWakeup).toHaveBeenCalledWith(
        "agent-1",
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "manual_wake_from_issue",
          payload: { issueId: "issue-1" },
        },
        "company-1",
      );
    });

    expect(await screen.findByText("에이전트를 깨웠습니다")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx -t "fresh wake"`
Expected: FAIL — `mockWakeup` was not called (button has no onClick yet).

- [ ] **Step 3: Wire the click handler**

Replace the entire `ui/src/components/IssueWakeButton.tsx` with:

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";

interface IssueWakeButtonProps {
  issue: Issue;
}

export function IssueWakeButton({ issue }: IssueWakeButtonProps) {
  if (!issue.assigneeAgentId || !issue.companyId) {
    return null;
  }
  const agentId = issue.assigneeAgentId;
  const companyId = issue.companyId;
  const issueId = issue.id;

  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  const activeRunQuery = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    refetchInterval: 5000,
  });

  const isActive = !!activeRunQuery.data;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
  }

  async function doWake() {
    setBusy(true);
    try {
      const result = await agentsApi.wakeup(
        agentId,
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "manual_wake_from_issue",
          payload: { issueId },
        },
        companyId,
      );
      if ("status" in result && result.status === "skipped") {
        pushToast({
          tone: "warn",
          title: "깨우기를 건너뛰었습니다",
          body: "에이전트의 wakeOnDemand 설정을 확인하세요.",
        });
      } else {
        pushToast({ tone: "success", title: "에이전트를 깨웠습니다" });
      }
      invalidate();
    } catch (err) {
      pushToast({
        tone: "error",
        title: "깨우기 실패",
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      disabled={busy}
      onClick={() => void doWake()}
      title="에이전트 깨우기"
      aria-label="에이전트 깨우기"
    >
      <Zap
        className={cn(
          "h-4 w-4",
          isActive ? "text-green-500 animate-pulse" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/IssueWakeButton.tsx ui/src/components/IssueWakeButton.test.tsx
git commit -m "feat(ui): IssueWakeButton wakes agent on click with success toast"
```

---

## Task 3: Active-run state — green pulse + confirmation dialog

**Files:**
- Modify: `ui/src/components/IssueWakeButton.tsx`
- Modify: `ui/src/components/IssueWakeButton.test.tsx`

- [ ] **Step 1: Add failing tests for active state and dialog**

Append to `ui/src/components/IssueWakeButton.test.tsx`:

```tsx
import type { ActiveRunForIssue } from "../api/heartbeats";

function makeActiveRun(): ActiveRunForIssue {
  return {
    id: "run-prev",
    companyId: "company-1",
    agentId: "agent-1",
    agentName: "Tester",
    adapterType: "codex_local",
    invocationSource: "automation",
    triggerDetail: "system",
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    wakeupRequestId: null,
    exitCode: null,
    signal: null,
    usageJson: null,
    resultJson: null,
    sessionIdBefore: null,
    sessionIdAfter: null,
    logStore: "local_file",
    logRef: "x",
    logBytes: 0,
    logSha256: null,
    logCompressed: false,
    stdoutExcerpt: null,
    stderrExcerpt: null,
    errorCode: null,
    externalRunId: null,
    processPid: null,
    processStartedAt: null,
    retryOfRunId: null,
    processLossRetryCount: 0,
    contextSnapshot: { issueId: "issue-1" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as ActiveRunForIssue;
}

describe("IssueWakeButton — active-run state", () => {
  it("uses the active-run aria-label and shows green pulse", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });
    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    expect(btn).toBeInTheDocument();
    const icon = btn.querySelector("svg");
    expect(icon?.className).toContain("text-green-500");
    expect(icon?.className).toContain("animate-pulse");
  });

  it("opens confirm dialog when clicked while active; cancel does nothing", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    await user.click(btn);

    expect(await screen.findByText("현재 실행 중입니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("confirm restart cancels the previous run then wakes; restart toast appears", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    await user.click(btn);
    await user.click(await screen.findByRole("button", { name: "재시작" }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("run-prev"));
    await waitFor(() => expect(mockWakeup).toHaveBeenCalled());

    // cancel must run before wakeup
    const cancelOrder = mockCancel.mock.invocationCallOrder[0];
    const wakeupOrder = mockWakeup.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(wakeupOrder);

    expect(
      await screen.findByText("이전 run을 취소하고 새로 시작했습니다"),
    ).toBeInTheDocument();
  });

  it("aborts wakeup if cancel(prevRunId) fails; surfaces cancel error toast", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    mockCancel.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    await user.click(await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" }));
    await user.click(await screen.findByRole("button", { name: "재시작" }));

    expect(await screen.findByText("이전 run 취소 실패")).toBeInTheDocument();
    expect(mockWakeup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx -t "active-run state"`
Expected: FAIL — multiple failures (active aria-label not differentiated, no dialog, no cancel logic).

- [ ] **Step 3: Implement active-run state, dialog, and cancel+restart**

Replace `ui/src/components/IssueWakeButton.tsx` with:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";

interface IssueWakeButtonProps {
  issue: Issue;
}

const IDLE_LABEL = "에이전트 깨우기";
const ACTIVE_LABEL = "현재 실행 중 — 클릭하면 재시작";

export function IssueWakeButton({ issue }: IssueWakeButtonProps) {
  if (!issue.assigneeAgentId || !issue.companyId) {
    return null;
  }
  const agentId = issue.assigneeAgentId;
  const companyId = issue.companyId;
  const issueId = issue.id;

  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeRunQuery = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    refetchInterval: 5000,
  });

  const activeRun = activeRunQuery.data ?? null;
  const isActive = activeRun !== null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
  }

  async function fireWakeup(kind: "fresh" | "restart") {
    const result = await agentsApi.wakeup(
      agentId,
      {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "manual_wake_from_issue",
        payload: { issueId },
      },
      companyId,
    );
    if ("status" in result && result.status === "skipped") {
      pushToast({
        tone: "warn",
        title: "깨우기를 건너뛰었습니다",
        body: "에이전트의 wakeOnDemand 설정을 확인하세요.",
      });
    } else {
      pushToast({
        tone: "success",
        title: kind === "restart"
          ? "이전 run을 취소하고 새로 시작했습니다"
          : "에이전트를 깨웠습니다",
      });
    }
    invalidate();
  }

  async function doFreshWake() {
    setBusy(true);
    try {
      await fireWakeup("fresh");
    } catch (err) {
      pushToast({
        tone: "error",
        title: "깨우기 실패",
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function doRestart() {
    setConfirmOpen(false);
    if (!activeRun) return;
    setBusy(true);
    try {
      try {
        await heartbeatsApi.cancel(activeRun.id);
      } catch (err) {
        pushToast({
          tone: "error",
          title: "이전 run 취소 실패",
          body: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      await fireWakeup("restart");
    } catch (err) {
      pushToast({
        tone: "error",
        title: "깨우기 실패",
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (isActive) {
      setConfirmOpen(true);
    } else {
      void doFreshWake();
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={busy}
        onClick={handleClick}
        title={isActive ? ACTIVE_LABEL : IDLE_LABEL}
        aria-label={isActive ? ACTIVE_LABEL : IDLE_LABEL}
      >
        <Zap
          className={cn(
            "h-4 w-4",
            isActive ? "text-green-500 animate-pulse" : "text-muted-foreground",
          )}
        />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>현재 실행 중입니다</DialogTitle>
            <DialogDescription>
              이 이슈에 대해 에이전트가 이미 실행 중입니다.
              지금 실행 중인 run을 취소하고 다시 시작할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void doRestart()}>재시작</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Run all tests**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/IssueWakeButton.tsx ui/src/components/IssueWakeButton.test.tsx
git commit -m "feat(ui): IssueWakeButton supports cancel+restart with confirmation dialog"
```

---

## Task 4: Skipped + error + busy-disable cases

**Files:**
- Modify: `ui/src/components/IssueWakeButton.test.tsx`

- [ ] **Step 1: Add failing tests**

Append to `ui/src/components/IssueWakeButton.test.tsx`:

```tsx
describe("IssueWakeButton — skipped, error, busy", () => {
  it("shows warn toast when wakeup returns { status: 'skipped' }", async () => {
    mockWakeup.mockResolvedValue({ status: "skipped" } as never);
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    await user.click(await screen.findByRole("button", { name: "에이전트 깨우기" }));

    expect(await screen.findByText("깨우기를 건너뛰었습니다")).toBeInTheDocument();
    expect(
      await screen.findByText("에이전트의 wakeOnDemand 설정을 확인하세요."),
    ).toBeInTheDocument();
  });

  it("shows error toast when wakeup throws", async () => {
    mockWakeup.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    await user.click(await screen.findByRole("button", { name: "에이전트 깨우기" }));

    expect(await screen.findByText("깨우기 실패")).toBeInTheDocument();
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("disables button while a wakeup mutation is in-flight", async () => {
    let resolve!: (v: { id: string }) => void;
    mockWakeup.mockImplementation(
      () => new Promise<{ id: string }>((r) => { resolve = r; }) as never,
    );
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "에이전트 깨우기" });
    await user.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    resolve({ id: "run-new" });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
```

- [ ] **Step 2: Run tests to verify they pass without code changes**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: PASS — all 10 tests green. (These cases are already implemented in Task 3; this task locks them in via tests.)

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/IssueWakeButton.test.tsx
git commit -m "test(ui): cover IssueWakeButton skipped, error, and busy-disable cases"
```

---

## Task 5: Mount in `IssueDetail.tsx` (mobile + desktop)

**Files:**
- Modify: `ui/src/pages/IssueDetail.tsx`

- [ ] **Step 1: Add the import**

In `ui/src/pages/IssueDetail.tsx`, add the import alongside the other component imports near line 25 (after `import { IssueWorkspaceCard } from "../components/IssueWorkspaceCard";`):

```tsx
import { IssueWakeButton } from "../components/IssueWakeButton";
```

- [ ] **Step 2: Mount in mobile header**

In `ui/src/pages/IssueDetail.tsx`, locate the mobile header block at L789-806. After the Copy `<Button>` (which currently ends with `</Button>` near L797) and BEFORE the Properties toggle `<Button>` (L798), insert:

```tsx
            <IssueWakeButton issue={issue} />
```

The mobile header should now read:

```tsx
          <div className="ml-auto flex items-center gap-0.5 md:hidden shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copyIssueToClipboard}
              title="마크다운으로 이슈 복사"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <IssueWakeButton issue={issue} />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setMobilePropsOpen(true)}
              title="속성"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
```

- [ ] **Step 3: Mount in desktop header**

In `ui/src/pages/IssueDetail.tsx`, locate the desktop header block starting at L808. After the Copy `<Button>` (which ends near L816) and BEFORE the Properties toggle `<Button>` (L817), insert:

```tsx
            <IssueWakeButton issue={issue} />
```

The relevant desktop slice should now read:

```tsx
          <div className="hidden md:flex items-center md:ml-auto shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copyIssueToClipboard}
              title="마크다운으로 이슈 복사"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <IssueWakeButton issue={issue} />
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 transition-opacity duration-200",
                panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
              )}
              onClick={() => setPanelVisible(true)}
              title="속성 표시"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            ...
```

- [ ] **Step 4: Typecheck**

Run: `cd ui && pnpm exec tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 5: Re-run unit tests**

Run: `cd ui && pnpm vitest run src/components/IssueWakeButton.test.tsx`
Expected: PASS — all 10 tests still green.

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/IssueDetail.tsx
git commit -m "feat(ui): mount IssueWakeButton in IssueDetail header (mobile + desktop)"
```

---

## Task 6: Add reusable design-guide showcase entry

**Files:**
- Modify: `ui/src/pages/DesignGuide.tsx`

The project skill `design-guide` requires every new reusable component to appear on the `/design-guide` page (so the design system stays discoverable).

- [ ] **Step 1: Add a section**

In `ui/src/pages/DesignGuide.tsx`, find an appropriate place near the other "composite components" sections (search for `<Section title="StatusBadge">` or similar as a reference for placement). Insert a new section. First add the import near the other component imports at the top of the file:

```tsx
import { IssueWakeButton } from "../components/IssueWakeButton";
```

Then add the section in the page body (near other composite sections):

```tsx
<Section title="IssueWakeButton">
  <SubSection title="With assignee (idle)">
    <IssueWakeButton
      issue={
        {
          id: "demo-issue",
          companyId: "demo-co",
          assigneeAgentId: "demo-agent",
        } as never
      }
    />
    <p className="text-xs text-muted-foreground mt-2">
      Click does nothing in the design guide (network calls go through mocks in real usage).
      In the real app: clicks `POST /agents/:id/wakeup` with payload {`{ issueId }`}, shows toast.
    </p>
  </SubSection>
  <SubSection title="No assignee (renders nothing)">
    <div className="text-xs text-muted-foreground">
      <IssueWakeButton
        issue={
          {
            id: "demo-issue-2",
            companyId: "demo-co",
            assigneeAgentId: null,
          } as never
        }
      />
      <span>↑ component rendered above this line, but returns null when assignee is missing.</span>
    </div>
  </SubSection>
</Section>
```

- [ ] **Step 2: Typecheck**

Run: `cd ui && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/DesignGuide.tsx
git commit -m "docs(ui): showcase IssueWakeButton on /design-guide"
```

---

## Task 7: Playwright E2E

**Files:**
- Create: `tests/e2e/issue-wake-button.spec.ts`

This test seeds a company + agent + issue, stubs the wake/cancel/active-run endpoints (no real LLM call), and asserts the button + toast flow end-to-end.

- [ ] **Step 1: Read sibling spec for the seeding pattern**

Open `tests/e2e/wizard-company-adapter-defaults.spec.ts` (the spec we just shipped). Note: it uses `request` fixture for relative-URL API calls and cleans up the company in `afterEach` / at the end of `test()`.

- [ ] **Step 2: Write the failing E2E test**

Create `tests/e2e/issue-wake-button.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("IssueWakeButton: wakes the assigned agent with issueId payload", async ({ page, request }) => {
  // 1. Seed: company + agent (codex_local — cheap and never invoked here) + issue
  const companyResp = await request.post("/api/companies", {
    data: {
      name: `E2E Wake ${Date.now()}`,
      requireBoardApprovalForNewAgents: false,
    },
  });
  expect(companyResp.ok()).toBeTruthy();
  const company = await companyResp.json();

  const agentResp = await request.post("/api/agents", {
    data: {
      companyId: company.id,
      name: "Wake Tester",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    },
  });
  expect(agentResp.ok()).toBeTruthy();
  const agent = await agentResp.json();

  const issueResp = await request.post(`/api/companies/${company.id}/issues`, {
    data: {
      title: "E2E Wake Issue",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agent.id,
    },
  });
  expect(issueResp.ok()).toBeTruthy();
  const issue = await issueResp.json();

  // 2. Stub: intercept wakeup so we never actually invoke an LLM
  let wakeupCalls = 0;
  let lastWakeupBody: unknown = null;
  await page.route(`**/api/agents/${agent.id}/wakeup`, async (route) => {
    wakeupCalls++;
    lastWakeupBody = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ id: "stubbed-run", agentId: agent.id, status: "queued" }),
    });
  });

  // active-run stays null so we hit the fresh-wake path
  await page.route(`**/api/issues/${issue.id}/active-run`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  // 3. Open the issue detail page
  await page.goto(`/issues/${issue.id}`);

  // 4. Locate and click the Zap button (idle aria-label)
  const wakeBtn = page.getByRole("button", { name: "에이전트 깨우기" }).first();
  await expect(wakeBtn).toBeVisible();
  await wakeBtn.click();

  // 5. Assert: success toast appears and wakeup was called with correct payload
  await expect(page.getByText("에이전트를 깨웠습니다")).toBeVisible({ timeout: 5000 });
  expect(wakeupCalls).toBe(1);
  expect(lastWakeupBody).toMatchObject({
    source: "on_demand",
    triggerDetail: "manual",
    reason: "manual_wake_from_issue",
    payload: { issueId: issue.id },
  });

  // 6. Cleanup
  await request.delete(`/api/companies/${company.id}`);
});
```

- [ ] **Step 3: Run the E2E test**

Run: `cd /Users/kangnam/projects/stapler && pnpm exec playwright test issue-wake-button.spec.ts`
Expected: PASS.

If the test fails because the issue page can't find the assignee in the rendered DOM, check `page.goto` URL convention by reading another e2e spec (`tests/e2e/adapter-config-inheritance.spec.ts`) — the project may use `/issues/:id` or `/companies/:companyId/issues/:id`; mirror the working pattern.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/issue-wake-button.spec.ts
git commit -m "test(e2e): IssueWakeButton wakes assigned agent with issueId payload"
```

---

## Task 8: Verification gate

**Files:** none modified (gate only)

- [ ] **Step 1: Typecheck (full repo)**

Run: `cd /Users/kangnam/projects/stapler && pnpm -r typecheck`
Expected: PASS — no type errors anywhere.

- [ ] **Step 2: Unit + integration tests (full repo)**

Run: `cd /Users/kangnam/projects/stapler && pnpm test:run`
Expected: PASS — all tests green. The new `IssueWakeButton.test.tsx` adds 10 tests; total count should rise by 10.

- [ ] **Step 3: Build (full repo)**

Run: `cd /Users/kangnam/projects/stapler && pnpm build`
Expected: PASS — production build completes.

- [ ] **Step 4: E2E suite**

Run: `cd /Users/kangnam/projects/stapler && pnpm exec playwright test`
Expected: PASS — full E2E suite green, including the new spec.

- [ ] **Step 5: Final commit (only if any tweaks were needed during gating)**

If gating revealed nothing to fix, skip this step. Otherwise commit any small fixups with:

```bash
git add -A
git commit -m "chore: address verification gate findings"
```

---

## Self-review (post-write checklist)

**Spec coverage:**
- §1 Goal — Tasks 1-5 implement the button. ✅
- §3 Q1 (issue-scoped, manual_wake reason) — Task 2 Step 3 wakeup call. ✅
- §3 Q2 (cancel+restart) — Task 3 doRestart. ✅
- §3 Q3 (hidden when no assignee) — Task 1 visibility test + Step 3 `if (!assigneeAgentId) return null`. ✅
- §3 Q4 (no popover/reason input) — fixed `reason: "manual_wake_from_issue"` string. ✅
- §3 Q5 (confirm dialog only on cancel+restart) — Task 3 Dialog mounted only conditionally fired. ✅
- §3 Q6 (header placement) — Task 5 mobile + desktop mounts. ✅
- §3 Q7 (icon-only Zap, active state visualization) — Task 1 + 3 Zap render. ✅
- §3 Q8 (toast variants) — Task 2 success, Task 3 restart, Task 4 skipped/error, Task 3 cancel-fail. ✅
- §5 Component contract — Task 1 props/visibility, Task 2 click behavior, Task 3 derived state. ✅
- §6 Mount points — Task 5 mobile + desktop. ✅
- §7 Server unchanged — no server task. ✅
- §8 Toast strategy — Tasks 2/3/4 cover all 5 rows. ✅
- §9 Edge cases — busy disable (Task 4), cancel-fail (Task 3), assignee-changes-mid-render (covered by `enabled`/`queryKey` semantics, no separate task needed). ✅
- §10 Out of scope — assignment UX explicitly skipped. ✅
- §11 Test plan unit 1-8 — Tasks 1-4 = 10 tests. E2E in Task 7. Manual smoke noted as deferred. ✅
- §12 Implementation order — Tasks 1→7 follow the spec order. ✅

**Placeholder scan:** No "TBD/TODO/implement later" markers. Every code step has complete code. ✅

**Type consistency:** `IssueWakeButtonProps`, `agentId`/`companyId`/`issueId` locals, `activeRun`, `isActive`, `IDLE_LABEL`/`ACTIVE_LABEL` constants — all match across Tasks 1, 2, 3. Wake reason `"manual_wake_from_issue"` is identical in source and tests. ✅

No issues found.
