import type {
  WorkflowArtifactKind,
  WorkflowCaseStatus,
  WorkflowCaseKind,
  WorkflowCategory,
  WorkflowExecutionTarget,
  WorkflowReviewStatus,
} from "../constants.js";

export interface WorkflowRouteRule {
  id: string;
  companyId: string;
  category: WorkflowCategory;
  primaryReviewerRole: string;
  secondaryReviewerRole: string | null;
  finalApproverRole: string;
  boardApprovalRequired: boolean;
  executionTarget: WorkflowExecutionTarget;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowCase {
  id: string;
  companyId: string;
  kind: WorkflowCaseKind;
  category: WorkflowCategory;
  status: WorkflowCaseStatus;
  title: string;
  summary: string | null;
  details: Record<string, unknown>;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  requestedFromIssueId: string | null;
  linkedIssueId: string | null;
  linkedApprovalId: string | null;
  primaryReviewerRole: string;
  secondaryReviewerRole: string | null;
  finalApproverRole: string;
  boardApprovalRequired: boolean;
  executionTarget: WorkflowExecutionTarget;
  priority: string;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkflowIntake = WorkflowCase;

export interface WorkflowArtifact {
  id: string;
  companyId: string;
  workflowCaseId: string;
  kind: WorkflowArtifactKind;
  version: number;
  title: string;
  body: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  supersedesArtifactId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkflowBrief = WorkflowArtifact;

export interface WorkflowReview {
  id: string;
  companyId: string;
  workflowCaseId: string;
  artifactId: string | null;
  reviewerRole: string;
  reviewerAgentId: string | null;
  reviewerUserId: string | null;
  status: WorkflowReviewStatus;
  decisionNote: string | null;
  reviewSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDecision {
  id: string;
  companyId: string;
  intakeId: string;
  decision: string;
  decidedByAgentId: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  routeRuleSnapshot: Record<string, unknown>;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowHandoff {
  id: string;
  companyId: string;
  intakeId: string;
  decisionId: string | null;
  executionTarget: WorkflowExecutionTarget;
  linkedIssueId: string | null;
  linkedApprovalId: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
