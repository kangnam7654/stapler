import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentRole, WorkflowRouteRule } from "@paperclipai/shared";
import {
  AGENT_ROLES,
  WORKFLOW_CATEGORIES,
  WORKFLOW_EXECUTION_TARGETS,
} from "@paperclipai/shared";
import { workflowsApi } from "../api/workflows";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare } from "lucide-react";

function roleOptions() {
  return AGENT_ROLES as readonly AgentRole[];
}

function roleLabel(value: AgentRole | null | undefined) {
  if (!value) return "none";
  return value;
}

function normalizeSecondaryRole(value: string) {
  if (value.trim() === "" || value === "__none__") return null;
  return AGENT_ROLES.includes(value as AgentRole) ? (value as AgentRole) : null;
}

const DEFAULT_ROUTE_RULES: Record<(typeof WORKFLOW_CATEGORIES)[number], {
  primaryReviewerRole: AgentRole;
  secondaryReviewerRole: string;
  finalApproverRole: AgentRole;
  boardApprovalRequired: boolean;
  executionTarget: (typeof WORKFLOW_EXECUTION_TARGETS)[number];
}> = {
  engineering: {
    primaryReviewerRole: "cto",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "cto",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  hiring: {
    primaryReviewerRole: "chro",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "agent_hire",
  },
  budget: {
    primaryReviewerRole: "cfo",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  product_planning: {
    primaryReviewerRole: "pm",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  strategy_planning: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cfo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  execution_planning: {
    primaryReviewerRole: "cmo",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  tech_planning: {
    primaryReviewerRole: "cto",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "cto",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  marketing: {
    primaryReviewerRole: "cmo",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  operations: {
    primaryReviewerRole: "cfo",
    secondaryReviewerRole: "chro",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  governance: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cfo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  general: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
};

export function WorkflowRouteRulesPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { data: routeRules = [] } = useQuery({
    queryKey: queryKeys.workflows.routeRules(companyId),
    queryFn: () => workflowsApi.listRouteRules(companyId),
    refetchInterval: 30_000,
  });

  const [selectedCategory, setSelectedCategory] = useState<(typeof WORKFLOW_CATEGORIES)[number]>("engineering");
  const [primaryReviewerRole, setPrimaryReviewerRole] = useState<AgentRole>("cto");
  const [secondaryReviewerRole, setSecondaryReviewerRole] = useState("");
  const [finalApproverRole, setFinalApproverRole] = useState<AgentRole>("cto");
  const [boardApprovalRequired, setBoardApprovalRequired] = useState(false);
  const [executionTarget, setExecutionTarget] = useState<(typeof WORKFLOW_EXECUTION_TARGETS)[number]>("issue");
  const [isEnabled, setIsEnabled] = useState(true);

  const selectedRule = useMemo(
    () => routeRules.find((rule) => rule.category === selectedCategory) ?? null,
    [routeRules, selectedCategory],
  );

  useEffect(() => {
    if (selectedRule) {
      setPrimaryReviewerRole(selectedRule.primaryReviewerRole as AgentRole);
      setSecondaryReviewerRole(selectedRule.secondaryReviewerRole ?? "");
      setFinalApproverRole(selectedRule.finalApproverRole as AgentRole);
      setBoardApprovalRequired(selectedRule.boardApprovalRequired);
      setExecutionTarget(selectedRule.executionTarget);
      setIsEnabled(selectedRule.isEnabled);
      return;
    }

    const defaults = DEFAULT_ROUTE_RULES[selectedCategory];
    setPrimaryReviewerRole(defaults.primaryReviewerRole);
    setSecondaryReviewerRole(defaults.secondaryReviewerRole);
    setFinalApproverRole(defaults.finalApproverRole);
    setBoardApprovalRequired(defaults.boardApprovalRequired);
    setExecutionTarget(defaults.executionTarget);
    setIsEnabled(true);
  }, [selectedCategory, selectedRule?.id]);

  const saveRule = useMutation({
    mutationFn: () =>
      workflowsApi.createRouteRule(companyId, {
        category: selectedCategory,
        primaryReviewerRole,
        secondaryReviewerRole: normalizeSecondaryRole(secondaryReviewerRole),
        finalApproverRole,
        boardApprovalRequired,
        executionTarget,
        isEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.routeRules(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.cases(companyId) });
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Route rules</h3>
          <p className="text-xs text-muted-foreground">
            카테고리별 1차 리뷰어와 최종 승인자를 조정합니다.
          </p>
        </div>
        <Badge variant="secondary">{routeRules.length} overrides</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          {routeRules.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              message="아직 커스텀 라우트 규칙이 없습니다."
            />
          ) : (
            routeRules.map((rule: WorkflowRouteRule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setSelectedCategory(rule.category)}
                className={cn(
                  "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                  selectedCategory === rule.category
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{rule.category}</span>
                  <Badge variant={rule.isEnabled ? "secondary" : "outline"} className="ml-auto h-5 px-1.5 text-[10px]">
                    {rule.isEnabled ? "enabled" : "disabled"}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div>Primary: {roleLabel(rule.primaryReviewerRole as AgentRole)}</div>
                  <div>Secondary: {roleLabel(rule.secondaryReviewerRole as AgentRole | null)}</div>
                  <div>Final: {roleLabel(rule.finalApproverRole as AgentRole)}</div>
                  <div>Target: {rule.executionTarget}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-3">
          <div className="grid gap-3">
            <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as (typeof WORKFLOW_CATEGORIES)[number])}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {WORKFLOW_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={primaryReviewerRole} onValueChange={(value) => setPrimaryReviewerRole(value as AgentRole)}>
              <SelectTrigger><SelectValue placeholder="Primary reviewer" /></SelectTrigger>
              <SelectContent>
                {roleOptions().map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={secondaryReviewerRole || "__none__"}
              onValueChange={(value) => setSecondaryReviewerRole(value === "__none__" ? "" : value)}
            >
              <SelectTrigger><SelectValue placeholder="Secondary reviewer (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">none</SelectItem>
                {roleOptions().map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={finalApproverRole} onValueChange={(value) => setFinalApproverRole(value as AgentRole)}>
              <SelectTrigger><SelectValue placeholder="Final approver" /></SelectTrigger>
              <SelectContent>
                {roleOptions().map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={executionTarget} onValueChange={(value) => setExecutionTarget(value as (typeof WORKFLOW_EXECUTION_TARGETS)[number])}>
              <SelectTrigger><SelectValue placeholder="Execution target" /></SelectTrigger>
              <SelectContent>
                {WORKFLOW_EXECUTION_TARGETS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={boardApprovalRequired} onCheckedChange={(checked) => setBoardApprovalRequired(Boolean(checked))} />
              Board approval required
            </label>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={isEnabled} onCheckedChange={(checked) => setIsEnabled(Boolean(checked))} />
              Enabled
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              {selectedRule ? "기존 override를 편집 중입니다." : "새 override를 저장하면 기본 규칙을 덮어씁니다."}
            </div>
            <Button
              size="sm"
              disabled={saveRule.isPending}
              onClick={() => saveRule.mutate()}
            >
              Save route rule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
