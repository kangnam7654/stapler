import type {
  AgentTeamMembership,
  CompanyTeamsSnapshot,
  CreateTeam,
  Team,
  UpdateAgentTeamMembership,
  UpdateTeam,
  UpsertAgentTeamMembership,
} from "@paperclipai/shared";
import { api } from "./client";

export const teamsApi = {
  list: (companyId: string) =>
    api.get<CompanyTeamsSnapshot>(`/companies/${companyId}/teams`),
  create: (companyId: string, data: CreateTeam) =>
    api.post<Team>(`/companies/${companyId}/teams`, data),
  update: (companyId: string, teamId: string, data: UpdateTeam) =>
    api.patch<Team>(`/companies/${companyId}/teams/${teamId}`, data),
  upsertMembership: (companyId: string, teamId: string, data: UpsertAgentTeamMembership) =>
    api.post<AgentTeamMembership>(`/companies/${companyId}/teams/${teamId}/memberships`, data),
  updateMembership: (companyId: string, teamId: string, membershipId: string, data: UpdateAgentTeamMembership) =>
    api.patch<AgentTeamMembership>(`/companies/${companyId}/teams/${teamId}/memberships/${membershipId}`, data),
  removeMembership: (companyId: string, teamId: string, membershipId: string) =>
    api.delete<AgentTeamMembership>(`/companies/${companyId}/teams/${teamId}/memberships/${membershipId}`),
};
