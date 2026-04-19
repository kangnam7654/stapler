# Issue Page Heartbeat Button — Design Spec

**Date:** 2026-04-19
**Author:** kangnam (with Claude)
**Status:** Approved
**Related plan:** `docs/superpowers/plans/2026-04-19-issue-page-heartbeat-button.md` (to be generated)

---

## 1. Goal

Add an explicit "wake the assigned agent" button to the issue detail page header. One click triggers a heartbeat run scoped to the current issue. No comment, no popover — just the button.

## 2. Why

Today, the only way for a user to wake an agent on an issue is to leave a comment, which:

- forces a comment that may not have any real content,
- pollutes the comment thread with non-substantive "bumping" messages,
- has no obvious affordance (users have to know "comments wake the agent").

Power users want a direct, semantic action: "I want this agent to look at this issue right now."

## 3. Design Decisions (from brainstorming Q1–Q8)

| # | Decision |
|---|---|
| Q1 | Wake is **issue-scoped**: payload includes `{ issueId }`, the server's existing payload-handling chain (`heartbeat.ts:561,615`) routes it as a task. `wakeReason: "manual_wake"`. |
| Q2 | When an active run exists for the same issue: **Cancel + Restart** (not "queue", not "no-op"). |
| Q3 | When the issue has **no assignee**: button is **hidden**. Assigning is a separate UX (existing `IssueProperties` row). |
| Q4 | **No popover, no reason input.** Plain button, fixed reason string. |
| Q5 | **Confirmation dialog only when a Cancel + Restart is required** (i.e., active run is in flight). Idle case is one-click. |
| Q6 | **Header action area**, immediately to the right of the existing Copy button (both mobile and desktop variants). |
| Q7 | **Icon-only** (`Zap` from lucide-react), with tooltip. **Active-run state** changes the icon to a green `Zap` with `animate-pulse`. |
| Q8 | **Toast on every action.** Success: "에이전트를 깨웠습니다". Cancel+restart: "이전 run을 취소하고 새로 시작했습니다". Error: "깨우기 실패: {error}". |

## 4. Architecture

A new self-contained React component `IssueWakeButton` (Approach A from brainstorming).

```
ui/src/components/IssueWakeButton.tsx     ← new
ui/src/pages/IssueDetail.tsx               ← modified (mount point only)
```

The component owns its own React Query subscription, mutation, dialog, and toast. IssueDetail.tsx changes are limited to: import + two `<IssueWakeButton issue={issue} />` mount points (mobile + desktop header). No business logic in IssueDetail.

Reused infrastructure (no new server endpoints, no schema change):

- `agentsApi.wakeup(agentId, { source, triggerDetail, reason, payload }, companyId)` — POST `/agents/:id/wakeup`
- `heartbeatsApi.activeRunForIssue(issueId)` — GET `/issues/:id/active-run`
- `heartbeatsApi.cancel(runId)` — POST `/heartbeat-runs/:id/cancel`
- `useToast().pushToast(...)` from `ui/src/context/ToastContext.tsx`
- shadcn primitives: `Button`, `Tooltip`, `Dialog`

## 5. Component Contract

### Props

```ts
interface IssueWakeButtonProps {
  issue: Issue;
  // Issue type is the existing UI Issue type (has companyId, assigneeAgentId, id)
}
```

### Visibility (Q3)

Component returns `null` when:

- `issue.assigneeAgentId == null` (issue is unassigned), OR
- `issue.companyId == null` (defensive guard; should not happen on issue detail).

### Internal State

```ts
const activeRunQuery = useQuery({
  queryKey: queryKeys.issues.activeRun(issue.id),
  queryFn: () => heartbeatsApi.activeRunForIssue(issue.id),
  refetchInterval: 5000,        // match Inbox/IssueDetail polling cadence
  enabled: !!issue.assigneeAgentId,
});

const [confirmOpen, setConfirmOpen] = useState(false);
const [busy, setBusy] = useState(false);   // disables button during mutation
```

The `refetchInterval: 5000` matches the cadence already in use on IssueDetail; React Query dedup ensures the second subscription does not double the network cost.

### Derived UI State

```ts
type ButtonState = "idle" | "active";
const buttonState: ButtonState = activeRunQuery.data ? "active" : "idle";
```

### Click Behavior

```
onClick():
  if buttonState === "active":
    setConfirmOpen(true)        // → AlertDialog handles cancel+restart
  else:
    void doWake({ kind: "fresh" })

onConfirmRestart():
  setConfirmOpen(false)
  void doWake({ kind: "restart", previousRunId: activeRunQuery.data!.id })

doWake({ kind, previousRunId }):
  setBusy(true)
  try:
    if kind === "restart":
      await heartbeatsApi.cancel(previousRunId)
    const result = await agentsApi.wakeup(
      issue.assigneeAgentId!,
      {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "manual_wake_from_issue",
        payload: { issueId: issue.id },
      },
      issue.companyId!,
    )
    if ("status" in result && result.status === "skipped"):
      pushToast({ tone: "warn", title: "깨우기를 건너뛰었습니다", body: "에이전트의 wakeOnDemand 설정을 확인하세요." })
    else:
      pushToast({
        tone: "success",
        title: kind === "restart" ? "이전 run을 취소하고 새로 시작했습니다" : "에이전트를 깨웠습니다",
      })
    invalidateQueries([
      queryKeys.issues.activeRun(issue.id),
      queryKeys.issues.liveRuns(issue.id),
      queryKeys.issues.activity(issue.id),
      queryKeys.issues.runs(issue.id),
    ])
  catch (err):
    pushToast({ tone: "error", title: "깨우기 실패", body: errorMessage(err) })
  finally:
    setBusy(false)
```

### Render

```tsx
return (
  <>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          onClick={handleClick}
          aria-label={buttonState === "active" ? "현재 실행 중 — 클릭하면 재시작" : "에이전트 깨우기"}
        >
          <Zap
            className={cn(
              "h-4 w-4",
              buttonState === "active" ? "text-green-500 animate-pulse" : "text-muted-foreground",
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {buttonState === "active" ? "현재 실행 중 — 클릭하면 재시작" : "에이전트 깨우기"}
      </TooltipContent>
    </Tooltip>

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
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button onClick={handleConfirmRestart}>재시작</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
)
```

## 6. Mount Points in `IssueDetail.tsx`

Two insertion points (mobile and desktop variants of the header action area):

**Desktop** — `IssueDetail.tsx:808-816` (after the Copy `<Button>`):

```tsx
<Button variant="ghost" size="icon-xs" onClick={copyIssueToClipboard} title="마크다운으로 이슈 복사">
  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
</Button>
<IssueWakeButton issue={issue} />        {/* ← NEW */}
<Button ...properties toggle... />
```

**Mobile** — `IssueDetail.tsx:789-805` (after the Copy `<Button>`):

```tsx
<Button variant="ghost" size="icon-xs" onClick={copyIssueToClipboard} title="마크다운으로 이슈 복사">
  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
</Button>
<IssueWakeButton issue={issue} />        {/* ← NEW */}
<Button ...properties toggle... />
```

## 7. Server-side Behavior (no changes required)

The existing `POST /agents/:id/wakeup` handler (`server/src/routes/agents.ts:2051`) already:

1. Forwards `payload`, `reason`, `triggerDetail` to `heartbeat.wakeup(...)`.
2. The heartbeat orchestrator (`server/src/services/heartbeat.ts`):
   - reads `payload.issueId` → `taskKey` via `deriveTaskKey()` (L561),
   - copies it into `contextSnapshot.issueId` and `contextSnapshot.taskId` via `enrichWakeContextSnapshot()` (L615),
   - resolves the cost ledger scope to the issue via `resolveLedgerScopeForRun()` (L332).
3. Logs an `activity_log` entry with `action: "heartbeat.invoked"`, `entityType: "heartbeat_run"`, `details.agentId`.
4. Returns `202` with the new run object, OR `202 { status: "skipped" }` when the agent has `wakeOnDemand` disabled.

The new run will surface naturally in:

- `liveRunsForIssue(issue.id)` (because `contextSnapshot.issueId` matches),
- `activeRunForIssue(issue.id)` (same reason),
- the run timeline / activity feed already rendered by IssueDetail.

## 8. Toast Strategy (Q8)

| Outcome | Tone | Title | Body |
|---|---|---|---|
| Fresh wake (no active run), 202 with run | success | 에이전트를 깨웠습니다 | — |
| Cancel+Restart, 202 with run | success | 이전 run을 취소하고 새로 시작했습니다 | — |
| 202 `{ status: "skipped" }` (wakeOnDemand disabled) | warn | 깨우기를 건너뛰었습니다 | 에이전트의 wakeOnDemand 설정을 확인하세요. |
| Network or HTTP error | error | 깨우기 실패 | `{error.message}` |
| `cancel(prevRunId)` failed (cancel+restart path) | error | 이전 run 취소 실패 | `{error.message}` (do NOT continue to wakeup; abort) |

Toast TTLs come from `ToastContext` defaults (`success: 3500ms`, `warn: 8000ms`, `error: 10000ms`).

## 9. Edge Cases

| Case | Behavior |
|---|---|
| User double-clicks the button quickly | `disabled={busy}` blocks the second click. |
| Active run finishes between query refresh ticks (5s) and click | The wake fires as a "fresh" wake. Server may either accept (new run) or (rare) race to skip. UI shows whatever toast matches the response. Acceptable. |
| User has no `tasks:assign` permission on the agent's company | Server returns 403 → caught → error toast surfaces the message. No client-side permission gating. |
| Issue's assignee changes mid-render | `IssueWakeButton` is keyed on `issue.assigneeAgentId` indirectly via `useQuery({ enabled: !!issue.assigneeAgentId })`. New assignee → fresh active-run query. Previous in-flight mutation completes against the *old* agent (acceptable; user initiated it). |
| Agent is paused (`pauseReason != null`) | Server typically still accepts the wake but the heartbeat orchestrator may skip. Same handling as `{ status: "skipped" }`. |
| Issue belongs to a different company than the active company context | The `companyId` in the wakeup call is read from `issue.companyId`, not the active company. Server validates company access. |

## 10. Out of Scope

- **Assigning the agent from this button.** Q3 explicitly chose 라: when no assignee, the button hides. The existing `IssueProperties` Assignee row remains the only assignment UX.
- **Per-click custom reason text** (Q4 가).
- **Queueing wakes** (Q2 다 chose Cancel+Restart, not queue).
- **Wake from issue list rows.** Future-friendly via the same component, but not in this spec.
- **Keyboard shortcut.** Not requested.
- **Telemetry / analytics.** Not requested. Activity log is the audit trail.
- **i18n beyond Korean.** All strings are Korean, matching the rest of IssueDetail.

## 11. Test Plan

### Unit / component tests (Vitest + Testing Library)

`ui/src/components/IssueWakeButton.test.tsx`:

1. **Hidden when no assignee** — renders `null` when `issue.assigneeAgentId == null`.
2. **Idle state** — renders muted Zap with tooltip "에이전트 깨우기". Click → calls `agentsApi.wakeup` with correct args (`source: "on_demand"`, `triggerDetail: "manual"`, `reason: "manual_wake_from_issue"`, `payload: { issueId }`). Success toast appears.
3. **Active state** — when `activeRunForIssue` returns a run, renders green Zap + pulse. Click → opens dialog. Confirm → calls `cancel(prevRunId)` then `wakeup`. Cancel toast text differs.
4. **Confirm dialog cancel** — clicking 취소 in dialog → no API calls.
5. **Skipped response** — when wakeup returns `{ status: "skipped" }`, warn toast appears with wakeOnDemand hint.
6. **Error path** — when wakeup throws, error toast with the message.
7. **Cancel-then-wake error** — when `cancel(prevRunId)` fails, no wakeup call is made; error toast surfaces the cancel error.
8. **Disabled during mutation** — button has `disabled` attribute while mutation is pending; second click is no-op.

Mocks: `agentsApi.wakeup`, `heartbeatsApi.cancel`, `heartbeatsApi.activeRunForIssue`. ToastProvider wrapped via test helper.

### Integration / E2E (Playwright)

`tests/e2e/issue-wake-button.spec.ts`:

1. Seed a company + agent (any cheap adapter — `codex_local` or a stub) + an issue assigned to that agent.
2. Open the issue detail page; assert the Zap button is visible in the header.
3. Stub `POST /api/agents/:id/wakeup` to return a fake run object (avoid actually invoking an LLM).
4. Click the Zap button; assert the success toast appears.
5. Stub `GET /api/issues/:id/active-run` to return a run object on the next call.
6. Reload; assert the Zap is now green + pulsing. Click → dialog appears. Confirm → `cancel` then `wakeup` are called in order.
7. Cleanup: delete the seeded company.

### Manual smoke (deferred to user)

- Open a real issue assigned to a working agent. Click ⚡. Confirm activity feed gets a `heartbeat.invoked` entry within 5 seconds. Confirm the agent's run starts.

## 12. Implementation Order (preview — full plan in writing-plans output)

1. Create `IssueWakeButton.tsx` skeleton (returns null path + idle render). Test 1 + 2.
2. Add active-run state + green pulse. Test 3.
3. Add confirm dialog + cancel-then-wake flow. Tests 4 + 7.
4. Add toast variants (success/warn/error). Tests 5 + 6.
5. Add `disabled={busy}` guard. Test 8.
6. Mount in IssueDetail.tsx (both mobile + desktop). Visual smoke.
7. E2E test. Verification gate (`pnpm -r typecheck && pnpm test:run && pnpm build`). Commit.
