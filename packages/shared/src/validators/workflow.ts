import { z } from "zod";
import {
  AGENT_ROLES,
  WORKFLOW_ARTIFACT_KINDS,
  WORKFLOW_CATEGORIES,
  WORKFLOW_CASE_STATUSES,
  WORKFLOW_CASE_KINDS,
  WORKFLOW_EXECUTION_TARGETS,
  WORKFLOW_REVIEW_STATUSES,
} from "../constants.js";

export const workflowCategorySchema = z.enum(WORKFLOW_CATEGORIES);
export const workflowCaseKindSchema = z.enum(WORKFLOW_CASE_KINDS);
export const workflowCaseStatusSchema = z.enum(WORKFLOW_CASE_STATUSES);
export const workflowArtifactKindSchema = z.enum(WORKFLOW_ARTIFACT_KINDS);
export const workflowReviewStatusSchema = z.enum(WORKFLOW_REVIEW_STATUSES);
export const workflowExecutionTargetSchema = z.enum(WORKFLOW_EXECUTION_TARGETS);

export const createWorkflowRouteRuleSchema = z.object({
  category: workflowCategorySchema,
  primaryReviewerRole: z.enum(AGENT_ROLES),
  secondaryReviewerRole: z.enum(AGENT_ROLES).optional().nullable(),
  finalApproverRole: z.enum(AGENT_ROLES),
  boardApprovalRequired: z.boolean().optional().default(false),
  executionTarget: workflowExecutionTargetSchema.optional().default("issue"),
  isEnabled: z.boolean().optional().default(true),
});

export type CreateWorkflowRouteRule = z.input<typeof createWorkflowRouteRuleSchema>;

export const updateWorkflowRouteRuleSchema = createWorkflowRouteRuleSchema.partial().extend({});

export type UpdateWorkflowRouteRule = z.input<typeof updateWorkflowRouteRuleSchema>;

export const createWorkflowCaseSchema = z.object({
  kind: workflowCaseKindSchema,
  category: workflowCategorySchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().max(10_000).optional().nullable(),
  details: z.record(z.unknown()).optional().default({}),
  requestedByAgentId: z.string().uuid().optional().nullable(),
  requestedByUserId: z.string().trim().max(128).optional().nullable(),
  requestedFromIssueId: z.string().uuid().optional().nullable(),
  primaryReviewerRole: z.enum(AGENT_ROLES).optional().nullable(),
  secondaryReviewerRole: z.enum(AGENT_ROLES).optional().nullable(),
  finalApproverRole: z.enum(AGENT_ROLES).optional().nullable(),
  boardApprovalRequired: z.boolean().optional().default(false),
  executionTarget: workflowExecutionTargetSchema.optional().default("issue"),
  priority: z.enum(["critical", "high", "medium", "low"]).optional().default("medium"),
  dueAt: z.string().datetime().optional().nullable(),
});

export type CreateWorkflowCase = z.input<typeof createWorkflowCaseSchema>;

export const updateWorkflowCaseSchema = createWorkflowCaseSchema.partial().extend({
  status: workflowCaseStatusSchema.optional(),
});

export type UpdateWorkflowCase = z.input<typeof updateWorkflowCaseSchema>;

export const createWorkflowArtifactSchema = z.object({
  kind: workflowArtifactKindSchema,
  title: z.string().trim().min(1),
  body: z.string().min(1),
  supersedesArtifactId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateWorkflowArtifact = z.input<typeof createWorkflowArtifactSchema>;

export const submitWorkflowReviewSchema = z.object({
  reviewerRole: z.enum(AGENT_ROLES),
  reviewerAgentId: z.string().uuid().optional().nullable(),
  reviewerUserId: z.string().trim().max(128).optional().nullable(),
  artifactId: z.string().uuid().optional().nullable(),
  status: workflowReviewStatusSchema,
  decisionNote: z.string().trim().max(10_000).optional().nullable(),
  reviewSummary: z.string().trim().max(10_000).optional().nullable(),
});

export type SubmitWorkflowReview = z.input<typeof submitWorkflowReviewSchema>;

export const resolveWorkflowCaseSchema = z.object({
  approverRole: z.enum(AGENT_ROLES),
  decisionNote: z.string().trim().max(10_000).optional().nullable(),
});

export type ResolveWorkflowCase = z.input<typeof resolveWorkflowCaseSchema>;
