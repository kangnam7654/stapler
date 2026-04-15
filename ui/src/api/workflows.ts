import type {
  CreateWorkflowArtifact,
  CreateWorkflowCase,
  CreateWorkflowRouteRule,
  ResolveWorkflowCase,
  SubmitWorkflowReview,
  UpdateWorkflowRouteRule,
  WorkflowArtifact,
  WorkflowCase,
  WorkflowReview,
  WorkflowRouteRule,
} from "@paperclipai/shared";
import { api } from "./client";

export interface WorkflowCaseBundle {
  workflowCase: WorkflowCase;
  artifacts: WorkflowArtifact[];
  reviews: WorkflowReview[];
}

export const workflowsApi = {
  listCases: (
    companyId: string,
    filters?: {
      status?: string;
      category?: string;
      kind?: string;
      requestedByAgentId?: string;
      linkedIssueId?: string;
      linkedApprovalId?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.kind) params.set("kind", filters.kind);
    if (filters?.requestedByAgentId) params.set("requestedByAgentId", filters.requestedByAgentId);
    if (filters?.linkedIssueId) params.set("linkedIssueId", filters.linkedIssueId);
    if (filters?.linkedApprovalId) params.set("linkedApprovalId", filters.linkedApprovalId);
    const qs = params.toString();
    return api.get<WorkflowCase[]>(`/companies/${companyId}/workflow-cases${qs ? `?${qs}` : ""}`);
  },
  createCase: (companyId: string, data: CreateWorkflowCase) =>
    api.post<WorkflowCase>(`/companies/${companyId}/workflow-cases`, data),
  getCase: (companyId: string, caseId: string) =>
    api.get<WorkflowCaseBundle>(`/companies/${companyId}/workflow-cases/${caseId}`),
  updateCase: (caseId: string, data: Partial<CreateWorkflowCase> & { status?: string }) =>
    api.patch<WorkflowCase>(`/workflow-cases/${caseId}`, data),
  listArtifacts: (caseId: string) =>
    api.get<WorkflowArtifact[]>(`/workflow-cases/${caseId}/artifacts`),
  createArtifact: (caseId: string, data: CreateWorkflowArtifact) =>
    api.post<WorkflowArtifact>(`/workflow-cases/${caseId}/artifacts`, data),
  listReviews: (caseId: string) =>
    api.get<WorkflowReview[]>(`/workflow-cases/${caseId}/reviews`),
  submitReview: (caseId: string, data: SubmitWorkflowReview) =>
    api.post<WorkflowReview>(`/workflow-cases/${caseId}/reviews`, data),
  approve: (caseId: string, data: ResolveWorkflowCase) =>
    api.post<WorkflowCase>(`/workflow-cases/${caseId}/approve`, data),
  reject: (caseId: string, data: ResolveWorkflowCase) =>
    api.post<WorkflowCase>(`/workflow-cases/${caseId}/reject`, data),
  listRouteRules: (companyId: string) =>
    api.get<WorkflowRouteRule[]>(`/companies/${companyId}/workflow-route-rules`),
  createRouteRule: (companyId: string, data: CreateWorkflowRouteRule) =>
    api.post<WorkflowRouteRule>(`/companies/${companyId}/workflow-route-rules`, data),
  updateRouteRule: (ruleId: string, data: UpdateWorkflowRouteRule) =>
    api.patch<WorkflowRouteRule>(`/workflow-route-rules/${ruleId}`, data),
};
