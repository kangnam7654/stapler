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
