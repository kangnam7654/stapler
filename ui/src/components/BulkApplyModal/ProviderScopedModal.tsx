/**
 * ProviderScopedModal — lets admins push adapter-default changes to agents
 * that use a specific provider.
 *
 * Shows:
 *  - A list of agents using this provider (checkboxes for selection)
 *  - A field selector for which keys to affect
 *  - A diff preview (before → after for each selected agent)
 *  - Two primary actions:
 *    [회사 기본값 상속] → POST /bulk-apply mode=inherit (strips selected fields)
 *    [회사 값 적용]    → POST /bulk-apply mode=override (sets selected field values)
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../../api/agents";
import { bulkApplyAgentConfig } from "../../api/bulk-apply";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

interface ProviderScopedModalProps {
  companyId: string;
  providerId: string;
  providerLabel: string;
  companyDefaults: Record<string, unknown>;
  onClose: () => void;
}

export function ProviderScopedModal({
  companyId,
  providerId,
  providerLabel,
  companyDefaults,
  onClose,
}: ProviderScopedModalProps) {
  const { pushToast } = useToast();

  // ── Fetch agents for this company ──────────────────────────────────────────
  const {
    data: allAgents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
  });

  // Only agents using this provider
  const providerAgents = useMemo(
    () => (allAgents ?? []).filter((a) => a.adapterType === providerId),
    [allAgents, providerId],
  );

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    new Set(),
  );

  // When agent list loads, default-select all
  useEffect(() => {
    if (providerAgents.length > 0) {
      setSelectedAgentIds(new Set(providerAgents.map((a) => a.id)));
    }
  }, [providerAgents]);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedAgentIds.size === providerAgents.length) {
      setSelectedAgentIds(new Set());
    } else {
      setSelectedAgentIds(new Set(providerAgents.map((a) => a.id)));
    }
  }

  // ── Field selector ─────────────────────────────────────────────────────────
  const defaultFieldKeys = Object.keys(companyDefaults);

  // Default: all company-default fields selected
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(defaultFieldKeys),
  );

  // If companyDefaults changes (e.g. parent re-renders with new data), resync
  useEffect(() => {
    setSelectedFields(new Set(Object.keys(companyDefaults)));
  }, [companyDefaults]);

  function toggleField(key: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedFieldsArray = Array.from(selectedFields);

  // ── Diff preview ───────────────────────────────────────────────────────────
  function getDiffRows(agent: Agent) {
    return selectedFieldsArray.map((field) => {
      const before =
        field in agent.adapterConfig
          ? JSON.stringify(agent.adapterConfig[field])
          : "(상속됨)";
      const after =
        field in companyDefaults
          ? JSON.stringify(companyDefaults[field])
          : "(상속됨)";
      return { field, before, after };
    });
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const inheritMutation = useMutation({
    mutationFn: () =>
      bulkApplyAgentConfig(companyId, {
        mode: "inherit",
        agentIds: Array.from(selectedAgentIds),
        fields: selectedFieldsArray,
      }),
    onSuccess: (result) => {
      pushToast({
        title: `${providerLabel} — 상속 적용 완료`,
        body: `${result.updatedAgentIds.length}개 에이전트가 회사 기본값을 상속합니다.`,
        tone: "success",
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        title: `${providerLabel} — 상속 적용 실패`,
        body: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
        tone: "error",
      });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: () => {
      const fields: Record<string, unknown> = {};
      for (const key of selectedFieldsArray) {
        if (key in companyDefaults) {
          fields[key] = companyDefaults[key];
        }
      }
      return bulkApplyAgentConfig(companyId, {
        mode: "override",
        agentIds: Array.from(selectedAgentIds),
        fields,
      });
    },
    onSuccess: (result) => {
      pushToast({
        title: `${providerLabel} — 값 적용 완료`,
        body: `${result.updatedAgentIds.length}개 에이전트에 회사 기본값이 적용됐습니다.`,
        tone: "success",
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        title: `${providerLabel} — 값 적용 실패`,
        body: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
        tone: "error",
      });
    },
  });

  const isBusy = inheritMutation.isPending || overrideMutation.isPending;
  const canSubmit =
    selectedAgentIds.size > 0 && selectedFieldsArray.length > 0 && !isBusy;

  // ── Error display ──────────────────────────────────────────────────────────
  const mutationError = inheritMutation.error ?? overrideMutation.error;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (agentsLoading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{providerLabel} — 에이전트에 일괄 적용</DialogTitle>
          <DialogDescription>
            에이전트 목록을 불러오는 중...
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="불러오는 중" />
        </div>
      </>
    );
  }

  if (agentsError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{providerLabel} — 에이전트에 일괄 적용</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            에이전트 목록을 불러오지 못했습니다:{" "}
            {agentsError instanceof Error ? agentsError.message : "알 수 없는 오류"}
          </span>
        </div>
        <DialogFooter showCloseButton>
          <span />
        </DialogFooter>
      </>
    );
  }

  if (providerAgents.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{providerLabel} — 에이전트에 일괄 적용</DialogTitle>
          <DialogDescription>
            이 provider를 사용하는 에이전트가 없습니다.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-4 text-center">
          <span className="font-mono text-xs">{providerId}</span> 어댑터를 사용하는 에이전트가 없습니다.
        </p>
        <DialogFooter showCloseButton>
          <span />
        </DialogFooter>
      </>
    );
  }

  const selectedAgentsArray = providerAgents.filter((a) =>
    selectedAgentIds.has(a.id),
  );
  const allSelected = selectedAgentIds.size === providerAgents.length;
  const someSelected =
    selectedAgentIds.size > 0 && selectedAgentIds.size < providerAgents.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{providerLabel} — 에이전트에 일괄 적용</DialogTitle>
        <DialogDescription>
          선택한 에이전트에 회사 기본값을 적용하거나 상속하도록 설정합니다.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-1">
        {/* ── Agent selector ───────────────────────────────────────────── */}
        <section aria-labelledby="agent-selector-heading">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="agent-selector-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              에이전트 ({selectedAgentIds.size}/{providerAgents.length})
            </h3>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              aria-pressed={allSelected}
            >
              {allSelected ? "전체 해제" : "전체 선택"}
            </button>
          </div>
          <ScrollArea className="max-h-36 rounded-md border border-border">
            <ul className="divide-y divide-border" role="list">
              {providerAgents.map((agent) => (
                <li key={agent.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={`agent-${agent.id}`}
                    checked={selectedAgentIds.has(agent.id)}
                    onCheckedChange={() => toggleAgent(agent.id)}
                    aria-label={`${agent.name} 선택`}
                  />
                  <Label
                    htmlFor={`agent-${agent.id}`}
                    className="flex-1 cursor-pointer text-sm leading-none"
                  >
                    {agent.name}
                    <span className="ml-1.5 text-[10px] font-mono text-muted-foreground/60">
                      {agent.id.slice(0, 8)}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          </ScrollArea>
          {someSelected && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {selectedAgentIds.size}개 에이전트 선택됨
            </p>
          )}
        </section>

        {/* ── Field selector ────────────────────────────────────────────── */}
        <section aria-labelledby="field-selector-heading">
          <h3 id="field-selector-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            적용할 필드 ({selectedFieldsArray.length}/{defaultFieldKeys.length})
          </h3>
          {defaultFieldKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-border px-3 py-2">
              설정된 회사 기본값이 없습니다. 먼저 이 provider의 기본값을 설정하세요.
            </p>
          ) : (
            <ul className="space-y-1.5 rounded-md border border-border px-3 py-2" role="list">
              {defaultFieldKeys.map((key) => (
                <li key={key} className="flex items-center gap-3">
                  <Checkbox
                    id={`field-${key}`}
                    checked={selectedFields.has(key)}
                    onCheckedChange={() => toggleField(key)}
                    aria-label={`${key} 필드 선택`}
                  />
                  <Label htmlFor={`field-${key}`} className="flex-1 cursor-pointer text-sm leading-none">
                    <span className="font-mono">{key}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      = {JSON.stringify(companyDefaults[key])}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Diff preview ──────────────────────────────────────────────── */}
        {selectedAgentsArray.length > 0 && selectedFieldsArray.length > 0 && (
          <section aria-labelledby="diff-preview-heading">
            <h3 id="diff-preview-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              변경 미리보기
            </h3>
            <ScrollArea className="max-h-48 rounded-md border border-border">
              <div className="divide-y divide-border">
                {selectedAgentsArray.map((agent) => {
                  const rows = getDiffRows(agent);
                  return (
                    <div key={agent.id} className="px-3 py-2">
                      <p className="mb-1.5 text-xs font-medium">{agent.name}</p>
                      <table className="w-full text-[11px]" aria-label={`${agent.name} 변경 내용`}>
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-medium pb-0.5 w-1/3">필드</th>
                            <th className="text-left font-medium pb-0.5 w-1/3">현재 값</th>
                            <th className="text-left font-medium pb-0.5 w-1/3">적용 후</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ field, before, after }) => (
                            <tr key={field} className="align-top">
                              <td className="font-mono pr-2 py-0.5 text-muted-foreground">{field}</td>
                              <td className="font-mono pr-2 py-0.5 text-destructive/80 line-through">
                                {before}
                              </td>
                              <td className="font-mono py-0.5 text-green-600 dark:text-green-400">
                                {after}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </section>
        )}

        {/* ── Error display ─────────────────────────────────────────────── */}
        {mutationError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {mutationError instanceof Error
                ? mutationError.message
                : "일괄 적용 중 오류가 발생했습니다."}
            </span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isBusy}>
          취소
        </Button>
        <Button
          variant="outline"
          onClick={() => inheritMutation.mutate()}
          disabled={!canSubmit || defaultFieldKeys.length === 0}
          aria-label="선택한 필드를 회사 기본값에서 상속하도록 설정"
        >
          {inheritMutation.isPending && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          회사 기본값 상속
        </Button>
        <Button
          onClick={() => overrideMutation.mutate()}
          disabled={!canSubmit || defaultFieldKeys.length === 0}
          aria-label="회사 기본값을 에이전트에 직접 적용"
        >
          {overrideMutation.isPending && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          회사 값 적용
        </Button>
      </DialogFooter>
    </>
  );
}
