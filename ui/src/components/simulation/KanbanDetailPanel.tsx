import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "../ui/button";
import { StatusBadge } from "../StatusBadge";

interface KanbanDetailPanelProps {
  issueId: string;
  onClose: () => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

export function KanbanDetailPanel({ issueId, onClose }: KanbanDetailPanelProps) {
  const { t } = useTranslation();

  const { data: issue, isLoading } = useQuery({
    queryKey: queryKeys.issues.detail(issueId),
    queryFn: () => issuesApi.get(issueId),
    enabled: !!issueId,
  });

  return (
    <div className="absolute right-4 top-4 z-10 w-72 rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold truncate">
          {issue?.title ?? t("simulation.detail.loading")}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X />
        </Button>
      </div>
      <div className="space-y-3 px-4 py-3">
        {isLoading && !issue && (
          <p className="text-sm text-muted-foreground">{t("simulation.detail.loading")}</p>
        )}
        {!isLoading && !issue && (
          <p className="text-sm text-muted-foreground">{t("simulation.detail.notFound")}</p>
        )}
        {issue && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0 w-16">
                {t("simulation.detail.status")}
              </span>
              <StatusBadge status={issue.status} />
            </div>
            {issue.description && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {t("simulation.detail.description")}
                </span>
                <p className="text-sm text-foreground">
                  {truncate(issue.description, 100)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
