/**
 * GlobalModal — 4-step wizard for company-wide adapter swap.
 *
 * Step 1: Pick a target adapter type (provider).
 * Step 2: Enter config for the new provider (uses provider's ConfigFields).
 * Step 3: Pick which agents to transform (multi-select, any adapter type).
 * Step 4: Confirm — summary + [확인] → POST /bulk-apply mode=swap-adapter.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../../api/agents";
import { bulkApplyAgentConfig } from "../../api/bulk-apply";
import { useToast } from "../../context/ToastContext";
import { listUIAdapters, getUIAdapter } from "../../adapters/registry";
import type { AdapterConfigFieldsProps } from "../../adapters/types";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

interface GlobalModalProps {
  companyId: string;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export function GlobalModal({ companyId, onClose }: GlobalModalProps) {
  const { pushToast } = useToast();
  const adapters = useMemo(() => listUIAdapters(), []);

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: selected adapter type
  const [targetAdapterType, setTargetAdapterType] = useState<string>("");

  // Step 2: new config for target adapter (built via eff/mark pattern)
  const [newConfig, setNewConfig] = useState<Record<string, unknown>>({});
  // dirty holds only explicitly changed fields in the config form
  const [configDirty, setConfigDirty] = useState<Record<string, unknown>>({});

  // Step 3: selected agent IDs
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    new Set(),
  );

  // ── Fetch agents ───────────────────────────────────────────────────────────
  const {
    data: allAgents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
  });

  // ── Reset config when adapter type changes ────────────────────────────────
  const prevAdapterTypeRef = useRef(targetAdapterType);
  useEffect(() => {
    if (prevAdapterTypeRef.current !== targetAdapterType) {
      setNewConfig({});
      setConfigDirty({});
      prevAdapterTypeRef.current = targetAdapterType;
    }
  }, [targetAdapterType]);

  // ── Adapter config eff/mark pattern (same as ProviderDefaultCard) ─────────
  const eff: AdapterConfigFieldsProps["eff"] = (_group, field, original) => {
    return field in configDirty
      ? (configDirty[field] as typeof original)
      : original;
  };

  const mark: AdapterConfigFieldsProps["mark"] = (_group, field, value) => {
    setConfigDirty((prev) => {
      if (value === undefined) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: value };
    });
    setNewConfig((prev) => {
      if (value === undefined) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: value };
    });
  };

  // ── Agent selection helpers ────────────────────────────────────────────────
  const agentList = allAgents ?? [];

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedAgentIds.size === agentList.length) {
      setSelectedAgentIds(new Set());
    } else {
      setSelectedAgentIds(new Set(agentList.map((a) => a.id)));
    }
  }

  const allSelected = agentList.length > 0 && selectedAgentIds.size === agentList.length;
  const someSelected =
    selectedAgentIds.size > 0 && selectedAgentIds.size < agentList.length;

  // ── Swap mutation ──────────────────────────────────────────────────────────
  const swapMutation = useMutation({
    mutationFn: () =>
      bulkApplyAgentConfig(companyId, {
        mode: "swap-adapter",
        agentIds: Array.from(selectedAgentIds),
        newAdapterType: targetAdapterType,
        newAdapterConfig: { ...newConfig, ...configDirty },
      }),
    onSuccess: (result) => {
      const adapter = getUIAdapter(targetAdapterType);
      pushToast({
        title: "어댑터 일괄 교체 완료",
        body: `${result.updatedAgentIds.length}개 에이전트가 ${adapter.label}(으)로 교체됐습니다.`,
        tone: "success",
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        title: "어댑터 일괄 교체 실패",
        body: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
        tone: "error",
      });
    },
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goNext() {
    setStep((s) => Math.min(s + 1, 4) as WizardStep);
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  }

  const canGoNextStep1 = !!targetAdapterType;
  const canGoNextStep3 = selectedAgentIds.size > 0;

  const selectedAdapterLabel = targetAdapterType
    ? getUIAdapter(targetAdapterType).label
    : "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <DialogHeader>
        <DialogTitle>에이전트 어댑터 교체</DialogTitle>
        <DialogDescription>
          <WizardStepIndicator current={step} total={4} />
        </DialogDescription>
      </DialogHeader>

      <div className="py-1">
        {step === 1 && (
          <StepPickProvider
            adapters={adapters}
            value={targetAdapterType}
            onChange={setTargetAdapterType}
          />
        )}

        {step === 2 && targetAdapterType && (
          <StepConfigProvider
            targetAdapterType={targetAdapterType}
            targetAdapterLabel={selectedAdapterLabel}
            newConfig={newConfig}
            eff={eff}
            mark={mark}
          />
        )}

        {step === 3 && (
          <StepPickAgents
            agents={agentList}
            isLoading={agentsLoading}
            error={agentsError}
            selectedIds={selectedAgentIds}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggle={toggleAgent}
            onToggleAll={toggleAll}
          />
        )}

        {step === 4 && (
          <StepConfirm
            targetAdapterLabel={selectedAdapterLabel}
            targetAdapterType={targetAdapterType}
            newConfig={{ ...newConfig, ...configDirty }}
            agents={agentList.filter((a) => selectedAgentIds.has(a.id))}
            error={swapMutation.error ?? null}
          />
        )}
      </div>

      <DialogFooter className="flex-row items-center justify-between">
        <div>
          {step > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={swapMutation.isPending}
              aria-label="이전 단계"
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              이전
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={swapMutation.isPending}>
            취소
          </Button>
          {step < 4 && (
            <Button
              onClick={goNext}
              disabled={
                (step === 1 && !canGoNextStep1) ||
                (step === 3 && !canGoNextStep3)
              }
              aria-label="다음 단계"
            >
              다음
              <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          {step === 4 && (
            <Button
              onClick={() => swapMutation.mutate()}
              disabled={swapMutation.isPending}
              aria-label="어댑터 일괄 교체 확인"
            >
              {swapMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              확인
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function WizardStepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const labels = ["Provider 선택", "설정 입력", "에이전트 선택", "확인"];
  return (
    <div className="flex items-center gap-1.5 mt-1" role="list" aria-label="진행 단계">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-1.5" role="listitem">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
              i + 1 === current
                ? "bg-primary text-primary-foreground"
                : i + 1 < current
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
            aria-current={i + 1 === current ? "step" : undefined}
          >
            {i + 1}
          </span>
          <span
            className={`text-[11px] ${
              i + 1 === current ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {labels[i]}
          </span>
          {i < total - 1 && (
            <span className="mx-0.5 text-muted-foreground/40" aria-hidden="true">
              /
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Pick provider ──────────────────────────────────────────────────────

function StepPickProvider({
  adapters,
  value,
  onChange,
}: {
  adapters: { type: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        에이전트를 이전할 대상 어댑터를 선택하세요.
      </p>
      <div>
        <Label htmlFor="global-target-adapter" className="mb-1.5 block text-xs font-medium">
          대상 어댑터
        </Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id="global-target-adapter" className="w-full">
            <SelectValue placeholder="어댑터를 선택하세요..." />
          </SelectTrigger>
          <SelectContent>
            {adapters.map((adapter) => (
              <SelectItem key={adapter.type} value={adapter.type}>
                <span>{adapter.label}</span>
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                  {adapter.type}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Step 2: Config provider ────────────────────────────────────────────────────

function StepConfigProvider({
  targetAdapterType,
  targetAdapterLabel,
  newConfig,
  eff,
  mark,
}: {
  targetAdapterType: string;
  targetAdapterLabel: string;
  newConfig: Record<string, unknown>;
  eff: AdapterConfigFieldsProps["eff"];
  mark: AdapterConfigFieldsProps["mark"];
}) {
  const { ConfigFields } = getUIAdapter(targetAdapterType);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{targetAdapterLabel}</span>
        의 새 설정값을 입력하세요. 이 값이 선택한 에이전트에 일괄 적용됩니다.
      </p>
      <div className="rounded-md border border-border px-4 py-4 space-y-3">
        <ConfigFields
          mode="edit"
          isCreate={false}
          adapterType={targetAdapterType}
          values={null}
          set={null}
          config={newConfig}
          eff={eff}
          mark={mark}
          models={[]}
        />
      </div>
    </div>
  );
}

// ── Step 3: Pick agents ────────────────────────────────────────────────────────

function StepPickAgents({
  agents,
  isLoading,
  error,
  selectedIds,
  allSelected,
  someSelected,
  onToggle,
  onToggleAll,
}: {
  agents: Agent[];
  isLoading: boolean;
  error: Error | null;
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="불러오는 중" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          에이전트 목록을 불러오지 못했습니다:{" "}
          {error instanceof Error ? error.message : "알 수 없는 오류"}
        </span>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        이 회사에 에이전트가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          어댑터를 교체할 에이전트를 선택하세요. ({selectedIds.size}/{agents.length})
        </p>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          aria-pressed={allSelected}
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <ScrollArea className="max-h-64 rounded-md border border-border">
        <ul className="divide-y divide-border" role="list">
          {agents.map((agent) => (
            <li key={agent.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={`global-agent-${agent.id}`}
                checked={selectedIds.has(agent.id)}
                onCheckedChange={() => onToggle(agent.id)}
                aria-label={`${agent.name} 선택`}
              />
              <Label
                htmlFor={`global-agent-${agent.id}`}
                className="flex-1 cursor-pointer leading-none"
              >
                <span className="text-sm">{agent.name}</span>
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                  {agent.adapterType}
                </span>
              </Label>
            </li>
          ))}
        </ul>
      </ScrollArea>
      {someSelected && (
        <p className="text-[11px] text-muted-foreground">
          {selectedIds.size}개 에이전트 선택됨
        </p>
      )}
    </div>
  );
}

// ── Step 4: Confirm ────────────────────────────────────────────────────────────

function StepConfirm({
  targetAdapterLabel,
  targetAdapterType,
  newConfig,
  agents,
  error,
}: {
  targetAdapterLabel: string;
  targetAdapterType: string;
  newConfig: Record<string, unknown>;
  agents: Agent[];
  error: Error | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        아래 변경 내용을 확인하고 <span className="font-medium text-foreground">[확인]</span>을 누르세요. 이 작업은 되돌릴 수 없습니다.
      </p>

      {/* Summary */}
      <div className="rounded-md border border-border divide-y divide-border text-sm">
        <div className="flex items-start gap-2 px-4 py-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground w-20">대상 어댑터</span>
          <span>
            {targetAdapterLabel}{" "}
            <span className="font-mono text-[10px] text-muted-foreground">
              ({targetAdapterType})
            </span>
          </span>
        </div>
        <div className="flex items-start gap-2 px-4 py-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground w-20">새 설정</span>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">
            {Object.keys(newConfig).length === 0
              ? "(설정값 없음)"
              : JSON.stringify(newConfig, null, 2)}
          </pre>
        </div>
        <div className="flex items-start gap-2 px-4 py-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground w-20">
            에이전트 ({agents.length})
          </span>
          <ScrollArea className="max-h-28 w-full">
            <ul className="space-y-0.5" role="list">
              {agents.map((agent) => (
                <li key={agent.id} className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-muted-foreground font-mono">
                    {agent.adapterType} →{" "}
                    <span className="text-primary">{targetAdapterType}</span>
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {error instanceof Error
              ? error.message
              : "어댑터 교체 중 오류가 발생했습니다."}
          </span>
        </div>
      )}
    </div>
  );
}
