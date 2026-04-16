import type { ExecutionWorkspace } from "@paperclipai/shared";
import { api } from "./client";

export interface OpenExecutionWorkspaceResult {
  path: string;
}

export const executionWorkspacesApi = {
  list: (
    companyId: string,
    filters?: {
      projectId?: string;
      projectWorkspaceId?: string;
      issueId?: string;
      status?: string;
      reuseEligible?: boolean;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.projectWorkspaceId) params.set("projectWorkspaceId", filters.projectWorkspaceId);
    if (filters?.issueId) params.set("issueId", filters.issueId);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.reuseEligible) params.set("reuseEligible", "true");
    const qs = params.toString();
    return api.get<ExecutionWorkspace[]>(`/companies/${companyId}/execution-workspaces${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<ExecutionWorkspace>(`/execution-workspaces/${id}`),
  open: (id: string) => api.post<OpenExecutionWorkspaceResult>(`/execution-workspaces/${id}/open`, {}),
  update: (id: string, data: Record<string, unknown>) => api.patch<ExecutionWorkspace>(`/execution-workspaces/${id}`, data),
};
