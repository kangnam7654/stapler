import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentRole } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import {
  workflowsApi,
  type WorkflowCaseBundle,
} from "../api/workflows";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Plus } from "lucide-react";
import {
  AGENT_ROLES,
  WORKFLOW_CATEGORIES,
  WORKFLOW_CASE_KINDS,
  WORKFLOW_CASE_KIND_LABELS,
  WORKFLOW_CASE_KIND_PRESETS,
  WORKFLOW_CASE_STATUSES,
  WORKFLOW_ARTIFACT_KINDS,
  WORKFLOW_REVIEW_STATUSES,
} from "@paperclipai/shared";

const WORKFLOW_FLOW_STEPS = [
  { key: "draft", label: "Intake", description: "Capture the request" },
  { key: "in_review", label: "Brief", description: "Shape the proposal" },
  { key: "revision_requested", label: "Review", description: "Refine with feedback" },
  { key: "approved", label: "Decision", description: "Approve or reject" },
  { key: "executing", label: "Handoff", description: "Send to execution" },
] as const;

function workflowStageIndex(status: string | null | undefined) {
  switch (status) {
    case "draft":
      return 0;
    case "revision_requested":
      return 2;
    case "in_review":
      return 1;
    case "approved":
      return 3;
    case "executing":
    case "done":
      return 4;
    case "rejected":
    case "cancelled":
      return 3;
    default:
      return 0;
  }
}

function formatTime(value: string | Date | null | undefined) {
  if (!value) return "unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function isWorkflowCaseBundle(data: WorkflowCaseBundle | undefined): data is WorkflowCaseBundle {
  return Boolean(data);
}

function participantLabel(agentMap: Map<string, Agent>, agentId: string | null) {
  if (!agentId) return "Unknown";
  return agentMap.get(agentId)?.name ?? agentId.slice(0, 8);
}

function workflowKindLabel(kind: (typeof WORKFLOW_CASE_KINDS)[number]) {
  return WORKFLOW_CASE_KIND_LABELS[kind];
}

function workflowKindPreset(kind: (typeof WORKFLOW_CASE_KINDS)[number]) {
  return WORKFLOW_CASE_KIND_PRESETS[kind];
}

type WorkflowKindField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  inputType?: "text" | "number";
};

function workflowKindDetailDraft(
  kind: (typeof WORKFLOW_CASE_KINDS)[number],
  source: Record<string, unknown> = {},
) {
  const preset = workflowKindPreset(kind);
  const draft = Object.fromEntries(preset.fields.map((field) => [field.key, ""])) as Record<string, string>;
  for (const field of preset.fields) {
    const value = source[field.key];
    if (value === undefined || value === null) continue;
    draft[field.key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return draft;
}

export function WorkflowInbox({
  companyId,
  agentId,
  selectedCaseId: selectedCaseIdProp,
  onCaseSelect,
}: {
  companyId: string;
  agentId?: string;
  selectedCaseId?: string | null;
  onCaseSelect?: (caseId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [internalSelectedCaseId, setInternalSelectedCaseId] = useState<string | null>(selectedCaseIdProp ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof WORKFLOW_CASE_KINDS)[number]>("general_request");
  const [details, setDetails] = useState<Record<string, string>>(() => workflowKindDetailDraft("general_request"));
  const [summary, setSummary] = useState("");
  const [caseKindFilter, setCaseKindFilter] = useState<string>("all");
  const [caseCategoryFilter, setCaseCategoryFilter] = useState<string>("all");
  const [caseStatusFilter, setCaseStatusFilter] = useState<string>("all");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editKind, setEditKind] = useState<(typeof WORKFLOW_CASE_KINDS)[number]>("general_request");
  const [editDetails, setEditDetails] = useState<Record<string, string>>(() => workflowKindDetailDraft("general_request"));
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactBody, setArtifactBody] = useState("");
  const [artifactKind, setArtifactKind] = useState<(typeof WORKFLOW_ARTIFACT_KINDS)[number]>("draft");
  const [reviewStatus, setReviewStatus] = useState<(typeof WORKFLOW_REVIEW_STATUSES)[number]>("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [decisionRole, setDecisionRole] = useState<AgentRole>("ceo");

  const selectedCaseId = selectedCaseIdProp ?? internalSelectedCaseId;

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ["workflow-cases", companyId, caseKindFilter, caseCategoryFilter, caseStatusFilter] as const,
    queryFn: () =>
      workflowsApi.listCases(companyId, {
        kind: caseKindFilter === "all" ? undefined : caseKindFilter,
        category: caseCategoryFilter === "all" ? undefined : caseCategoryFilter,
        status: caseStatusFilter === "all" ? undefined : caseStatusFilter,
      }),
    refetchInterval: 5000,
  });

  const selectedCaseQuery = useQuery({
    queryKey: selectedCaseId ? queryKeys.workflows.caseDetail(companyId, selectedCaseId) : ["workflow-cases", companyId, "__none__"],
    queryFn: () => workflowsApi.getCase(companyId, selectedCaseId!),
    enabled: Boolean(selectedCaseId),
    refetchInterval: 5000,
  });
  const selectedWorkflowCase = selectedCaseQuery.data?.workflowCase ?? null;

  useEffect(() => {
    if (selectedCaseIdProp !== undefined) {
      setInternalSelectedCaseId(selectedCaseIdProp);
      return;
    }
    if (internalSelectedCaseId && cases.some((item) => item.id === internalSelectedCaseId)) return;
    setInternalSelectedCaseId(cases[0]?.id ?? null);
  }, [cases, internalSelectedCaseId, selectedCaseIdProp]);

  useEffect(() => {
    setDetails(workflowKindDetailDraft(kind));
  }, [kind]);

  useEffect(() => {
    if (!selectedWorkflowCase) return;
    setEditTitle(selectedWorkflowCase.title);
    setEditSummary(selectedWorkflowCase.summary ?? "");
    setEditKind(selectedWorkflowCase.kind);
    setEditDetails(workflowKindDetailDraft(selectedWorkflowCase.kind, selectedWorkflowCase.details));
  }, [selectedWorkflowCase?.id]);

  useEffect(() => {
    setEditDetails((current) => workflowKindDetailDraft(editKind, current));
  }, [editKind]);

  const kindPreset = workflowKindPreset(kind);
  const category = kindPreset.defaultCategory;
  const executionTarget = kindPreset.defaultExecutionTarget;
  const kindFields = kindPreset.fields as readonly WorkflowKindField[];
  const editKindPreset = workflowKindPreset(editKind);
  const editKindFields = editKindPreset.fields as readonly WorkflowKindField[];
  const workflowStepIndex = workflowStageIndex(selectedWorkflowCase?.status ?? cases[0]?.status);

  const createCase = useMutation({
    mutationFn: () =>
      workflowsApi.createCase(companyId, {
        kind,
        category,
        executionTarget,
        title: title.trim(),
        summary: summary.trim() || null,
        details,
        requestedByAgentId: agentId ?? null,
      }),
    onSuccess: (created) => {
      setTitle("");
      setSummary("");
      setKind("general_request");
      setDetails(workflowKindDetailDraft("general_request"));
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["workflow-cases"] });
      setInternalSelectedCaseId(created.id);
      onCaseSelect?.(created.id);
    },
  });

  const updateCase = useMutation({
    mutationFn: () => {
      if (!selectedCaseId) throw new Error("Select an intake first.");
      return workflowsApi.updateCase(selectedCaseId, {
        title: editTitle.trim(),
        summary: editSummary.trim() || null,
        kind: editKind,
        category: editKindPreset.defaultCategory,
        executionTarget: editKindPreset.defaultExecutionTarget,
        details: editDetails,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-cases"] });
      if (selectedCaseId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.caseDetail(companyId, selectedCaseId) });
      }
    },
  });

  const addArtifact = useMutation({
    mutationFn: () => {
      if (!selectedCaseId) throw new Error("Select an intake first.");
      return workflowsApi.createArtifact(selectedCaseId, {
        kind: artifactKind,
        title: artifactTitle.trim() || `${artifactKind} draft`,
        body: artifactBody.trim(),
        metadata: {},
      });
    },
    onSuccess: () => {
      setArtifactTitle("");
      setArtifactBody("");
      queryClient.invalidateQueries({ queryKey: ["workflow-cases"] });
      if (selectedCaseId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.caseDetail(companyId, selectedCaseId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.artifacts(selectedCaseId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.reviews(selectedCaseId) });
      }
    },
  });

  const submitReview = useMutation({
    mutationFn: () => {
      if (!selectedCaseId) throw new Error("Select an intake first.");
      return workflowsApi.submitReview(selectedCaseId, {
        reviewerRole: decisionRole,
        status: reviewStatus,
        decisionNote: reviewNote.trim() || null,
        reviewSummary: reviewNote.trim() || null,
      });
    },
    onSuccess: () => {
      setReviewNote("");
      queryClient.invalidateQueries({ queryKey: ["workflow-cases"] });
      if (selectedCaseId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.caseDetail(companyId, selectedCaseId) });
      }
    },
  });

  const approveCase = useMutation({
    mutationFn: () => {
      if (!selectedCaseId) throw new Error("Select an intake first.");
      return workflowsApi.approve(selectedCaseId, {
        approverRole: decisionRole,
        decisionNote: reviewNote.trim() || null,
      });
    },
    onSuccess: () => {
      setReviewNote("");
      queryClient.invalidateQueries({ queryKey: ["workflow-cases"] });
      if (selectedCaseId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.caseDetail(companyId, selectedCaseId) });
      }
    },
  });

  if (casesLoading) {
    return <PageSkeleton variant="detail" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Workflow flow</h3>
          <p className="text-xs text-muted-foreground">
            한 건의 요청을 intake에서 handoff까지 자연스럽게 넘깁니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {showCreate ? "닫기" : "새 intake"}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {WORKFLOW_FLOW_STEPS.map((step, index) => {
          const active = index === workflowStepIndex;
          const done = index < workflowStepIndex;
          return (
            <div
              key={step.key}
              className={cn(
                "rounded-2xl border p-3 transition-colors",
                active
                  ? "border-primary/40 bg-primary/5"
                  : done
                    ? "border-emerald-400/30 bg-emerald-400/5"
                    : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{step.label}</div>
                <Badge variant={active ? "secondary" : done ? "outline" : "outline"} className="h-5 px-1.5 text-[10px]">
                  {index + 1}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{step.description}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Start an intake</h4>
            <p className="text-xs text-muted-foreground">
              작업 종류를 고르면 필요한 brief 항목이 따라 나옵니다.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCreate((value) => !value)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {showCreate ? "Hide" : "Show form"}
          </Button>
        </div>

        {showCreate && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="워크플로 제목" />
            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
              <SelectTrigger><SelectValue placeholder="Task kind" /></SelectTrigger>
              <SelectContent>
                {WORKFLOW_CASE_KINDS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {WORKFLOW_CASE_KIND_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {kindPreset.description}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {agentId ? `Requested by ${participantLabel(agentMap, agentId)}` : "Company-level request"}
              <Badge variant="secondary">{category}</Badge>
              <Badge variant="outline">{executionTarget}</Badge>
            </div>
          </div>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="요약" rows={3} />
            <div className="grid gap-3 md:grid-cols-2">
              {kindFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                  {field.multiline ? (
                    <Textarea
                      value={details[field.key] ?? ""}
                      onChange={(e) => setDetails((current) => ({ ...current, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      rows={3}
                    />
                  ) : (
                    <Input
                      type={field.inputType ?? "text"}
                      value={details[field.key] ?? ""}
                      onChange={(e) => setDetails((current) => ({ ...current, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!title.trim() || createCase.isPending}
                onClick={() => createCase.mutate()}
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </div>

      <details className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground">
          Filters and search
        </summary>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <Select value={caseKindFilter} onValueChange={setCaseKindFilter}>
            <SelectTrigger><SelectValue placeholder="Filter by kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {WORKFLOW_CASE_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {WORKFLOW_CASE_KIND_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={caseCategoryFilter} onValueChange={setCaseCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Filter by category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {WORKFLOW_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={caseStatusFilter} onValueChange={setCaseStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {WORKFLOW_CASE_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {cases.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              message="아직 intake가 없습니다."
              action="새 intake"
              onAction={() => setShowCreate(true)}
            />
          ) : (
            cases.map((item) => {
              const selected = item.id === selectedCaseId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                    selected ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/40",
                  )}
                  onClick={() => {
                    setInternalSelectedCaseId(item.id);
                    onCaseSelect?.(item.id);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                      {workflowKindLabel(item.kind)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{item.status}</Badge>
                    <span>{item.category}</span>
                    <span className="ml-auto">{formatTime(item.updatedAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          {!isWorkflowCaseBundle(selectedCaseQuery.data) ? (
            <EmptyState icon={MessageSquare} message="왼쪽에서 하나를 선택하면 brief, review, handoff가 이어집니다." />
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold">{selectedCaseQuery.data.workflowCase.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {workflowKindLabel(selectedCaseQuery.data.workflowCase.kind)} · {selectedCaseQuery.data.workflowCase.category}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{selectedCaseQuery.data.workflowCase.status}</Badge>
                    <Badge variant="outline">{selectedCaseQuery.data.workflowCase.executionTarget}</Badge>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedCaseQuery.data.workflowCase.summary ?? "요약 없음"}
                </p>

                <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <div>Requester: {participantLabel(agentMap, selectedCaseQuery.data.workflowCase.requestedByAgentId)}</div>
                  <div>Reviewer: {selectedCaseQuery.data.workflowCase.primaryReviewerRole}</div>
                  <div>Final approver: {selectedCaseQuery.data.workflowCase.finalApproverRole}</div>
                  <div>Route target: {selectedCaseQuery.data.workflowCase.executionTarget}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-semibold">Edit intake</h5>
                    <p className="text-xs text-muted-foreground">kind를 바꾸면 category와 execution target이 함께 따라갑니다.</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{editKindPreset.defaultCategory}</Badge>
                    <Badge variant="outline">{editKindPreset.defaultExecutionTarget}</Badge>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                  <Select value={editKind} onValueChange={(value) => setEditKind(value as typeof editKind)}>
                    <SelectTrigger><SelectValue placeholder="Task kind" /></SelectTrigger>
                    <SelectContent>
                      {WORKFLOW_CASE_KINDS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {WORKFLOW_CASE_KIND_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {editKindPreset.description}
                </div>
                <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="Summary" rows={3} />
                <div className="grid gap-3 md:grid-cols-2">
                  {editKindFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                      {field.multiline ? (
                        <Textarea
                          value={editDetails[field.key] ?? ""}
                          onChange={(e) => setEditDetails((current) => ({ ...current, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          rows={3}
                        />
                      ) : (
                        <Input
                          type={field.inputType ?? "text"}
                          value={editDetails[field.key] ?? ""}
                          onChange={(e) => setEditDetails((current) => ({ ...current, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!editTitle.trim() || updateCase.isPending}
                    onClick={() => updateCase.mutate()}
                  >
                    Save changes
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <h5 className="text-sm font-semibold">Briefs</h5>
                <div className="space-y-2">
                  {selectedCaseQuery.data.artifacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">아직 brief가 없습니다.</p>
                  ) : (
                    selectedCaseQuery.data.artifacts.map((artifact) => (
                      <div key={artifact.id} className="rounded-xl border border-border/70 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{artifact.title}</div>
                          <div className="text-xs text-muted-foreground">
                            v{artifact.version} · {artifact.kind}
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{artifact.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Select value={artifactKind} onValueChange={(value) => setArtifactKind(value as typeof artifactKind)}>
                      <SelectTrigger><SelectValue placeholder="Brief kind" /></SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_ARTIFACT_KINDS.map((item: (typeof WORKFLOW_ARTIFACT_KINDS)[number]) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} placeholder="Brief title" />
                  </div>
                  <Textarea value={artifactBody} onChange={(e) => setArtifactBody(e.target.value)} placeholder="Brief body" rows={4} />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!artifactBody.trim() || addArtifact.isPending}
                      onClick={() => addArtifact.mutate()}
                    >
                      Save brief
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <h5 className="text-sm font-semibold">Reviews</h5>
                <div className="space-y-2">
                  {selectedCaseQuery.data.reviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground">아직 리뷰가 없습니다.</p>
                  ) : (
                    selectedCaseQuery.data.reviews.map((review) => (
                      <div key={review.id} className="rounded-xl border border-border/70 p-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{review.reviewerRole}</span>
                          <span>{formatTime(review.createdAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary">{review.status}</Badge>
                          {review.artifactId && <span className="text-xs text-muted-foreground">artifact {review.artifactId.slice(0, 8)}</span>}
                        </div>
                        {review.decisionNote && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{review.decisionNote}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-border/70 p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <Select value={decisionRole} onValueChange={(value) => setDecisionRole(value as AgentRole)}>
                      <SelectTrigger><SelectValue placeholder="Reviewer role" /></SelectTrigger>
                      <SelectContent>
                        {AGENT_ROLES.map((item: AgentRole) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={reviewStatus} onValueChange={(value) => setReviewStatus(value as typeof reviewStatus)}>
                      <SelectTrigger><SelectValue placeholder="Decision" /></SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_REVIEW_STATUSES.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Review note" rows={3} />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!reviewNote.trim() || submitReview.isPending}
                      onClick={() => submitReview.mutate()}
                    >
                      Submit review
                    </Button>
                    <Button
                      size="sm"
                      disabled={!reviewNote.trim() || approveCase.isPending}
                      onClick={() => approveCase.mutate()}
                    >
                      Approve and handoff
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
