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

export function IssueWakeButton({ issue }: IssueWakeButtonProps) {
  const agentId = issue.assigneeAgentId;
  const companyId = issue.companyId;
  const issueId = issue.id;
  const shouldRender = !!agentId && !!companyId;

  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  // Holds the run id we plan to cancel. Captured at dialog-open time so a
  // late refetch (5s poll window) can't switch it out from under the user.
  const [pendingCancelRunId, setPendingCancelRunId] = useState<string | null>(null);

  function toastError(title: string, err: unknown) {
    pushToast({
      tone: "error",
      title,
      body: err instanceof Error ? err.message : String(err),
    });
  }

  const activeRunQuery = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    refetchInterval: 5000,
    enabled: shouldRender,
  });

  if (!shouldRender || !agentId || !companyId) return null;

  // Re-bind to local consts so the closures below see narrowed (non-null) types.
  // TypeScript can't prove the outer-scope vars stay narrowed across function
  // bodies declared after this guard.
  const wakeAgentId = agentId;
  const wakeCompanyId = companyId;

  const activeRun = activeRunQuery.data ?? null;
  const isActive = activeRun !== null;
  const confirmOpen = pendingCancelRunId !== null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
    // Also refresh the company-scoped live-runs widget (sidebar badge,
    // company live-runs page).
    queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(wakeCompanyId) });
  }

  async function fireWakeup(): Promise<"fired" | "skipped"> {
    const result = await agentsApi.wakeup(
      wakeAgentId,
      {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "manual_wake_from_issue",
        payload: { issueId },
      },
      wakeCompanyId,
    );
    invalidate();
    if ("status" in result && result.status === "skipped") {
      pushToast({
        tone: "warn",
        title: "처리 요청을 건너뛰었습니다",
        body: "담당 에이전트의 wakeOnDemand 설정을 확인하세요.",
      });
      return "skipped";
    }
    return "fired";
  }

  async function doFreshWake() {
    setBusy(true);
    try {
      const outcome = await fireWakeup();
      if (outcome === "fired") {
        pushToast({ tone: "success", title: "이슈 처리를 요청했습니다" });
      }
    } catch (err) {
      toastError("처리 요청 실패", err);
    } finally {
      setBusy(false);
    }
  }

  async function doRestart(runIdToCancel: string) {
    setPendingCancelRunId(null);
    setBusy(true);
    try {
      await heartbeatsApi.cancel(runIdToCancel);
    } catch (err) {
      toastError("이전 작업 취소 실패", err);
      setBusy(false);
      return;
    }
    try {
      const outcome = await fireWakeup();
      if (outcome === "fired") {
        pushToast({
          tone: "success",
          title: "이전 작업을 취소하고 다시 시작했습니다",
        });
      }
    } catch (err) {
      toastError("처리 요청 실패", err);
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (activeRun) {
      // Capture the run id NOW — by the time the user confirms, the 5s poll
      // may have refetched and replaced activeRun with a different value.
      setPendingCancelRunId(activeRun.id);
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
        title={
          isActive
            ? "이미 처리 중인 작업을 취소하고 다시 시작합니다"
            : "담당 에이전트가 즉시 이 이슈를 확인하도록 요청합니다"
        }
        aria-label={isActive ? "처리 중 — 클릭하면 재시작" : "지금 처리하기"}
      >
        <Zap
          className={cn(
            "h-4 w-4",
            isActive ? "text-green-500 animate-pulse" : "text-muted-foreground",
          )}
        />
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setPendingCancelRunId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이미 처리 중입니다</DialogTitle>
            <DialogDescription>
              이 이슈는 이미 담당 에이전트가 처리 중입니다. 진행 중인 작업을 취소하고 다시
              시작할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingCancelRunId(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (pendingCancelRunId) void doRestart(pendingCancelRunId);
              }}
            >
              재시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
