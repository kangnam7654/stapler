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
