import type { AgentDelegation, CreateAgentDelegation, ReportAgentDelegation, UpdateAgentDelegation } from "@paperclipai/shared";
import { api } from "./client";

export interface AgentDelegationFilters {
  status?: string;
  statuses?: string[];
  delegatorAgentId?: string;
  delegateAgentId?: string;
  parentDelegationId?: string;
  rootIssueId?: string;
  linkedIssueId?: string;
  limit?: number;
}

function toQueryString(filters?: AgentDelegationFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.statuses?.length) params.set("statuses", filters.statuses.join(","));
  if (filters?.delegatorAgentId) params.set("delegatorAgentId", filters.delegatorAgentId);
  if (filters?.delegateAgentId) params.set("delegateAgentId", filters.delegateAgentId);
  if (filters?.parentDelegationId) params.set("parentDelegationId", filters.parentDelegationId);
  if (filters?.rootIssueId) params.set("rootIssueId", filters.rootIssueId);
  if (filters?.linkedIssueId) params.set("linkedIssueId", filters.linkedIssueId);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const agentDelegationsApi = {
  list: (companyId: string, filters?: AgentDelegationFilters) =>
    api.get<AgentDelegation[]>(`/companies/${companyId}/delegations${toQueryString(filters)}`),
  get: (companyId: string, delegationId: string) =>
    api.get<AgentDelegation>(`/companies/${companyId}/delegations/${delegationId}`),
  create: (companyId: string, data: CreateAgentDelegation) =>
    api.post<AgentDelegation>(`/companies/${companyId}/delegations`, data),
  update: (delegationId: string, data: UpdateAgentDelegation) =>
    api.patch<AgentDelegation>(`/delegations/${delegationId}`, data),
  claim: (delegationId: string) =>
    api.post<AgentDelegation>(`/delegations/${delegationId}/claim`, {}),
  report: (delegationId: string, data: ReportAgentDelegation) =>
    api.post<AgentDelegation>(`/delegations/${delegationId}/report`, data),
  cancel: (delegationId: string) =>
    api.post<AgentDelegation>(`/delegations/${delegationId}/cancel`, {}),
};
