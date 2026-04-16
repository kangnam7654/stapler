import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Agent,
  AgentDelegation,
  AgentDelegationStatus,
  AgentTeamMembership,
  CompanyTeamsSnapshot,
  DelegationRouteDecision,
  Team,
} from "@paperclipai/shared";
import { AGENT_DELEGATION_STATUSES, evaluateDelegationRoute } from "@paperclipai/shared";
import { agentDelegationsApi } from "../api/agentDelegations";
import { agentsApi } from "../api/agents";
import { teamsApi } from "../api/teams";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  GitBranch,
  MessageSquare,
  RefreshCw,
  Route,
  Send,
  Waypoints,
  XCircle,
} from "lucide-react";

const ACTIVE_STATUSES: AgentDelegationStatus[] = ["queued", "claimed", "in_progress", "blocked", "reported"];
const EMPTY_TEAMS_SNAPSHOT: CompanyTeamsSnapshot = { teams: [], memberships: [] };

const STATUS_LABELS: Record<AgentDelegationStatus, string> = {
  queued: "대기",
  claimed: "수락",
  in_progress: "진행 중",
  blocked: "막힘",
  reported: "보고됨",
  done: "완료",
  cancelled: "취소",
  failed: "실패",
};

const STATUS_STYLES: Record<AgentDelegationStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  claimed: "border-sky-200 bg-sky-50 text-sky-700",
  in_progress: "border-cyan-200 bg-cyan-50 text-cyan-700",
  blocked: "border-amber-200 bg-amber-50 text-amber-800",
  reported: "border-teal-200 bg-teal-50 text-teal-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-600",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const TERMINAL_STATUSES: AgentDelegationStatus[] = ["done", "cancelled", "failed"];

type FlowStepState = "done" | "current" | "waiting" | "warning" | "failed";

interface FlowStep {
  label: string;
  detail: string;
  state: FlowStepState;
}

type RouteInsightTone = "ok" | "warning" | "info";

interface RouteInsight {
  title: string;
  detail: string;
  tone: RouteInsightTone;
  pathIds: string[];
}

interface RoutingContext {
  agents: Agent[];
  teams: Team[];
  memberships: AgentTeamMembership[];
}

function formatRelativeTime(value: string | Date | null) {
  if (!value) return "없음";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return date.toLocaleDateString();
}

function formatExactTime(value: string | Date | null) {
  if (!value) return "아직 없음";
  return new Date(value).toLocaleString();
}

function agentLabel(agentMap: Map<string, Agent>, id: string | null) {
  if (!id) return "Board";
  const agent = agentMap.get(id);
  if (!agent) return id.slice(0, 8);
  return agent.title ? `${agent.name} · ${agent.title}` : agent.name;
}

function agentInitials(agentMap: Map<string, Agent>, id: string | null) {
  const label = agentLabel(agentMap, id);
  const parts = label.split(/\s+|·/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function routeLabels(agentMap: Map<string, Agent>, pathIds: string[]) {
  return pathIds.map((id) => agentLabel(agentMap, id));
}

function routeTitle(decision: DelegationRouteDecision) {
  if (decision.kind === "same_team") return "같은 팀 위임";
  if (decision.kind === "direct_report") return "정상 직속 위임";
  if (decision.kind === "skip_level") return "중간 관리자 경유 권장";
  if (decision.kind === "cross_team") return "다른 팀 경유 권장";
  if (decision.kind === "upward") return "상위자 방향 위임";
  if (decision.kind === "missing_org_parent") return "조직도 연결 확인";
  if (decision.kind === "role_fallback") return "직접 위임 정상";
  if (decision.kind === "blocked") return "위임 불가";
  if (decision.kind === "missing_agent") return "에이전트 정보 확인 필요";
  return "교차 라인 위임";
}

function routeTone(decision: DelegationRouteDecision): RouteInsightTone {
  if (decision.severity === "ok") return "ok";
  if (decision.severity === "warning" || decision.severity === "blocked") return "warning";
  return "info";
}

function buildRouteInsight(
  routing: RoutingContext,
  delegation: Pick<AgentDelegation, "delegatorAgentId" | "delegateAgentId">,
): RouteInsight {
  const decision = evaluateDelegationRoute({
    agents: routing.agents,
    teams: routing.teams,
    memberships: routing.memberships,
    delegatorAgentId: delegation.delegatorAgentId,
    delegateAgentId: delegation.delegateAgentId,
    policy: { operatingModel: "matrix" },
  });

  return {
    title: routeTitle(decision),
    detail: decision.reason,
    tone: routeTone(decision),
    pathIds: decision.recommendedPath.length > 0 ? decision.recommendedPath : decision.actualPath,
  };
}

function statusBadge(status: AgentDelegationStatus) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function countByStatus(delegations: AgentDelegation[]) {
  const counts = new Map<AgentDelegationStatus, number>();
  for (const status of AGENT_DELEGATION_STATUSES) counts.set(status, 0);
  for (const delegation of delegations) {
    counts.set(delegation.status, (counts.get(delegation.status) ?? 0) + 1);
  }
  return counts;
}

function buildFlowSteps(delegation: AgentDelegation): FlowStep[] {
  const isFailed = delegation.status === "failed";
  const isCancelled = delegation.status === "cancelled";
  const hasReport = Boolean(delegation.reportedAt || delegation.result || delegation.status === "reported" || delegation.status === "done");
  const skippedClaim = hasReport && !delegation.claimedAt;

  return [
    {
      label: "위임 생성",
      detail: formatRelativeTime(delegation.createdAt),
      state: isFailed ? "failed" : "done",
    },
    {
      label: "메시지 전달",
      detail: delegation.sourceMessageId ? "Inbox에 남음" : "메시지 없음",
      state: delegation.sourceMessageId ? "done" : "warning",
    },
    {
      label: "수락",
      detail: delegation.claimedAt ? formatRelativeTime(delegation.claimedAt) : skippedClaim ? "claim 생략" : "대기 중",
      state: delegation.claimedAt ? "done" : skippedClaim ? "warning" : "current",
    },
    {
      label: "보고",
      detail: hasReport ? formatRelativeTime(delegation.reportedAt ?? delegation.updatedAt) : isCancelled ? "취소됨" : "아직 없음",
      state: hasReport ? "done" : isCancelled ? "failed" : "waiting",
    },
  ];
}

function nextActionText(delegation: AgentDelegation) {
  if (delegation.status === "queued") return "수임자가 delegation을 읽고 claim해야 합니다.";
  if (delegation.status === "claimed") return "수임자가 작업을 시작하거나 진행 상황을 보고해야 합니다.";
  if (delegation.status === "in_progress") return "작업 중입니다. report가 들어오면 CEO에게 다시 알립니다.";
  if (delegation.status === "blocked") return "막힌 이유를 확인하고 상위자나 다른 에이전트가 풀어줘야 합니다.";
  if (delegation.status === "reported") return "상위자가 보고 내용을 검토하고 필요하면 issue에 반영하면 됩니다.";
  if (delegation.status === "done") return "완료된 위임입니다.";
  if (delegation.status === "cancelled") return "취소된 위임입니다.";
  return "실패 상태입니다. run log와 message thread를 확인하세요.";
}

function progressPercent(delegation: AgentDelegation) {
  if (delegation.status === "failed" || delegation.status === "cancelled") return 100;
  if (delegation.status === "done") return 100;
  if (delegation.status === "reported") return 86;
  if (delegation.status === "in_progress") return 64;
  if (delegation.status === "claimed") return 46;
  return delegation.sourceMessageId ? 28 : 14;
}

function stepIcon(state: FlowStepState) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (state === "current") return <Clock3 className="h-3.5 w-3.5 text-sky-600" />;
  if (state === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
  if (state === "failed") return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function AgentPill({
  agentMap,
  agentId,
  tone,
}: {
  agentMap: Map<string, Agent>;
  agentId: string | null;
  tone: "from" | "to";
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-xs">
      <Avatar size="sm" className={tone === "from" ? "bg-teal-100" : "bg-cyan-100"}>
        <AvatarFallback className={tone === "from" ? "bg-teal-100 text-teal-800" : "bg-cyan-100 text-cyan-800"}>
          {agentInitials(agentMap, agentId)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {tone === "from" ? "위임자" : "수임자"}
        </div>
        <div className="truncate text-sm font-semibold">{agentLabel(agentMap, agentId)}</div>
      </div>
    </div>
  );
}

function FlowStrip({ delegation }: { delegation: AgentDelegation }) {
  const steps = buildFlowSteps(delegation);

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {steps.map((step) => (
        <div
          key={step.label}
          className={cn(
            "rounded-xl border px-3 py-2",
            step.state === "done" && "border-emerald-100 bg-emerald-50/70",
            step.state === "current" && "border-sky-100 bg-sky-50/70",
            step.state === "warning" && "border-amber-100 bg-amber-50/70",
            step.state === "failed" && "border-red-100 bg-red-50/70",
            step.state === "waiting" && "border-border bg-muted/30",
          )}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {stepIcon(step.state)}
            {step.label}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{step.detail}</div>
        </div>
      ))}
    </div>
  );
}

function routeInsightClasses(tone: RouteInsightTone) {
  if (tone === "ok") return "border-emerald-100 bg-emerald-50/70 text-emerald-950";
  if (tone === "warning") return "border-amber-100 bg-amber-50/80 text-amber-950";
  return "border-sky-100 bg-sky-50/70 text-sky-950";
}

function RoutePath({
  agentMap,
  pathIds,
}: {
  agentMap: Map<string, Agent>;
  pathIds: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pathIds.map((id, index) => (
        <div key={`${id}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <ArrowRight className="h-3 w-3 text-muted-foreground" /> : null}
          <span className="rounded-full border border-white/70 bg-white/80 px-2 py-0.5 text-xs font-medium">
            {agentLabel(agentMap, id)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RouteInsightPanel({
  insight,
  agentMap,
  compact = false,
}: {
  insight: RouteInsight;
  agentMap: Map<string, Agent>;
  compact?: boolean;
}) {
  const Icon = insight.tone === "warning" ? AlertTriangle : insight.tone === "ok" ? CheckCircle2 : Route;

  return (
    <div className={cn("rounded-2xl border p-3", routeInsightClasses(insight.tone), compact && "p-2")}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", insight.tone === "warning" && "text-amber-700")} />
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-semibold">{insight.title}</div>
          {!compact ? <p className="text-sm opacity-80">{insight.detail}</p> : null}
          <RoutePath agentMap={agentMap} pathIds={insight.pathIds} />
        </div>
      </div>
    </div>
  );
}

function DelegationMapCard({
  delegation,
  agentMap,
  routing,
}: {
  delegation: AgentDelegation;
  agentMap: Map<string, Agent>;
  routing: RoutingContext;
}) {
  const percent = progressPercent(delegation);
  const risky = Boolean(delegation.reportedAt && !delegation.claimedAt);
  const routeInsight = buildRouteInsight(routing, delegation);

  return (
    <div className="rounded-3xl border border-teal-100 bg-linear-to-br from-teal-50 via-cyan-50 to-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(delegation.status)}
          {risky ? (
            <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">
              claim 생략
            </Badge>
          ) : null}
          {routeInsight.tone === "warning" ? (
            <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">
              경로 확인
            </Badge>
          ) : null}
          {delegation.parentDelegationId ? (
            <Badge variant="outline" className="rounded-full bg-white/60">
              Child delegation
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full bg-white/60">
              Root delegation
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">업데이트 {formatRelativeTime(delegation.updatedAt)}</div>
      </div>

      <div className="mt-4 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <AgentPill agentMap={agentMap} agentId={delegation.delegatorAgentId} tone="from" />
        <div className="flex items-center justify-center">
          <div className="rounded-full border border-teal-200 bg-white p-2 text-teal-700 shadow-xs">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
        <AgentPill agentMap={agentMap} agentId={delegation.delegateAgentId} tone="to" />
      </div>

      <div className="mt-4">
        <RouteInsightPanel insight={routeInsight} agentMap={agentMap} />
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-teal-900">진행 감각</span>
          <span className="text-muted-foreground">{percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/80">
          <div
            className={cn(
              "h-full rounded-full",
              TERMINAL_STATUSES.includes(delegation.status) ? "bg-zinc-500" : "bg-linear-to-r from-teal-500 to-cyan-500",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DelegationListItem({
  delegation,
  agentMap,
  routing,
  selected,
  onSelect,
}: {
  delegation: AgentDelegation;
  agentMap: Map<string, Agent>;
  routing: RoutingContext;
  selected: boolean;
  onSelect: () => void;
}) {
  const insight = buildRouteInsight(routing, delegation);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-3xl border p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/50",
        selected ? "border-teal-400 bg-teal-50/70" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(delegation.status)}
            {insight.tone === "warning" ? (
              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-800">
                {insight.title}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(delegation.updatedAt)}
            </span>
          </div>
          <div className="font-medium">{delegation.title}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {routeLabels(agentMap, insight.pathIds).map((label, index) => (
              <div key={`${label}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {delegation.parentDelegationId ? "하위 위임" : "최상위 위임"}
        </div>
      </div>
      {delegation.brief ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{delegation.brief}</p>
      ) : null}
      <div className="mt-4">
        <FlowStrip delegation={delegation} />
      </div>
    </button>
  );
}

export function AgentDelegationsPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | AgentDelegationStatus | "all">("active");
  const [delegatorAgentId, setDelegatorAgentId] = useState("");
  const [delegateAgentId, setDelegateAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  const filters = useMemo(() => {
    if (statusFilter === "active") return { statuses: ACTIVE_STATUSES, limit: 100 };
    if (statusFilter === "all") return { limit: 100 };
    return { status: statusFilter, limit: 100 };
  }, [statusFilter]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const teamsQuery = useQuery({
    queryKey: queryKeys.teams.list(companyId),
    queryFn: () => teamsApi.list(companyId),
  });
  const delegationsQuery = useQuery({
    queryKey: queryKeys.workflows.delegations(companyId, filters),
    queryFn: () => agentDelegationsApi.list(companyId, filters),
    refetchInterval: 10_000,
  });

  const agents = agentsQuery.data ?? [];
  const teamsSnapshot = teamsQuery.data ?? EMPTY_TEAMS_SNAPSHOT;
  const delegations = delegationsQuery.data ?? [];
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const routingContext = useMemo<RoutingContext>(() => ({
    agents,
    teams: teamsSnapshot.teams,
    memberships: teamsSnapshot.memberships,
  }), [agents, teamsSnapshot.memberships, teamsSnapshot.teams]);
  const selected = delegations.find((delegation) => delegation.id === selectedId) ?? delegations[0] ?? null;
  const counts = countByStatus(delegations);
  const activeCount = ACTIVE_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
  const draftRouteInsight = delegatorAgentId && delegateAgentId
    ? buildRouteInsight(routingContext, { delegatorAgentId, delegateAgentId })
    : null;

  const createMutation = useMutation({
    mutationFn: () => agentDelegationsApi.create(companyId, {
      delegatorAgentId,
      delegateAgentId,
      title: title.trim(),
      brief: brief.trim() || null,
      createMessage: true,
    }),
    onSuccess: (delegation) => {
      setTitle("");
      setBrief("");
      setSelectedId(delegation.id);
      queryClient.invalidateQueries({ queryKey: ["agent-delegations"] });
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
    },
  });

  const canCreate = delegatorAgentId && delegateAgentId && delegatorAgentId !== delegateAgentId && title.trim();

  return (
    <Card className="overflow-hidden rounded-3xl border-border/80 py-0">
      <CardHeader className="border-b bg-linear-to-r from-teal-50 via-cyan-50 to-slate-50 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/70">
                내부 위임
              </Badge>
              <Badge variant="outline" className="rounded-full bg-white/60">
                CEO와만 대화해도 보이는 흐름
              </Badge>
            </div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Waypoints className="h-5 w-5 text-teal-700" />
              누가 누구에게 일을 넘겼는지
            </CardTitle>
            <CardDescription className="max-w-2xl">
              위임을 메시지 목록이 아니라, 사람 간 라우팅과 단계 타임라인으로 보여줍니다.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => delegationsQuery.refetch()}
            disabled={delegationsQuery.isFetching}
            className="bg-white/70"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", delegationsQuery.isFetching && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">활성 위임</div>
            <div className="text-2xl font-semibold">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">보고 대기</div>
            <div className="text-2xl font-semibold">{counts.get("reported") ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">완료</div>
            <div className="text-2xl font-semibold">{counts.get("done") ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">막힘</div>
            <div className="text-2xl font-semibold">{counts.get("blocked") ?? 0}</div>
          </div>
        </div>

        {selected ? <DelegationMapCard delegation={selected} agentMap={agentMap} routing={routingContext} /> : null}

        <details className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
          <summary className="cursor-pointer list-none text-sm font-medium">
            수동으로 위임 만들기
          </summary>
          <div className="mt-4 grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
            <Select value={delegatorAgentId} onValueChange={setDelegatorAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="위임자" />
              </SelectTrigger>
              <SelectContent>
                {agents.filter((agent) => agent.status !== "terminated").map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={delegateAgentId} onValueChange={setDelegateAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="수임자" />
              </SelectTrigger>
              <SelectContent>
                {agents.filter((agent) => agent.status !== "terminated").map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="위임 제목" />
            <Button disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              만들기
            </Button>
            <Textarea
              className="lg:col-span-4"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="수임자가 바로 실행할 수 있게 짧게 적어주세요."
              rows={3}
            />
            {draftRouteInsight ? (
              <div className="lg:col-span-4">
                <RouteInsightPanel insight={draftRouteInsight} agentMap={agentMap} />
              </div>
            ) : null}
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          {(["active", "all", ...AGENT_DELEGATION_STATUSES] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status === "active" ? "활성" : status === "all" ? "전체" : STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        {delegations.length === 0 ? (
          <EmptyState icon={GitBranch} message="아직 추적 중인 위임이 없습니다." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-3">
              {delegations.map((delegation) => (
                <DelegationListItem
                  key={delegation.id}
                  delegation={delegation}
                  agentMap={agentMap}
                  routing={routingContext}
                  selected={selected?.id === delegation.id}
                  onSelect={() => setSelectedId(delegation.id)}
                />
              ))}
            </div>

            <aside className="rounded-3xl border border-border bg-card p-4">
              {selected ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(selected.status)}
                      <Badge variant="outline" className="rounded-full">
                        <Route className="mr-1 h-3 w-3" />
                        추적 가능
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold">{selected.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {agentLabel(agentMap, selected.delegatorAgentId)}가 {agentLabel(agentMap, selected.delegateAgentId)}에게 넘긴 일입니다.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-teal-950">
                      <MessageSquare className="h-4 w-4" />
                      지금 보면 되는 것
                    </div>
                    <p className="mt-1 text-sm text-teal-900">{nextActionText(selected)}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">단계</div>
                    <FlowStrip delegation={selected} />
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">지시</div>
                      <p className="mt-1 whitespace-pre-wrap">{selected.brief ?? "지시 내용이 없습니다."}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">보고</div>
                      <p className="mt-1 whitespace-pre-wrap">{selected.result ?? "아직 보고가 없습니다."}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">추적 포인터</div>
                    <div>ID: {selected.id}</div>
                    {selected.parentDelegationId ? <div>Parent: {selected.parentDelegationId}</div> : null}
                    {selected.rootIssueId ? <div>Root issue: {selected.rootIssueId}</div> : null}
                    {selected.linkedIssueId ? <div>Linked issue: {selected.linkedIssueId}</div> : null}
                    {selected.sourceMessageId ? <div>Source message: {selected.sourceMessageId}</div> : null}
                    <div>생성: {formatExactTime(selected.createdAt)}</div>
                    <div>수락: {formatExactTime(selected.claimedAt)}</div>
                    <div>보고: {formatExactTime(selected.reportedAt)}</div>
                  </div>
                </div>
              ) : (
                <EmptyState icon={GitBranch} message="위임을 선택하면 흐름을 자세히 볼 수 있습니다." />
              )}
            </aside>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
