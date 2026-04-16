import type {
  AgentTeamMembershipRole,
  TeamKind,
  TeamStatus,
} from "../constants.js";

export interface Team {
  id: string;
  companyId: string;
  name: string;
  kind: TeamKind;
  parentTeamId: string | null;
  leadAgentId: string | null;
  status: TeamStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTeamMembership {
  id: string;
  companyId: string;
  teamId: string;
  agentId: string;
  roleInTeam: AgentTeamMembershipRole;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyTeamsSnapshot {
  teams: Team[];
  memberships: AgentTeamMembership[];
}
