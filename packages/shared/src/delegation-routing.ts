import type {
  AgentRole,
  AgentStatus,
  AgentTeamMembershipRole,
  TeamKind,
  TeamStatus,
} from "./constants.js";

export type DelegationOperatingModel = "matrix" | "product_squads" | "functional_hierarchy" | "flat";

export type DelegationRouteSeverity = "ok" | "info" | "warning" | "blocked";

export type DelegationRouteKind =
  | "same_team"
  | "direct_report"
  | "skip_level"
  | "cross_team"
  | "cross_line"
  | "upward"
  | "missing_org_parent"
  | "role_fallback"
  | "missing_agent"
  | "blocked";

export interface DelegationRoutingAgent {
  id: string;
  name?: string;
  role: AgentRole;
  status: AgentStatus;
  reportsTo: string | null;
}

export interface DelegationRoutingTeam {
  id: string;
  name?: string;
  kind: TeamKind;
  parentTeamId: string | null;
  leadAgentId: string | null;
  status: TeamStatus;
}

export interface DelegationRoutingMembership {
  id?: string;
  teamId: string;
  agentId: string;
  roleInTeam: AgentTeamMembershipRole;
  isPrimary: boolean;
}

export interface DelegationRoutingPolicy {
  operatingModel?: DelegationOperatingModel;
  roleFallback?: Partial<Record<AgentRole, AgentRole[]>>;
}

export interface DelegationRouteDecision {
  allowed: boolean;
  severity: DelegationRouteSeverity;
  kind: DelegationRouteKind;
  actualPath: string[];
  recommendedPath: string[];
  recommendedNextDelegateId: string | null;
  reason: string;
  targetTeamId: string | null;
  expectedManagerRole: AgentRole | null;
  expectedManagerAgentId: string | null;
}

export interface EvaluateDelegationRouteInput {
  agents: DelegationRoutingAgent[];
  teams?: DelegationRoutingTeam[];
  memberships?: DelegationRoutingMembership[];
  delegatorAgentId: string;
  delegateAgentId: string;
  policy?: DelegationRoutingPolicy;
}

const DEFAULT_ROLE_FALLBACK: Record<AgentRole, AgentRole[]> = {
  ceo: [],
  chro: ["ceo"],
  cto: ["ceo"],
  cmo: ["ceo"],
  cfo: ["ceo"],
  engineer: ["cto"],
  designer: ["cto"],
  pm: ["ceo"],
  qa: ["cto"],
  devops: ["cto"],
  researcher: ["ceo"],
  general: ["ceo"],
};

function decision(input: {
  allowed?: boolean;
  severity: DelegationRouteSeverity;
  kind: DelegationRouteKind;
  actualPath: string[];
  recommendedPath?: string[];
  recommendedNextDelegateId?: string | null;
  reason: string;
  targetTeamId?: string | null;
  expectedManagerRole?: AgentRole | null;
  expectedManagerAgentId?: string | null;
}): DelegationRouteDecision {
  return {
    allowed: input.allowed ?? input.severity !== "blocked",
    severity: input.severity,
    kind: input.kind,
    actualPath: input.actualPath,
    recommendedPath: input.recommendedPath ?? input.actualPath,
    recommendedNextDelegateId: input.recommendedNextDelegateId ?? null,
    reason: input.reason,
    targetTeamId: input.targetTeamId ?? null,
    expectedManagerRole: input.expectedManagerRole ?? null,
    expectedManagerAgentId: input.expectedManagerAgentId ?? null,
  };
}

function activeTeam(team: DelegationRoutingTeam | undefined) {
  return team && team.status === "active" ? team : null;
}

function activeMembershipsForAgent(
  memberships: DelegationRoutingMembership[],
  teamsById: Map<string, DelegationRoutingTeam>,
  agentId: string,
) {
  return memberships.filter((membership) => {
    if (membership.agentId !== agentId) return false;
    return Boolean(activeTeam(teamsById.get(membership.teamId)));
  });
}

function primaryTeamForAgent(
  memberships: DelegationRoutingMembership[],
  teamsById: Map<string, DelegationRoutingTeam>,
  agentId: string,
) {
  const agentMemberships = activeMembershipsForAgent(memberships, teamsById, agentId);
  const primary = agentMemberships.find((membership) => membership.isPrimary) ?? agentMemberships[0] ?? null;
  return primary ? activeTeam(teamsById.get(primary.teamId)) : null;
}

function isTeamLeadLike(membership: DelegationRoutingMembership | undefined) {
  return membership?.roleInTeam === "lead" || membership?.roleInTeam === "owner";
}

function membershipForTeam(
  memberships: DelegationRoutingMembership[],
  agentId: string,
  teamId: string,
) {
  return memberships.find((membership) => membership.agentId === agentId && membership.teamId === teamId);
}

function managerChain(agentsById: Map<string, DelegationRoutingAgent>, agentId: string) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = agentsById.get(agentId);

  while (current && !seen.has(current.id)) {
    chain.push(current.id);
    seen.add(current.id);
    current = current.reportsTo ? agentsById.get(current.reportsTo) : undefined;
  }

  return chain;
}

function findExpectedManager(
  agents: DelegationRoutingAgent[],
  delegate: DelegationRoutingAgent,
  roleFallback: Record<AgentRole, AgentRole[]>,
) {
  const expectedRoles = roleFallback[delegate.role] ?? [];
  for (const role of expectedRoles) {
    const manager = agents.find((agent) => agent.id !== delegate.id && agent.role === role && agent.status !== "terminated");
    if (manager) return { role, manager };
  }
  return { role: expectedRoles[0] ?? null, manager: null };
}

function shouldPreferTeamRouting(model: DelegationOperatingModel) {
  return model === "matrix" || model === "product_squads";
}

export function evaluateDelegationRoute(input: EvaluateDelegationRouteInput): DelegationRouteDecision {
  const agentsById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const teams = input.teams ?? [];
  const memberships = input.memberships ?? [];
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const policy = input.policy ?? {};
  const operatingModel = policy.operatingModel ?? "matrix";
  const roleFallback = {
    ...DEFAULT_ROLE_FALLBACK,
    ...(policy.roleFallback ?? {}),
  };

  const delegator = agentsById.get(input.delegatorAgentId);
  const delegate = agentsById.get(input.delegateAgentId);
  const actualPath = [input.delegatorAgentId, input.delegateAgentId].filter(Boolean);

  if (!delegator || !delegate) {
    return decision({
      allowed: false,
      severity: "info",
      kind: "missing_agent",
      actualPath,
      reason: "위임자나 수임자의 에이전트 정보를 찾지 못했습니다.",
    });
  }

  if (delegator.id === delegate.id) {
    return decision({
      severity: "blocked",
      kind: "blocked",
      actualPath: [delegator.id],
      reason: "자기 자신에게는 위임할 수 없습니다.",
    });
  }

  if (delegate.status === "terminated" || delegate.status === "pending_approval") {
    return decision({
      severity: "blocked",
      kind: "blocked",
      actualPath,
      reason: "종료되었거나 승인 대기 중인 에이전트에게는 위임할 수 없습니다.",
    });
  }

  const delegatorTeam = primaryTeamForAgent(memberships, teamsById, delegator.id);
  const delegateTeam = primaryTeamForAgent(memberships, teamsById, delegate.id);

  if (shouldPreferTeamRouting(operatingModel) && delegatorTeam && delegateTeam) {
    if (delegatorTeam.id === delegateTeam.id) {
      const delegatorMembership = membershipForTeam(memberships, delegator.id, delegatorTeam.id);
      return decision({
        severity: "ok",
        kind: "same_team",
        actualPath,
        reason: isTeamLeadLike(delegatorMembership)
          ? "같은 제품 팀 안에서 팀 리드나 오너가 위임했습니다."
          : "같은 제품 팀 안의 위임입니다.",
        targetTeamId: delegateTeam.id,
      });
    }

    const leadId = delegateTeam.leadAgentId && delegateTeam.leadAgentId !== delegator.id && delegateTeam.leadAgentId !== delegate.id
      ? delegateTeam.leadAgentId
      : null;
    return decision({
      severity: "warning",
      kind: "cross_team",
      actualPath,
      recommendedPath: leadId ? [delegator.id, leadId, delegate.id] : actualPath,
      recommendedNextDelegateId: leadId,
      reason: leadId
        ? "다른 제품 팀 구성원에게 직접 위임했습니다. 대상 팀 리드를 경유하면 책임 경계가 더 선명합니다."
        : "다른 제품 팀 구성원에게 직접 위임했습니다. 대상 팀 리드가 없어 직접 위임으로 기록됩니다.",
      targetTeamId: delegateTeam.id,
    });
  }

  if (delegate.reportsTo === delegator.id) {
    return decision({
      severity: "ok",
      kind: "direct_report",
      actualPath,
      reason: "조직도상 직속 관계의 위임입니다.",
    });
  }

  const delegateChain = managerChain(agentsById, delegate.id);
  const delegatorIndex = delegateChain.indexOf(delegator.id);
  if (delegatorIndex > 0) {
    const recommendedPath = delegateChain.slice(0, delegatorIndex + 1).reverse();
    return decision({
      severity: "warning",
      kind: "skip_level",
      actualPath,
      recommendedPath,
      recommendedNextDelegateId: recommendedPath[1] ?? null,
      reason: "조직도상 중간 관리자를 건너뛴 위임입니다.",
    });
  }

  const delegatorChain = managerChain(agentsById, delegator.id);
  if (delegatorChain.includes(delegate.id)) {
    return decision({
      severity: "warning",
      kind: "upward",
      actualPath,
      reason: "조직도상 상위자에게 위임하는 형태입니다. 위임보다 보고나 요청에 가까울 수 있습니다.",
    });
  }

  if (!delegate.reportsTo) {
    const expected = findExpectedManager(input.agents, delegate, roleFallback);
    if (expected.manager) {
      return decision({
        severity: "warning",
        kind: "missing_org_parent",
        actualPath,
        recommendedPath: [delegator.id, expected.manager.id, delegate.id],
        recommendedNextDelegateId: expected.manager.id,
        reason: "수임자의 조직도 상위자가 비어 있습니다. 역할 기반 fallback 후보를 확인하세요.",
        expectedManagerRole: expected.role,
        expectedManagerAgentId: expected.manager.id,
      });
    }

    return decision({
      severity: "ok",
      kind: "role_fallback",
      actualPath,
      reason: "수임자의 조직도 상위자와 역할 기반 manager 후보가 없어 직접 위임을 fallback으로 허용합니다.",
      expectedManagerRole: expected.role,
    });
  }

  if (operatingModel === "flat") {
    return decision({
      severity: "info",
      kind: "cross_line",
      actualPath,
      reason: "flat 운영 모델에서는 다른 라인 위임을 허용합니다.",
    });
  }

  return decision({
    severity: "warning",
    kind: "cross_line",
    actualPath,
    reason: "조직도상 다른 라인의 에이전트에게 위임했습니다.",
  });
}
