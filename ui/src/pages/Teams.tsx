import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AGENT_ROLE_LABELS,
  AGENT_TEAM_MEMBERSHIP_ROLES,
  TEAM_KINDS,
  type Agent,
  type AgentTeamMembership,
  type AgentTeamMembershipRole,
  type Team,
  type TeamKind,
  type TeamStatus,
} from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { teamsApi } from "../api/teams";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, cn } from "../lib/utils";
import { AgentIcon } from "../components/AgentIconPicker";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Crown,
  GitBranch,
  type LucideIcon,
  Plus,
  RefreshCw,
  Route,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

const NONE_VALUE = "__none__";

const TEAM_KIND_COPY: Record<TeamKind, string> = {
  product_squad: "제품 스쿼드",
  functional: "기능팀",
  platform: "플랫폼",
  ops: "운영",
  division: "디비전",
};

const TEAM_KIND_HINT: Record<TeamKind, string> = {
  product_squad: "프론트, 서버, PM처럼 여러 역할이 한 제품/기능을 맡는 팀",
  functional: "프론트엔드팀, 서버팀처럼 같은 직무 중심의 팀",
  platform: "공통 인프라나 내부 플랫폼을 맡는 팀",
  ops: "운영, 지원, 품질 게이트를 맡는 팀",
  division: "여러 팀을 묶는 상위 조직",
};

const MEMBERSHIP_ROLE_COPY: Record<AgentTeamMembershipRole, string> = {
  lead: "리드",
  member: "멤버",
  reviewer: "리뷰어",
  owner: "오너",
};

const STATUS_COPY: Record<TeamStatus, string> = {
  active: "활성",
  archived: "보관됨",
};

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function nullableId(value: string): string | null {
  return value === NONE_VALUE ? null : value;
}

function selectId(value: string | null | undefined): string {
  return value ?? NONE_VALUE;
}

function agentLabel(agent: Agent | undefined): string {
  if (!agent) return "알 수 없는 에이전트";
  const role = roleLabels[agent.role] ?? agent.role;
  return agent.title ? `${agent.name} · ${agent.title}` : `${agent.name} · ${role}`;
}

function getDescendantTeamIds(teamId: string, teams: Team[]) {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const team of teams) {
      if (!team.parentTeamId) continue;
      if ((team.parentTeamId === teamId || descendants.has(team.parentTeamId)) && !descendants.has(team.id)) {
        descendants.add(team.id);
        changed = true;
      }
    }
  }
  return descendants;
}

function sortAgents(agents: Agent[]) {
  return [...agents].sort((a, b) => a.name.localeCompare(b.name));
}

function TeamKindBadge({ kind }: { kind: TeamKind }) {
  const tone = {
    product_squad: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
    functional: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    platform: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200",
    ops: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    division: "border-stone-500/30 bg-stone-500/10 text-stone-700 dark:text-stone-200",
  } satisfies Record<TeamKind, string>;

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", tone[kind])}>
      {TEAM_KIND_COPY[kind]}
    </span>
  );
}

export function Teams() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createKind, setCreateKind] = useState<TeamKind>("product_squad");
  const [createParentTeamId, setCreateParentTeamId] = useState(NONE_VALUE);
  const [createLeadAgentId, setCreateLeadAgentId] = useState(NONE_VALUE);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<TeamKind>("product_squad");
  const [editParentTeamId, setEditParentTeamId] = useState(NONE_VALUE);
  const [editLeadAgentId, setEditLeadAgentId] = useState(NONE_VALUE);
  const [editStatus, setEditStatus] = useState<TeamStatus>("active");
  const [newMemberAgentId, setNewMemberAgentId] = useState(NONE_VALUE);
  const [newMemberRole, setNewMemberRole] = useState<AgentTeamMembershipRole>("member");
  const [newMemberPrimary, setNewMemberPrimary] = useState(true);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "회사", href: "/dashboard" },
      { label: "팀 운영" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const teamsQuery = useQuery({
    queryKey: queryKeys.teams.list(selectedCompanyId!),
    queryFn: () => teamsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agents = agentsQuery.data ?? [];
  const liveAgents = sortAgents(agents.filter((agent) => agent.status !== "terminated"));
  const teams = teamsQuery.data?.teams ?? [];
  const memberships = teamsQuery.data?.memberships ?? [];
  const activeTeams = teams.filter((team) => team.status === "active");
  const selectedTeam = selectedTeamId ? teams.find((team) => team.id === selectedTeamId) ?? null : null;
  const selectedTeamMemberships = selectedTeam
    ? memberships.filter((membership) => membership.teamId === selectedTeam.id)
    : [];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const selectedDescendants = selectedTeam ? getDescendantTeamIds(selectedTeam.id, teams) : new Set<string>();
  const editableParentTeams = activeTeams.filter((team) => team.id !== selectedTeam?.id && !selectedDescendants.has(team.id));
  const selectedMemberAgentIds = new Set(selectedTeamMemberships.map((membership) => membership.agentId));
  const availableMemberAgents = liveAgents.filter((agent) => !selectedMemberAgentIds.has(agent.id));
  const primaryMembershipCount = selectedTeamMemberships.filter((membership) => membership.isPrimary).length;
  const selectedLead = selectedTeam?.leadAgentId ? agentById.get(selectedTeam.leadAgentId) : undefined;
  const editDirty = !!selectedTeam && (
    editName.trim() !== selectedTeam.name ||
    editKind !== selectedTeam.kind ||
    nullableId(editParentTeamId) !== selectedTeam.parentTeamId ||
    nullableId(editLeadAgentId) !== selectedTeam.leadAgentId ||
    editStatus !== selectedTeam.status
  );

  useEffect(() => {
    if (teams.length === 0) {
      setSelectedTeamId(null);
      return;
    }
    if (!selectedTeamId || !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0]!.id);
    }
  }, [selectedTeamId, teams]);

  useEffect(() => {
    if (!selectedTeam) return;
    setEditName(selectedTeam.name);
    setEditKind(selectedTeam.kind);
    setEditParentTeamId(selectId(selectedTeam.parentTeamId));
    setEditLeadAgentId(selectId(selectedTeam.leadAgentId));
    setEditStatus(selectedTeam.status);
    setNewMemberAgentId(NONE_VALUE);
    setNewMemberRole("member");
    setNewMemberPrimary(true);
  }, [selectedTeam?.id]);

  async function invalidateTeamState() {
    if (!selectedCompanyId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: ["agent-delegations"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(selectedCompanyId) }),
    ]);
  }

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("회사를 먼저 선택해 주세요.");
      const name = createName.trim();
      if (!name) throw new Error("팀 이름을 입력해 주세요.");
      return teamsApi.create(selectedCompanyId, {
        name,
        kind: createKind,
        parentTeamId: nullableId(createParentTeamId),
        leadAgentId: nullableId(createLeadAgentId),
      });
    },
    onSuccess: async (team) => {
      setSelectedTeamId(team.id);
      setCreateName("");
      setCreateKind("product_squad");
      setCreateParentTeamId(NONE_VALUE);
      setCreateLeadAgentId(NONE_VALUE);
      pushToast({ tone: "success", title: "팀을 만들었습니다" });
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "팀 생성 실패" });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !selectedTeam) throw new Error("팀을 먼저 선택해 주세요.");
      const name = editName.trim();
      if (!name) throw new Error("팀 이름을 입력해 주세요.");
      return teamsApi.update(selectedCompanyId, selectedTeam.id, {
        name,
        kind: editKind,
        parentTeamId: nullableId(editParentTeamId),
        leadAgentId: nullableId(editLeadAgentId),
        status: editStatus,
      });
    },
    onSuccess: async () => {
      pushToast({ tone: "success", title: "팀 설정을 저장했습니다" });
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "팀 저장 실패" });
    },
  });

  const setTeamStatusMutation = useMutation({
    mutationFn: async (status: TeamStatus) => {
      if (!selectedCompanyId || !selectedTeam) throw new Error("팀을 먼저 선택해 주세요.");
      return teamsApi.update(selectedCompanyId, selectedTeam.id, { status });
    },
    onSuccess: async (team) => {
      setEditStatus(team.status);
      pushToast({ tone: "success", title: team.status === "archived" ? "팀을 보관했습니다" : "팀을 다시 활성화했습니다" });
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "팀 상태 변경 실패" });
    },
  });

  const addMembershipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !selectedTeam) throw new Error("팀을 먼저 선택해 주세요.");
      if (newMemberAgentId === NONE_VALUE) throw new Error("추가할 에이전트를 선택해 주세요.");
      return teamsApi.upsertMembership(selectedCompanyId, selectedTeam.id, {
        agentId: newMemberAgentId,
        roleInTeam: newMemberRole,
        isPrimary: newMemberPrimary,
      });
    },
    onSuccess: async () => {
      setNewMemberAgentId(NONE_VALUE);
      setNewMemberRole("member");
      setNewMemberPrimary(true);
      pushToast({ tone: "success", title: "팀 멤버를 추가했습니다" });
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "팀 멤버 추가 실패" });
    },
  });

  const updateMembershipMutation = useMutation({
    mutationFn: async ({
      membership,
      patch,
    }: {
      membership: AgentTeamMembership;
      patch: { roleInTeam?: AgentTeamMembershipRole; isPrimary?: boolean };
    }) => {
      if (!selectedCompanyId) throw new Error("회사를 먼저 선택해 주세요.");
      return teamsApi.updateMembership(selectedCompanyId, membership.teamId, membership.id, patch);
    },
    onSuccess: async () => {
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "멤버 설정 변경 실패" });
    },
  });

  const removeMembershipMutation = useMutation({
    mutationFn: async (membership: AgentTeamMembership) => {
      if (!selectedCompanyId) throw new Error("회사를 먼저 선택해 주세요.");
      return teamsApi.removeMembership(selectedCompanyId, membership.teamId, membership.id);
    },
    onSuccess: async () => {
      pushToast({ tone: "success", title: "팀 멤버를 제거했습니다" });
      await invalidateTeamState();
    },
    onError: (error) => {
      pushToast({ tone: "error", title: error instanceof Error ? error.message : "팀 멤버 제거 실패" });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UsersRound} message="팀을 관리하려면 회사를 먼저 선택해 주세요." />;
  }

  if (agentsQuery.isLoading || teamsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative px-5 py-5 sm:px-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_36%),linear-gradient(135deg,hsl(var(--muted)/0.6),transparent)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Delegation Routing Layer
                </span>
                <Badge variant="outline" className="bg-background/70">
                  Soft rule
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">팀 운영</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  조직도는 보고 체계, 팀은 위임 경로의 운영 맥락으로 사용합니다. 같은 팀이면 바로 위임,
                  다른 팀이면 대상 팀 리드 경유를 추천하는 식으로 LLM 추측을 줄입니다.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
              <Metric label="팀" value={teams.length} />
              <Metric label="활성 팀" value={activeTeams.length} />
              <Metric label="멤버십" value={memberships.length} />
            </div>
          </div>
        </div>
      </div>

      {(agentsQuery.error || teamsQuery.error) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {agentsQuery.error instanceof Error
            ? agentsQuery.error.message
            : teamsQuery.error instanceof Error
              ? teamsQuery.error.message
              : "팀 데이터를 불러오지 못했습니다."}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="rounded-xl border-border/80 py-0">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Plus className="h-4 w-4 text-muted-foreground" />
                새 팀 만들기
              </CardTitle>
              <CardDescription className="text-xs">
                처음에는 제품 스쿼드 하나만 만들어도 충분합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <Field label="팀 이름">
                <Input
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="예: Checkout Squad"
                />
              </Field>
              <Field label="팀 유형">
                <TeamKindSelect value={createKind} onChange={setCreateKind} />
              </Field>
              <Field label="상위 팀">
                <TeamSelect
                  value={createParentTeamId}
                  teams={activeTeams}
                  placeholder="상위 팀 없음"
                  onChange={setCreateParentTeamId}
                />
              </Field>
              <Field label="팀 리드">
                <AgentSelect
                  value={createLeadAgentId}
                  agents={liveAgents}
                  placeholder="나중에 지정"
                  onChange={setCreateLeadAgentId}
                />
              </Field>
              <Button
                className="w-full"
                onClick={() => createTeamMutation.mutate()}
                disabled={createTeamMutation.isPending || !createName.trim()}
              >
                {createTeamMutation.isPending ? "생성 중..." : "팀 생성"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/80 py-0">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                팀 목록
              </CardTitle>
              <CardDescription className="text-xs">
                팀을 선택하면 멤버십과 위임 라우팅 정보를 편집할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              {teams.length === 0 ? (
                <div className="px-2 pb-4">
                  <EmptyState icon={UsersRound} message="아직 팀이 없습니다. 첫 제품 스쿼드를 만들어 보세요." />
                </div>
              ) : (
                <div className="space-y-1">
                  {teams.map((team) => {
                    const teamMemberships = memberships.filter((membership) => membership.teamId === team.id);
                    const lead = team.leadAgentId ? agentById.get(team.leadAgentId) : undefined;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSelectedTeamId(team.id)}
                        className={cn(
                          "w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/50",
                          selectedTeamId === team.id && "bg-accent text-accent-foreground",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{team.name}</span>
                              {team.status === "archived" && (
                                <Badge variant="outline" className="text-[10px]">보관</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <TeamKindBadge kind={team.kind} />
                              <span className="text-[11px] text-muted-foreground">
                                {teamMemberships.length}명
                              </span>
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              리드: {lead?.name ?? "미지정"}
                            </p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedTeam ? (
          <div className="space-y-4">
            <Card className="rounded-xl border-border/80 py-0">
              <CardHeader className="border-b border-border/70 px-5 pb-4 pt-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <TeamKindBadge kind={selectedTeam.kind} />
                      <StatusBadge status={selectedTeam.status} />
                    </div>
                    <CardTitle className="text-xl">{selectedTeam.name}</CardTitle>
                    <CardDescription>
                      {TEAM_KIND_HINT[selectedTeam.kind]}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => teamsQuery.refetch()}
                      disabled={teamsQuery.isFetching}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", teamsQuery.isFetching && "animate-spin")} />
                      새로고침
                    </Button>
                    {selectedTeam.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTeamStatusMutation.mutate("archived")}
                        disabled={setTeamStatusMutation.isPending}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        보관
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTeamStatusMutation.mutate("active")}
                        disabled={setTeamStatusMutation.isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        활성화
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <RoutingStat
                    icon={Crown}
                    label="팀 리드"
                    value={selectedLead?.name ?? "미지정"}
                    hint="다른 팀에서 이 팀으로 위임할 때 추천 경유지"
                  />
                  <RoutingStat
                    icon={GitBranch}
                    label="상위 팀"
                    value={selectedTeam.parentTeamId ? teamById.get(selectedTeam.parentTeamId)?.name ?? "알 수 없음" : "없음"}
                    hint="팀도 계층화할 때 쓰는 soft signal"
                  />
                  <RoutingStat
                    icon={Route}
                    label="라우팅 대상"
                    value={`${selectedTeamMemberships.length}명 / primary ${primaryMembershipCount}`}
                    hint="primary 팀이 위임 판단에 우선 반영됨"
                  />
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">위임 판단에 이렇게 반영됩니다</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        이 팀의 primary 멤버끼리는 <span className="font-mono text-foreground">same_team</span>으로 표시됩니다.
                        다른 팀에서 이 팀 멤버에게 바로 위임하면, 팀 리드가 있으면 리드 경유를 추천합니다.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="팀 이름">
                    <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                  </Field>
                  <Field label="팀 유형">
                    <TeamKindSelect value={editKind} onChange={setEditKind} />
                  </Field>
                  <Field label="상위 팀">
                    <TeamSelect
                      value={editParentTeamId}
                      teams={editableParentTeams}
                      placeholder="상위 팀 없음"
                      onChange={setEditParentTeamId}
                    />
                  </Field>
                  <Field label="팀 리드">
                    <AgentSelect
                      value={editLeadAgentId}
                      agents={liveAgents}
                      placeholder="리드 없음"
                      onChange={setEditLeadAgentId}
                    />
                  </Field>
                  <Field label="상태">
                    <Select value={editStatus} onValueChange={(value) => setEditStatus(value as TeamStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{STATUS_COPY.active}</SelectItem>
                        <SelectItem value="archived">{STATUS_COPY.archived}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => updateTeamMutation.mutate()}
                    disabled={updateTeamMutation.isPending || !editDirty || !editName.trim()}
                  >
                    {updateTeamMutation.isPending ? "저장 중..." : "팀 설정 저장"}
                  </Button>
                  {!editDirty && (
                    <span className="text-xs text-muted-foreground">변경 사항 없음</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/80 py-0">
              <CardHeader className="border-b border-border/70 px-5 pb-4 pt-5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound className="h-4 w-4 text-muted-foreground" />
                  멤버십
                </CardTitle>
                <CardDescription>
                  에이전트의 primary 팀은 위임 라우팅에서 가장 먼저 쓰입니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-5 py-5">
                <div className="grid gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_160px_130px_auto]">
                  <AgentSelect
                    value={newMemberAgentId}
                    agents={availableMemberAgents}
                    placeholder={availableMemberAgents.length === 0 ? "추가 가능한 에이전트 없음" : "에이전트 선택"}
                    onChange={setNewMemberAgentId}
                  />
                  <MembershipRoleSelect value={newMemberRole} onChange={setNewMemberRole} />
                  <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs">
                    <input
                      type="checkbox"
                      checked={newMemberPrimary}
                      onChange={(event) => setNewMemberPrimary(event.target.checked)}
                    />
                    primary 팀
                  </label>
                  <Button
                    onClick={() => addMembershipMutation.mutate()}
                    disabled={addMembershipMutation.isPending || newMemberAgentId === NONE_VALUE}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>

                {selectedTeamMemberships.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                    <UsersRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-medium">아직 멤버가 없습니다</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      팀 멤버를 추가해야 위임 라우팅에서 팀 경로가 보입니다.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    {selectedTeamMemberships.map((membership) => {
                      const agent = agentById.get(membership.agentId);
                      return (
                        <div
                          key={membership.id}
                          className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_160px_120px_auto]"
                        >
                          <Link to={agent ? agentUrl(agent) : `/agents/${membership.agentId}`} className="flex min-w-0 items-center gap-3 no-underline">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                              <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {agent?.name ?? membership.agentId}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {agent ? agentLabel(agent) : "에이전트 정보를 불러올 수 없음"}
                              </p>
                            </div>
                          </Link>
                          <MembershipRoleSelect
                            value={membership.roleInTeam}
                            onChange={(roleInTeam) => updateMembershipMutation.mutate({
                              membership,
                              patch: { roleInTeam },
                            })}
                          />
                          <Button
                            variant={membership.isPrimary ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => updateMembershipMutation.mutate({
                              membership,
                              patch: { isPrimary: !membership.isPrimary },
                            })}
                            disabled={updateMembershipMutation.isPending}
                          >
                            {membership.isPrimary ? "Primary" : "Set primary"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="멤버 제거"
                            onClick={() => removeMembershipMutation.mutate(membership)}
                            disabled={removeMembershipMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="rounded-xl border-border/80 py-0">
            <CardContent className="py-12">
              <EmptyState icon={UsersRound} message="왼쪽에서 팀을 만들거나 선택해 주세요." />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/75 px-3 py-3 shadow-sm">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function RoutingStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TeamKindSelect({ value, onChange }: { value: TeamKind; onChange: (value: TeamKind) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as TeamKind)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TEAM_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {TEAM_KIND_COPY[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MembershipRoleSelect({
  value,
  onChange,
}: {
  value: AgentTeamMembershipRole;
  onChange: (value: AgentTeamMembershipRole) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AgentTeamMembershipRole)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AGENT_TEAM_MEMBERSHIP_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {MEMBERSHIP_ROLE_COPY[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TeamSelect({
  value,
  teams,
  placeholder,
  onChange,
}: {
  value: string;
  teams: Team[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AgentSelect({
  value,
  agents,
  placeholder,
  onChange,
}: {
  value: string;
  agents: Agent[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agentLabel(agent)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
