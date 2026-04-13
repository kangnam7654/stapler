import type { JSX } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { BudgetPolicySummary } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { budgetsApi } from "../api/budgets";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { parseDollarInput } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BudgetPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  existingPolicies: BudgetPolicySummary[];
}

type ScopeChoice = "company" | "agent" | "project";

export function BudgetPolicyDialog({
  open,
  onOpenChange,
  companyId,
  existingPolicies,
}: BudgetPolicyDialogProps): JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<ScopeChoice>("company");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [amountUsd, setAmountUsd] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: open && scope === "agent",
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: open && scope === "project",
  });

  const existingAgentIds = new Set(
    existingPolicies.filter((p) => p.scopeType === "agent").map((p) => p.scopeId),
  );
  const existingProjectIds = new Set(
    existingPolicies.filter((p) => p.scopeType === "project").map((p) => p.scopeId),
  );
  const companyPolicyExists = existingPolicies.some((p) => p.scopeType === "company");

  const availableAgents = (agents ?? []).filter((a) => !existingAgentIds.has(a.id));
  const availableProjects = (projects ?? []).filter((p) => !existingProjectIds.has(p.id));

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof budgetsApi.upsertPolicy>[1]) =>
      budgetsApi.upsertPolicy(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(companyId) });
      setAmountUsd("");
      setTargetId(null);
      setScope("company");
      setError(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleScopeChange(next: ScopeChoice) {
    setScope(next);
    setTargetId(null);
    setError(null);
  }

  function handleSubmit() {
    const cents = parseDollarInput(amountUsd);
    if (cents === null || cents <= 0) {
      setError("유효한 금액을 입력하세요.");
      return;
    }

    if (scope === "agent" && !targetId) {
      setError("에이전트를 선택하세요.");
      return;
    }
    if (scope === "project" && !targetId) {
      setError("프로젝트를 선택하세요.");
      return;
    }

    mutation.mutate({
      scopeType: scope,
      scopeId: scope === "company" ? companyId : targetId!,
      amount: cents,
      windowKind: scope === "project" ? "lifetime" : "calendar_month_utc",
    });
  }

  const scopeButtons: { value: ScopeChoice; label: string }[] = [
    { value: "company", label: t("costs.budgetScopeCompany") },
    { value: "agent", label: t("costs.budgetScopeAgent") },
    { value: "project", label: t("costs.budgetScopeProject") },
  ];

  const companyDisabled = companyPolicyExists;
  const agentDisabled = scope === "agent" && availableAgents.length === 0;
  const projectDisabled = scope === "project" && availableProjects.length === 0;
  const noTargets = agentDisabled || projectDisabled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("costs.addBudget")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Scope selector */}
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              범위
            </div>
            <div className="flex rounded-md border border-input overflow-hidden">
              {scopeButtons.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleScopeChange(value)}
                  className={
                    "flex-1 px-3 py-1.5 text-sm transition-colors " +
                    (scope === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground hover:bg-muted")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === "company" && companyDisabled && (
              <p className="mt-1 text-xs text-muted-foreground">{t("costs.alreadyConfigured")}</p>
            )}
          </div>

          {/* Target selector */}
          {scope === "agent" && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("costs.selectAgent")}
              </div>
              {availableAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("costs.noAvailableTargets")}</p>
              ) : (
                <Select value={targetId ?? ""} onValueChange={setTargetId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("costs.selectAgent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents ?? []).map((agent) => (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        disabled={existingAgentIds.has(agent.id)}
                      >
                        {agent.name}
                        {existingAgentIds.has(agent.id) && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({t("costs.alreadyConfigured")})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {scope === "project" && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("costs.selectProject")}
              </div>
              {availableProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("costs.noAvailableTargets")}</p>
              ) : (
                <Select value={targetId ?? ""} onValueChange={setTargetId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("costs.selectProject")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects ?? []).map((project) => (
                      <SelectItem
                        key={project.id}
                        value={project.id}
                        disabled={existingProjectIds.has(project.id)}
                      >
                        {project.name}
                        {existingProjectIds.has(project.id) && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({t("costs.alreadyConfigured")})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("costs.budgetAmountUsd")}
            </label>
            <Input
              value={amountUsd}
              onChange={(e) => {
                setAmountUsd(e.target.value);
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter showCloseButton>
          <Button
            onClick={handleSubmit}
            disabled={
              mutation.isPending ||
              (scope === "company" && companyDisabled) ||
              noTargets
            }
          >
            {mutation.isPending ? "저장 중..." : t("costs.addBudget")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
