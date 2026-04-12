import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { AGENT_ROLE_LABELS, type AgentRole } from "@paperclipai/shared";
import { agentsApi } from "../../api/agents";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "../ui/button";
import { StatusBadge } from "../StatusBadge";

interface AgentDetailPanelProps {
  agentId: string;
  companyId: string;
  onClose: () => void;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AgentDetailPanel({ agentId, companyId, onClose }: AgentDetailPanelProps) {
  const { t } = useTranslation();

  const { data: agent, isLoading } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId, companyId),
    enabled: !!agentId && !!companyId,
  });

  const roleLabel = agent
    ? (AGENT_ROLE_LABELS as Record<string, string>)[agent.role as AgentRole] ??
      capitalize(agent.role)
    : null;

  return (
    <div className="absolute right-4 top-4 z-10 w-72 rounded-lg border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold truncate">
          {agent?.name ?? t("simulation.detail.loading")}
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
        {isLoading && !agent && (
          <p className="text-sm text-muted-foreground">{t("simulation.detail.loading")}</p>
        )}
        {!isLoading && !agent && (
          <p className="text-sm text-muted-foreground">{t("simulation.detail.notFound")}</p>
        )}
        {agent && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0 w-16">
                {t("simulation.detail.status")}
              </span>
              <StatusBadge status={agent.status} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0 w-16">
                {t("simulation.detail.role")}
              </span>
              <span className="text-sm">{roleLabel}</span>
            </div>
            {agent.title && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0 w-16">
                  {t("simulation.detail.title")}
                </span>
                <span className="text-sm truncate">{agent.title}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
