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
  const agentId = issue.assigneeAgentId;
  const companyId = issue.companyId;
  const issueId = issue.id;
  const shouldRender = !!agentId && !!companyId;

  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeRunQuery = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    refetchInterval: 5000,
    enabled: shouldRender,
  });

  if (!shouldRender) return null;

  const activeRun = activeRunQuery.data ?? null;
  const isActive = activeRun !== null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
    // Also refresh the company-scoped live-runs widget (sidebar badge, company live-runs page).
    queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId!) });
  }

  async function fireWakeup(kind: "fresh" | "restart") {
    const result = await agentsApi.wakeup(
      agentId!,
      {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "manual_wake_from_issue",
        payload: { issueId },
      },
      companyId!,
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
        title:
          kind === "restart"
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
              이 이슈에 대해 에이전트가 이미 실행 중입니다. 지금 실행 중인 run을 취소하고 다시
              시작할까요?
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
